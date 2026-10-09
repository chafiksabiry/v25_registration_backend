import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import CompanyMembership from '../models/CompanyMembership.js';
import { companyMemberInviteEmail } from '../utils/harxMessages.js';
import { sendBrevoEmail } from './brevoMail.js';
import {
  allPermissions,
  emptyPermissions,
  presetPermissions,
  sanitizePermissions,
  PERMISSION_GROUPS,
} from '../constants/companyPermissions.js';

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

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function findCompany(companyId) {
  if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
    throw httpError('Valid companyId is required', 400);
  }
  const company = await mongoose.connection.db.collection('companies').findOne({
    _id: new mongoose.Types.ObjectId(companyId),
  });
  if (!company) throw httpError('Company not found', 404);
  return company;
}

function isOwner(company, userId) {
  return String(company.userId || '') === String(userId || '');
}

async function loadCaller(callerUserId) {
  if (!callerUserId || !mongoose.Types.ObjectId.isValid(callerUserId)) {
    throw httpError('Authentication required', 401);
  }
  const caller = await User.findById(callerUserId);
  if (!caller) throw httpError('Caller not found', 401);
  return caller;
}

async function assertCan(callerUserId, companyId, permission) {
  const caller = await loadCaller(callerUserId);
  const company = await findCompany(companyId);
  if (isOwner(company, caller._id)) {
    return { caller, company, isOwner: true, permissions: allPermissions() };
  }
  const membership = await CompanyMembership.findOne({
    companyId: company._id,
    userId: caller._id,
  });
  if (!membership || !membership.permissions?.[permission]) {
    throw httpError('You do not have permission to manage this company team', 403);
  }
  return {
    caller,
    company,
    isOwner: false,
    permissions: sanitizePermissions(membership.permissions),
  };
}

function companyLabel(company) {
  return company.name || company.companyName || company.title || 'HARX';
}

async function sendInviteEmail({ to, firstName, email, tempPassword, companyName }) {
  const shellBase = (
    process.env.FRONTEND_URL ||
    process.env.VITE_FRONTEND_URL ||
    'https://harx.ai'
  ).replace(/\/$/, '');
  const loginUrl = process.env.AGENT_INVITE_LOGIN_URL || `${shellBase}/auth/signin`;
  const message = companyMemberInviteEmail({
    firstName,
    email,
    tempPassword,
    companyName,
    loginUrl,
  });
  await sendBrevoEmail({
    to,
    subject: message.subject,
    html: message.html,
  });
}

function serializeMember(doc, user) {
  return {
    userId: String(doc.userId),
    email: doc.email || user?.email || '',
    fullName: doc.fullName || user?.fullName || '',
    phone: user?.phone || '',
    isOwner: false,
    preset: doc.preset || 'custom',
    status: doc.status || 'pending',
    permissions: sanitizePermissions(doc.permissions),
    invitedAt: doc.invitedAt || null,
    createdAt: doc.createdAt || null,
  };
}

class CompanyMemberService {
  catalog() {
    return {
      groups: PERMISSION_GROUPS,
      presets: ['admin', 'operator', 'readonly'],
    };
  }

  async session(callerUserId) {
    const caller = await loadCaller(callerUserId);
    const owned = await mongoose.connection.db.collection('companies').findOne({
      $or: [
        { userId: caller._id },
        { userId: String(caller._id) },
      ],
    });
    if (owned) {
      return {
        isOwner: true,
        companyId: String(owned._id),
        permissions: allPermissions(),
        preset: 'owner',
      };
    }
    const membership = await CompanyMembership.findOne({ userId: caller._id }).sort({ createdAt: -1 });
    // No membership document means the account is not a restricted teammate
    // (company owner, or a user created before team invites). Keep full access.
    if (!membership) {
      return { isOwner: true, companyId: null, permissions: allPermissions(), preset: 'owner' };
    }
    return {
      isOwner: false,
      companyId: String(membership.companyId),
      permissions: sanitizePermissions(membership.permissions),
      preset: membership.preset || 'custom',
    };
  }

