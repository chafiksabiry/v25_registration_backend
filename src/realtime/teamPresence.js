import { WebSocketServer } from 'ws';
import companyMemberService from '../services/companyMemberService.js';

const rooms = new Map();
const onlineUsers = new Map();

function roomKey(companyId) {
  return String(companyId);
}

function roomOf(companyId) {
  const key = roomKey(companyId);
  let room = rooms.get(key);
  if (!room) {
    room = new Set();
    rooms.set(key, room);
  }
  return room;
}

function onlineSet(companyId) {
  const key = roomKey(companyId);
  let set = onlineUsers.get(key);
  if (!set) {
    set = new Set();
    onlineUsers.set(key, set);
  }
  return set;
}

function send(socket, payload) {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload));
}

function broadcast(companyId, payload) {
  for (const socket of roomOf(companyId)) send(socket, payload);
}

export function attachTeamPresence(server) {
  const wss = new WebSocketServer({ server, path: '/ws/team-presence' });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30000);
  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', async (socket, req) => {
    const url = new URL(req.url || '', 'http://localhost');
    const userId = url.searchParams.get('userId');
    const companyId = url.searchParams.get('companyId');
    if (!userId || !companyId) {
      socket.close(1008, 'userId and companyId required');
      return;
    }

    let access;
    try {
      access = await companyMemberService.openPresence(userId, companyId);
    } catch {
      socket.close(1008, 'forbidden');
      return;
    }

    socket.isAlive = true;
    socket.userId = userId;
    socket.companyId = access.companyId;
    socket.role = access.role;
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    const room = roomOf(socket.companyId);
    room.add(socket);

    if (access.role === 'member') {
      onlineSet(socket.companyId).add(userId);
      broadcast(socket.companyId, {
        type: 'presence',
        companyId: socket.companyId,
        userId,
        online: true,
        status: access.status || 'active',
      });
    }

    send(socket, {
      type: 'presence_snapshot',
      companyId: socket.companyId,
      onlineUserIds: [...onlineSet(socket.companyId)],
    });

    socket.on('close', async () => {
      room.delete(socket);
      if (room.size === 0) rooms.delete(roomKey(socket.companyId));
      if (socket.role !== 'member') return;
      const stillHere = [...room].some((client) => client.userId === userId && client.role === 'member');
      if (stillHere) return;
      onlineSet(socket.companyId).delete(userId);
      await companyMemberService.markAway(userId);
      broadcast(socket.companyId, {
        type: 'presence',
        companyId: socket.companyId,
        userId,
        online: false,
        status: 'active',
      });
    });
  });

  return wss;
}
