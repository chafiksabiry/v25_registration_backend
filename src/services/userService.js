import User from '../models/User.js';
import Timezone from '../models/Timezone.js';
import bcrypt from 'bcryptjs';
import authService from './authService.js';

function generate6DigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

class UserService {
  
  // Récupérer les détails d'un utilisateur avec champs populés
  async getUserDetails(userId) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      // Récupérer l'utilisateur avec populate sur ipHistory.locationInfo.location
      const user = await User.findById(userId)
        .populate({
          path: 'ipHistory.locationInfo.location',
          model: 'Timezone',
          select: 'countryCode countryName zoneName gmtOffset' // Sélectionner les champs nécessaires
        })
        .select('-password -verificationCode') // Exclure les champs sensibles
        .lean(); // Optimisation pour la performance

      if (!user) {
        throw new Error('User not found');
      }

      // Retourner les informations utilisateur formatées
      return {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        linkedInId: user.linkedInId,
        isVerified: user.isVerified,
        typeUser: user.typeUser,
        firstTime: user.firstTime,
        createdAt: user.createdAt,
        ipHistory: user.ipHistory.map(entry => ({
          _id: entry._id,
          ip: entry.ip,
          timestamp: entry.timestamp,
          action: entry.action,
          locationInfo: entry.locationInfo ? {
            location: entry.locationInfo.location, // Populé avec les données Timezone
            region: entry.locationInfo.region,
            city: entry.locationInfo.city,
            isp: entry.locationInfo.isp,
            postal: entry.locationInfo.postal,
            coordinates: entry.locationInfo.coordinates
          } : null
        }))
      };
    } catch (error) {
      console.error('Error in getUserDetails:', error);
      throw new Error(`Failed to get user details: ${error.message}`);
    }
  }

  // Récupérer l'historique IP d'un utilisateur uniquement
  async getUserIPHistory(userId) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const user = await User.findById(userId)
        .populate({
          path: 'ipHistory.locationInfo.location',
          model: 'Timezone',
          select: 'countryCode countryName zoneName gmtOffset'
        })
        .select('ipHistory')
        .lean();

      if (!user) {
        throw new Error('User not found');
      }

      return user.ipHistory.map(entry => ({
        _id: entry._id,
        ip: entry.ip,
        timestamp: entry.timestamp,
        action: entry.action,
        locationInfo: entry.locationInfo ? {
          location: entry.locationInfo.location,
          region: entry.locationInfo.region,
          city: entry.locationInfo.city,
          isp: entry.locationInfo.isp,
          postal: entry.locationInfo.postal,
          coordinates: entry.locationInfo.coordinates
        } : null
      }));
    } catch (error) {
      console.error('Error in getUserIPHistory:', error);
      throw new Error(`Failed to get user IP history: ${error.message}`);
    }
  }




  // Update editable user profile fields (fullName only — email/phone/password
  // each have their own confirmation flow below).
  async updateUserProfile(userId, { fullName }) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    if (typeof fullName !== 'string') {
      throw new Error('No editable field provided');
    }

    const trimmed = fullName.trim();
    if (trimmed.length < 2) {
      throw new Error('Full name must be at least 2 characters');
    }
    if (trimmed.length > 120) {
      throw new Error('Full name must be at most 120 characters');
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { fullName: trimmed } },
      { new: true, runValidators: true }
    )
      .select('-password -verificationCode')
      .lean();

    if (!user) {
      throw new Error('User not found');
    }

    return {
      _id: user._id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      isVerified: user.isVerified,
      typeUser: user.typeUser,
      firstTime: user.firstTime,
      createdAt: user.createdAt
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // EMAIL CHANGE — 2 steps, code sent via Brevo SMTP to the NEW email.
  // ──────────────────────────────────────────────────────────────────────────
  async requestEmailChange(userId, { newEmail }) {
    if (!userId) throw new Error('User ID is required');
    const trimmed = (newEmail || '').trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new Error('Invalid email address');
    }

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    if (user.email === trimmed) {
      throw new Error('New email must differ from the current one');
    }

    const conflict = await User.findOne({ email: trimmed, _id: { $ne: user._id } });
    if (conflict) {
      throw new Error('This email is already used by another account');
    }

    const code = generate6DigitCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    user.pendingChanges = user.pendingChanges || {};
    user.pendingChanges.emailChange = { newEmail: trimmed, code, expiresAt };
    await user.save();

    await authService.sendVerificationEmail(trimmed, code);
    return { success: true, message: 'Verification code sent to the new email' };
  }

  async confirmEmailChange(userId, { code }) {
    if (!userId) throw new Error('User ID is required');
    if (!code || typeof code !== 'string') throw new Error('Verification code is required');

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const pending = user.pendingChanges?.emailChange;
    if (!pending?.newEmail || !pending?.code) {
      throw new Error('No pending email change found — request a new code');
    }
    if (pending.expiresAt && new Date() > pending.expiresAt) {
      throw new Error('Verification code has expired — request a new one');
    }
    if (String(pending.code) !== String(code).trim()) {
      throw new Error('Invalid verification code');
    }

    user.email = pending.newEmail;
    user.pendingChanges.emailChange = undefined;
    await user.save();

    return {
      success: true,
      data: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PASSWORD CHANGE — 2 steps, code sent via Brevo SMTP to the CURRENT email.
  // ──────────────────────────────────────────────────────────────────────────
  async requestPasswordChange(userId) {
    if (!userId) throw new Error('User ID is required');

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    if (!user.email) throw new Error('No email registered on this account');

    const code = generate6DigitCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    user.pendingChanges = user.pendingChanges || {};
    user.pendingChanges.passwordChange = { code, expiresAt };
    await user.save();

    await authService.sendVerificationEmail(user.email, code);
    return { success: true, message: 'Verification code sent to your current email' };
  }

  async confirmPasswordChange(userId, { currentPassword, newPassword, code }) {
    if (!userId) throw new Error('User ID is required');
    if (!code || typeof code !== 'string') throw new Error('Verification code is required');
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters');
    }
    if (newPassword.length > 128) {
      throw new Error('New password must be at most 128 characters');
    }

    const user = await User.findById(userId).select('+password');
    if (!user) throw new Error('User not found');

    const pending = user.pendingChanges?.passwordChange;
    if (!pending?.code) {
      throw new Error('No pending password change found — request a new code');
    }
    if (pending.expiresAt && new Date() > pending.expiresAt) {
      throw new Error('Verification code has expired — request a new one');
    }
    if (String(pending.code) !== String(code).trim()) {
      throw new Error('Invalid verification code');
    }

    if (user.password) {
      if (!currentPassword || typeof currentPassword !== 'string') {
        throw new Error('Current password is required');
      }
      const ok = await user.comparePassword(currentPassword);
      if (!ok) throw new Error('Current password is incorrect');
    }

    user.password = newPassword;
    user.pendingChanges.passwordChange = undefined;
    await user.save();

    return { success: true };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PHONE CHANGE — 2 steps, OTP sent via Twilio SMS to the NEW phone.
  // ──────────────────────────────────────────────────────────────────────────
  async requestPhoneChange(userId, { newPhone }) {
    if (!userId) throw new Error('User ID is required');
    const trimmed = (newPhone || '').trim();
    if (!trimmed || trimmed.length < 5 || trimmed.length > 32) {
      throw new Error('Phone number must be between 5 and 32 characters');
    }
    if (!/^\+?[0-9\s().-]{5,32}$/.test(trimmed)) {
      throw new Error('Invalid phone number format');
    }

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const otp = generate6DigitCode();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    user.pendingChanges = user.pendingChanges || {};
    user.pendingChanges.phoneChange = { newPhone: trimmed, otp, otpExpiresAt };
    await user.save();

    // Re-use the authService SMS helper but pass the target phone + freshly-stored otp.
    // We don't call sendOTPWithTwilio here because it writes a NEW otp into
    // verificationCode (used by login). Instead, we send directly via Twilio.
    const twilio = (await import('twilio')).default;
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      throw new Error('Server misconfiguration: Missing SMS credentials');
    }
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: `HARX — Your phone verification code is: ${otp}`,
      to: trimmed,
      from: process.env.TWILIO_PHONE_NUMBER
    });

    return { success: true, message: 'OTP sent to the new phone number' };
  }

  async confirmPhoneChange(userId, { otp }) {
    if (!userId) throw new Error('User ID is required');
    if (!otp || typeof otp !== 'string') throw new Error('OTP is required');

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const pending = user.pendingChanges?.phoneChange;
    if (!pending?.newPhone || !pending?.otp) {
      throw new Error('No pending phone change found — request a new code');
    }
    if (pending.otpExpiresAt && new Date() > pending.otpExpiresAt) {
      throw new Error('OTP has expired — request a new one');
    }
    if (String(pending.otp) !== String(otp).trim()) {
      throw new Error('Invalid OTP');
    }

    user.phone = pending.newPhone;
    user.pendingChanges.phoneChange = undefined;
    await user.save();

    return {
      success: true,
      data: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone
      }
    };
  }
}

export default new UserService(); 