  async list(callerUserId, companyId) {
    const { company } = await assertCan(callerUserId, companyId, 'members.view');
    const owner = await User.findById(company.userId).select('fullName email phone');
    const docs = await CompanyMembership.find({ companyId: company._id }).sort({ createdAt: -1 });
    const userIds = docs.map((d) => d.userId);
    const users = await User.find({ _id: { $in: userIds } }).select('fullName email phone');
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const ownerRow = {
      userId: String(company.userId || ''),
      email: owner?.email || '',
      fullName: owner?.fullName || 'Propriétaire',
      phone: owner?.phone || '',
      isOwner: true,
      preset: 'owner',
      status: 'active',
      permissions: allPermissions(),
      invitedAt: null,
      createdAt: null,
    };

    return [
      ownerRow,
      ...docs
        .filter((d) => String(d.userId) !== String(company.userId))
        .map((d) => serializeMember(d, byId.get(String(d.userId)))),
    ];
  }

  async invite(callerUserId, payload) {
    const {
      companyId,
      firstName,
      lastName,
      email,
      phone,
      preset = 'operator',
      permissions,
      sendEmail = true,
    } = payload || {};

    const { caller, company } = await assertCan(callerUserId, companyId, 'members.invite');
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      throw httpError('Valid email is required', 400);
    }
    const givenName = String(firstName || '').trim();
    const familyName = String(lastName || '').trim();
    if (!givenName) throw httpError('First name is required', 400);

    const resolvedPreset = presetPermissions(preset) ? String(preset).toLowerCase() : 'custom';
    const base = presetPermissions(preset) || emptyPermissions();
    const rights = permissions ? sanitizePermissions({ ...base, ...permissions }) : base;
    if (!Object.values(rights).some(Boolean)) {
      throw httpError('Select at least one permission', 400);
    }

    const existingUser = await User.findOne({ email: normalizedEmail }).select('_id');
    const existingMembership = await CompanyMembership.findOne({ email: normalizedEmail }).select('_id');
    if (existingUser || existingMembership) {
      throw httpError('Cet e-mail existe déjà. Invitation impossible.', 409);
    }

    const tempPassword = generateTempPassword();
    const user = new User({
      email: normalizedEmail,
      fullName: `${givenName} ${familyName}`.trim(),
      phone: String(phone || '').trim() || '0000000000',
      password: tempPassword,
      typeUser: 'company-member',
      isVerified: true,
      firstTime: true,
      mustChangePassword: true,
      invitationStatus: 'pending',
      invitedByUserId: caller._id,
      employerCompanyId: company._id,
    });
    await user.save();

    const membership = await CompanyMembership.create({
      companyId: company._id,
      userId: user._id,
      email: normalizedEmail,
      fullName: user.fullName || `${givenName} ${familyName}`.trim(),
      permissions: rights,
      preset: resolvedPreset,
      status: 'pending',
      invitedByUserId: caller._id,
    });

    let emailSent = false;
    let emailError = null;
    if (sendEmail) {
      try {
        await sendInviteEmail({
          to: normalizedEmail,
          firstName: givenName,
          email: normalizedEmail,
          tempPassword,
          companyName: companyLabel(company),
        });
        emailSent = true;
        membership.status = 'invited';
        membership.invitedAt = new Date();
        await membership.save();
        user.invitationStatus = 'invited';
        user.invitedAt = new Date();
        await user.save();
      } catch (e) {
        emailError = e.message || 'Failed to send invitation email';
      }
    }

