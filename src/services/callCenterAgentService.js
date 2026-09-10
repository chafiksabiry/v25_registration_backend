import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';

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
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('Server misconfiguration: Missing email credentials.');
  }

  const loginUrl =
    process.env.FRONTEND_URL ||
    process.env.VITE_FRONTEND_URL ||
    'https://v25.harx.ai';

  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const safeName = firstName || 'there';
  const org = companyName || 'your call center';

  const info = await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'HARX'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    replyTo: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
    to,
    subject: `You're invited to join ${org} on HARX`,
    html: `
      <div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
        <h1 style="font-size:22px;margin:0 0 12px;">Welcome to HARX</h1>
        <p style="margin:0 0 16px;line-height:1.5;">Hi ${safeName},</p>
        <p style="margin:0 0 16px;line-height:1.5;">
          ${org} created an agent account for you. Use the credentials below to sign in, then change your password.
        </p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:0 0 20px;">
          <p style="margin:0 0 8px;"><strong>Email:</strong> ${email}</p>
          <p style="margin:0;"><strong>Temporary password:</strong> ${tempPassword}</p>
        </div>
        <p style="margin:0 0 20px;">
          <a href="${loginUrl}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:700;">
            Sign in to HARX
          </a>
        </p>
        <p style="margin:0;font-size:12px;color:#64748b;">For security, change your password after your first login.</p>
      </div>
    `,
  });

  return info;
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
      firstName,
      lastName,
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
    if (!String(firstName || '').trim() || !String(lastName || '').trim()) {
      const err = new Error('First name and last name are required');
      err.statusCode = 400;
      throw err;
    }
    if (!String(phone || '').trim()) {
      const err = new Error('Phone number is required');
      err.statusCode = 400;
      throw err;
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      if (
        existing.employerCompanyId &&
        String(existing.employerCompanyId) === String(companyId)
      ) {
        const err = new Error('This agent is already on your team');
        err.statusCode = 409;
        throw err;
      }
      const err = new Error('Email already registered');
      err.statusCode = 409;
      throw err;
    }

    const tempPassword = generateTempPassword();
    const fullName = buildFullName(firstName, lastName);

    const user = new User({
      email: normalizedEmail,
      fullName,
      phone: String(phone).trim(),
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
      phone: String(phone).trim(),
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

    return users.map((u) => serializeAgentUser(u, agentByUser.get(String(u._id)) || null));
  }

  async resendInvite(callerUserId, companyId, agentUserId) {
    await resolveCallerCompany(callerUserId, companyId);

    if (!agentUserId || !mongoose.Types.ObjectId.isValid(agentUserId)) {
      const err = new Error('Valid agent userId is required');
      err.statusCode = 400;
      throw err;
    }

    const user = await User.findById(agentUserId);
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
