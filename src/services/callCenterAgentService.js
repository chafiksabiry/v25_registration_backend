import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import AgentInvitation from '../models/AgentInvitation.js';
import { agentInvitationNoticeEmail, inviteEmail } from '../utils/harxMessages.js';
import { appLoginUrl, sendAppEmail } from './brevoMail.js';

function generateTempPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function buildFullName(firstName, lastName) {
  return `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
}

async function resolveCallerCompany(callerUserId, companyId) {
  if (!callerUserId) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }
  if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
    const err = new Error('Valid companyId is required');
    err.statusCode = 400;
    throw err;
  }

  const caller = await User.findById(callerUserId);
  if (!caller) {
    const err = new Error('Caller not found');
    err.statusCode = 401;
    throw err;
  }
  if (caller.typeUser !== 'call-center' && caller.typeUser !== 'company') {
    const err = new Error('Only call-center accounts can manage staff agents');
    err.statusCode = 403;
    throw err;
  }

  const db = mongoose.connection.db;
  const company = await db.collection('companies').findOne({
    _id: new mongoose.Types.ObjectId(companyId),
  });
  if (!company) {
    const err = new Error('Company not found');
    err.statusCode = 404;
    throw err;
  }
  if (String(company.userId) !== String(callerUserId)) {
    const err = new Error('You do not own this company');
    err.statusCode = 403;
    throw err;
  }

  return { caller, company };
}

async function ensureAgentProfile(user, { firstName, lastName, email, phone, companyId }) {
  const db = mongoose.connection.db;
  const existing = await db.collection('agents').findOne({ userId: user._id });
  const fullName = buildFullName(firstName, lastName) || user.fullName;
  const now = new Date();

  if (existing) {
    await db.collection('agents').updateOne(
      { _id: existing._id },
      {
        $set: {
          employerCompanyId: new mongoose.Types.ObjectId(companyId),
          'personalInfo.name': fullName,
          'personalInfo.email': email,
          'personalInfo.phone': phone,
          updatedAt: now,
        },
      }
    );
    return String(existing._id);
  }

  const inserted = await db.collection('agents').insertOne({
    userId: user._id,
    employerCompanyId: new mongoose.Types.ObjectId(companyId),
    status: 'draft',
    isBasicProfileCompleted: true,
    personalInfo: {
      name: fullName,
      email,
      phone,
    },
    onboardingProgress: {
      currentPhase: 1,
      phases: {
        phase1: {
          status: 'completed',
          requiredActions: {
            accountCreated: true,
            emailVerified: true,
          },
          completedAt: now,
        },
      },
    },
    createdAt: now,
    updatedAt: now,
  });

  return String(inserted.insertedId);
}

async function sendInviteEmail({
  to,
  firstName,
  email,
  tempPassword,
  companyName,
}) {
  const loginUrl = appLoginUrl();

  const message = inviteEmail({
    firstName,
    email,
    tempPassword,
    companyName,
    loginUrl,
  });

  return sendAppEmail({
    to,
    subject: message.subject,
    html: message.html,
  });
}

async function sendInvitationNotice({ user, company }) {
  const firstName = (user.fullName || '').trim().split(/\s+/)[0] || '';
  const message = agentInvitationNoticeEmail({
    firstName,
    companyName: company?.name || company?.companyName || company?.title,
    loginUrl: appLoginUrl(),
  });
  return sendAppEmail({ to: user.email, subject: message.subject, html: message.html });
}

function serializeAgentUser(user, agentId = null) {
  return {
    userId: String(user._id),
    agentId,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone || '',
    typeUser: user.typeUser,
    employerCompanyId: user.employerCompanyId ? String(user.employerCompanyId) : null,
    mustChangePassword: Boolean(user.mustChangePassword),
    invitationStatus: user.invitationStatus || 'none',
    invitedAt: user.invitedAt || null,
    isVerified: Boolean(user.isVerified),
    createdAt: user.createdAt,
  };
}

class CallCenterAgentService {
  async createAndInvite(callerUserId, payload) {
    const {
      companyId,
      firstName: givenFirstName,
      lastName: givenLastName,
      email,
      phone,
      sendEmail = true,
    } = payload || {};

    const { caller, company } = await resolveCallerCompany(callerUserId, companyId);

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      const err = new Error('Valid email is required');
      err.statusCode = 400;
      throw err;
    }
    // An invitation by email may come without names (the agent completes them later): use the part before the @.
    const firstName = String(givenFirstName || '').trim() || normalizedEmail.split('@')[0];
    const lastName = String(givenLastName || '').trim();
    // The phone number is optional for an invitation by email: the agent adds it when they first sign in.
    const phoneValue = String(phone || '').trim();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      if (existing.employerCompanyId && String(existing.employerCompanyId) === String(companyId)) {
        const err = new Error('This agent is already on your team');
        err.statusCode = 409;
        throw err;
      }
      // An address has at most one HARX account but can be invited by any number of call centres:
      // the person accepts after signing in, so nothing about the account is created or changed here.
      return this.inviteExistingAccount({ caller, company, companyId, existing, sendEmail });
    }

    const tempPassword = generateTempPassword();
    const fullName = buildFullName(firstName, lastName);

    const user = new User({
      email: normalizedEmail,
      fullName,
      phone: phoneValue,
      password: tempPassword,
      typeUser: 'rep',
      isVerified: true,
      firstTime: true,
      mustChangePassword: true,
      employerCompanyId: companyId,
      invitationStatus: 'pending',
      invitedByUserId: caller._id,
    });
    await user.save();

    const agentId = await ensureAgentProfile(user, {
      firstName,
      lastName,
      email: normalizedEmail,
      phone: phoneValue,
      companyId,
    });

    let emailSent = false;
    let emailError = null;
    if (sendEmail) {
      try {
        await sendInviteEmail({
          to: normalizedEmail,
          firstName: String(firstName).trim(),
          email: normalizedEmail,
          tempPassword,
          companyName: company.name || company.companyName || company.title,
        });
        emailSent = true;
        user.invitationStatus = 'invited';
        user.invitedAt = new Date();
        await user.save();
      } catch (e) {
        emailError = e.message || 'Failed to send invitation email';
        user.invitationStatus = 'pending';
        await user.save();
      }
    }

    return {
      agent: serializeAgentUser(user, agentId),
      emailSent,
      emailError,
      // Only returned once at creation time for UI copy if email failed.
      temporaryPassword: emailSent ? undefined : tempPassword,
    };
  }

  async inviteExistingAccount({ caller, company, companyId, existing, sendEmail }) {
    const email = normalizeEmail(existing.email);
    let invitation = await AgentInvitation.findOne({ companyId, email });
    if (invitation && invitation.status === 'accepted') {
      const err = new Error('This agent is already on your team');
      err.statusCode = 409;
      throw err;
    }
    if (invitation) {
      invitation.status = 'pending';
      invitation.invitedAt = new Date();
      invitation.respondedAt = undefined;
      invitation.userId = existing._id;
      invitation.invitedByUserId = caller._id;
      await invitation.save();
    } else {
      invitation = await AgentInvitation.create({
        companyId,
        email,
        userId: existing._id,
        invitedByUserId: caller._id,
      });
    }

    let emailSent = false;
    let emailError = null;
    if (sendEmail) {
      try {
        await sendInvitationNotice({ user: existing, company });
        emailSent = true;
      } catch (e) {
        emailError = e.message || 'Failed to send invitation email';
      }
    }

    return {
      agent: {
        ...serializeAgentUser(existing),
        employerCompanyId: null,
        invitationStatus: 'invited',
        invitedAt: invitation.invitedAt,
        existingAccount: true,
      },
      invitationId: String(invitation._id),
      existingAccount: true,
      emailSent,
      emailError,
    };
  }

  async listAgents(callerUserId, companyId) {
    await resolveCallerCompany(callerUserId, companyId);
    const users = await User.find({
      employerCompanyId: companyId,
      typeUser: 'rep',
    })
      .sort({ createdAt: -1 })
      .select('-password -verificationCode -pendingChanges');

    const db = mongoose.connection.db;
    const userIds = users.map((u) => u._id);
    const agents = await db
      .collection('agents')
      .find({ userId: { $in: userIds } })
      .project({ _id: 1, userId: 1 })
      .toArray();
    const agentByUser = new Map(agents.map((a) => [String(a.userId), String(a._id)]));

    const staff = users.map((u) => serializeAgentUser(u, agentByUser.get(String(u._id)) || null));

    // People who already had a HARX account are linked through an invitation they accept after signing in.
    const invitations = await AgentInvitation.find({ companyId, status: { $in: ['pending', 'accepted'] } }).sort({ invitedAt: -1 });
    const invitedUsers = await User.find({ _id: { $in: invitations.map((i) => i.userId).filter(Boolean) } }).select(
      '-password -verificationCode -pendingChanges'
    );
    const userById = new Map(invitedUsers.map((u) => [String(u._id), u]));
    const invited = invitations
      .filter((i) => i.userId && userById.has(String(i.userId)))
      .map((i) => ({
        ...serializeAgentUser(userById.get(String(i.userId))),
        employerCompanyId: i.status === 'accepted' ? String(companyId) : null,
        invitationStatus: i.status === 'accepted' ? 'active' : 'invited',
        invitedAt: i.invitedAt,
        existingAccount: true,
      }));
    return [...staff, ...invited];
  }

  /** Pending invitations addressed to the signed-in person's e-mail. */
  async listMyInvitations(userId) {
    const user = await User.findById(userId).select('email');
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 401;
      throw err;
    }
    const invitations = await AgentInvitation.find({ email: normalizeEmail(user.email), status: 'pending' }).sort({ invitedAt: -1 });
    const db = mongoose.connection.db;
    const companies = await db
      .collection('companies')
      .find({ _id: { $in: invitations.map((i) => i.companyId) } })
      .project({ name: 1, companyName: 1, title: 1 })
      .toArray();
    const nameById = new Map(companies.map((c) => [String(c._id), c.name || c.companyName || c.title || '']));
    return invitations.map((i) => ({
      id: String(i._id),
      companyId: String(i.companyId),
      companyName: nameById.get(String(i.companyId)) || '',
      invitedAt: i.invitedAt,
    }));
  }

  async respondToInvitation(userId, invitationId, accept) {
    if (!invitationId || !mongoose.Types.ObjectId.isValid(invitationId)) {
      const err = new Error('Valid invitation id is required');
      err.statusCode = 400;
      throw err;
    }
    const user = await User.findById(userId).select('email');
    const invitation = user ? await AgentInvitation.findById(invitationId) : null;
    if (!user || !invitation || invitation.email !== normalizeEmail(user.email)) {
      const err = new Error('Invitation not found');
      err.statusCode = 404;
      throw err;
    }
    invitation.status = accept ? 'accepted' : 'declined';
    invitation.userId = user._id;
    invitation.respondedAt = new Date();
    await invitation.save();
    return { id: String(invitation._id), companyId: String(invitation.companyId), status: invitation.status };
  }

  async resendInvite(callerUserId, companyId, agentUserId) {
    await resolveCallerCompany(callerUserId, companyId);

    if (!agentUserId || !mongoose.Types.ObjectId.isValid(agentUserId)) {
      const err = new Error('Valid agent userId is required');
      err.statusCode = 400;
      throw err;
    }

    const user = await User.findById(agentUserId);

    // Existing HARX account invited by e-mail: remind them to sign in, never touch their password.
    if (user && String(user.employerCompanyId) !== String(companyId)) {
      const invitation = await AgentInvitation.findOne({ companyId, email: normalizeEmail(user.email) });
      if (invitation && invitation.status !== 'accepted') {
        const dbForNotice = mongoose.connection.db;
        const companyForNotice = await dbForNotice.collection('companies').findOne({
          _id: new mongoose.Types.ObjectId(companyId),
        });
        invitation.status = 'pending';
        invitation.invitedAt = new Date();
        await invitation.save();
        await sendInvitationNotice({ user, company: companyForNotice });
        return {
          agent: { ...serializeAgentUser(user), employerCompanyId: null, invitationStatus: 'invited', existingAccount: true },
          emailSent: true,
        };
      }
    }

    if (!user || String(user.employerCompanyId) !== String(companyId)) {
      const err = new Error('Agent not found on this call center');
      err.statusCode = 404;
      throw err;
    }

    const tempPassword = generateTempPassword();
    user.password = tempPassword;
    user.mustChangePassword = true;
    user.invitationStatus = 'invited';
    user.invitedAt = new Date();
    await user.save();

    const firstName = (user.fullName || '').trim().split(/\s+/)[0] || 'there';
    const db = mongoose.connection.db;
    const company = await db.collection('companies').findOne({
      _id: new mongoose.Types.ObjectId(companyId),
    });

    await sendInviteEmail({
      to: user.email,
      firstName,
      email: user.email,
      tempPassword,
      companyName: company?.name || company?.companyName || company?.title,
    });

    const agent = await db.collection('agents').findOne({ userId: user._id });
    return {
      agent: serializeAgentUser(user, agent ? String(agent._id) : null),
      emailSent: true,
    };
  }
}

export default new CallCenterAgentService();