    return {
      member: serializeMember(membership, user),
      emailSent,
      emailError,
      temporaryPassword: emailSent ? undefined : tempPassword,
    };
  }

  async reinvite(callerUserId, companyId, memberUserId, payload = {}) {
    const { company } = await assertCan(callerUserId, companyId, 'members.invite');
    if (String(company.userId) === String(memberUserId)) {
      throw httpError('The owner cannot be reinvited', 400);
    }
    if (!memberUserId || !mongoose.Types.ObjectId.isValid(memberUserId)) {
      throw httpError('Valid member userId is required', 400);
    }

    const membership = await CompanyMembership.findOne({
      companyId: company._id,
      userId: memberUserId,
    });
    if (!membership) throw httpError('Member not found', 404);

    const user = await User.findById(memberUserId);
    if (!user) throw httpError('Member not found', 404);
    if (user.invitationStatus === 'active') {
      throw httpError('Ce membre a déjà activé son compte.', 409);
    }

    const requestedEmail = payload?.email ? normalizeEmail(payload.email) : '';
    const currentEmail = normalizeEmail(user.email || membership.email);
    const targetEmail = requestedEmail || currentEmail;
    if (!targetEmail || !targetEmail.includes('@')) {
      throw httpError('Valid email is required', 400);
    }

    if (targetEmail !== currentEmail) {
      const takenUser = await User.findOne({ email: targetEmail, _id: { $ne: user._id } }).select('_id');
      const takenMembership = await CompanyMembership.findOne({
        email: targetEmail,
        userId: { $ne: user._id },
      }).select('_id');
      if (takenUser || takenMembership) {
        throw httpError('Cet e-mail existe déjà. Invitation impossible.', 409);
      }
      user.email = targetEmail;
      membership.email = targetEmail;
    }

    const tempPassword = generateTempPassword();
    const firstName = String(user.fullName || membership.fullName || '').trim().split(/\s+/)[0] || '';
    user.password = tempPassword;
    user.mustChangePassword = true;
    user.firstTime = true;
    user.invitationStatus = 'pending';
    membership.status = 'pending';
    await user.save();
    await membership.save();

    let emailSent = false;
    let emailError = null;
    try {
      await sendInviteEmail({
        to: targetEmail,
        firstName,
        email: targetEmail,
        tempPassword,
        companyName: companyLabel(company),
      });
      emailSent = true;
      membership.status = 'invited';
      membership.invitedAt = new Date();
      user.invitationStatus = 'invited';
      user.invitedAt = new Date();
      await user.save();
      await membership.save();
    } catch (e) {
      emailError = e.message || 'Failed to send invitation email';
    }

    return {
      member: serializeMember(membership, user),
      emailSent,
      emailError,
      temporaryPassword: emailSent ? undefined : tempPassword,
    };
  }

  async update(callerUserId, companyId, memberUserId, payload) {
    await assertCan(callerUserId, companyId, 'members.edit');
    const company = await findCompany(companyId);
    if (String(company.userId) === String(memberUserId)) {
      throw httpError('Owner permissions cannot be changed', 400);
    }
    const membership = await CompanyMembership.findOne({
      companyId: company._id,
      userId: memberUserId,
    });
    if (!membership) throw httpError('Member not found', 404);

    const preset = payload?.preset;
    const base = presetPermissions(preset) || sanitizePermissions(membership.permissions);
    membership.permissions = payload?.permissions
      ? sanitizePermissions({ ...base, ...payload.permissions })
      : base;
    membership.preset = presetPermissions(preset)
      ? String(preset).toLowerCase()
      : 'custom';
    await membership.save();
    const user = await User.findById(memberUserId).select('fullName email phone');
    return serializeMember(membership, user);
  }

  async remove(callerUserId, companyId, memberUserId) {
    await assertCan(callerUserId, companyId, 'members.remove');
    const company = await findCompany(companyId);
    if (String(company.userId) === String(memberUserId)) {
      throw httpError('The owner cannot be removed', 400);
    }
    const deleted = await CompanyMembership.findOneAndDelete({
      companyId: company._id,
      userId: memberUserId,
    });
    if (!deleted) throw httpError('Member not found', 404);
    return { userId: String(memberUserId) };
  }
}

export default new CompanyMemberService();
