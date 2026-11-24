import jwt from 'jsonwebtoken';
import { gateAccount } from '../services/accountGate.js';

/**
 * Every token of this service is signed with JWT_SECRET: there is no fallback secret. Without it, every
 * protected request is refused with a clear message (and src/index.js refuses to start).
 */
function jwtSecret(res) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[auth] JWT_SECRET is not set: refusing every protected request');
    res.status(500).json({ message: 'Authentication is not configured (JWT_SECRET missing)' });
    return null;
  }
  return secret;
}

function bearerToken(req) {
  const header = req.headers?.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

/** The account a user token belongs to, or null (service tokens carry no user). */
export function tokenUserId(decoded) {
  const id = decoded?.userId ?? decoded?.id ?? decoded?._id;
  return id ? String(id) : null;
}

export const authenticate = (req, res, next) => {
  try {
    const token = bearerToken(req);
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const secret = jwtSecret(res);
    if (!secret) return undefined;

    const decoded = jwt.verify(token, secret);
    // A service token (`{ scope }`, signed by another HARX backend) is not a person.
    if (!tokenUserId(decoded)) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const proceed = () => {
      // AUTH-11: a member still on their invite temp password must not reach
      // any other authenticated endpoint on this service — only changing the
      // password is allowed until the flag clears.
      if (decoded.mustChangePassword && req.path !== '/change-password') {
        return res.status(403).json({
          message: 'Password change required before continuing',
          code: 'PASSWORD_CHANGE_REQUIRED',
        });
      }

      req.user = decoded;
      return next();
    };

    // Compte désactivé ou supprimé : refusé tout de suite, même avec un jeton déjà émis (services/accountGate.js).
    return gateAccount(tokenUserId(decoded), res, next, proceed);
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

/**
 * A signed-in user, or another HARX backend with a short-lived service token `{ scope }` signed with JWT_SECRET
 * (same scheme as the knowledge base and the orchestrator). The scope must be listed by the route.
 */
export const authenticateUserOrService = (scopes = []) => (req, res, next) => {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  const secret = jwtSecret(res);
  if (!secret) return undefined;
  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
  if (!tokenUserId(decoded)) {
    if (decoded?.scope && scopes.includes(decoded.scope)) {
      req.service = decoded.scope;
      return next();
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
  return authenticate(req, res, next);
};

/** Reads a valid user token when there is one; never refuses (the route decides what an anonymous caller gets). */
export const optionalAuthenticate = (req, res, next) => {
  const token = bearerToken(req);
  const secret = process.env.JWT_SECRET;
  if (token && secret) {
    try {
      const decoded = jwt.verify(token, secret);
      if (tokenUserId(decoded)) req.user = decoded;
    } catch {
      // anonymous
    }
  }
  next();
};

const forbidden = (res) => res.status(403).json({
  success: false,
  code: 'forbidden',
  message: 'Accès refusé.',
});

// Le JWT (signé par authService : `userId`) doit appartenir au compte visé par :userId.
export const requireSelf = (req, res, next) => {
  const tokenId = tokenUserId(req.user);
  if (!tokenId || String(tokenId) !== String(req.params.userId)) {
    return forbidden(res);
  }
  next();
};

/** Le compte visé par :userId, ou un administrateur HARX. Un jeton de service accepté par la route passe aussi. */
export const requireSelfOrAdmin = (req, res, next) => {
  if (req.service) return next();
  if (req.user?.typeUser === 'admin') return next();
  return requireSelf(req, res, next);
};

/** Même règle pour un `userId` envoyé dans le corps de la requête. */
export const requireBodySelfOrAdmin = (req, res, next) => {
  if (req.user?.typeUser === 'admin') return next();
  const tokenId = tokenUserId(req.user);
  if (!tokenId || String(tokenId) !== String(req.body?.userId ?? '')) {
    return forbidden(res);
  }
  next();
};
