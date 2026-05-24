import User from '../models/User.js';
import Timezone from '../models/Timezone.js';
import bcrypt from 'bcryptjs';

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




  // Update editable user profile fields (fullName, phone) — email is read-only here.
  async updateUserProfile(userId, { fullName, phone }) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const update = {};
    if (typeof fullName === 'string') {
      const trimmed = fullName.trim();
      if (trimmed.length < 2) {
        throw new Error('Full name must be at least 2 characters');
      }
      if (trimmed.length > 120) {
        throw new Error('Full name must be at most 120 characters');
      }
      update.fullName = trimmed;
    }
    if (typeof phone === 'string') {
      const trimmed = phone.trim();
      if (trimmed && (trimmed.length < 5 || trimmed.length > 32)) {
        throw new Error('Phone number must be between 5 and 32 characters');
      }
      update.phone = trimmed;
    }

    if (Object.keys(update).length === 0) {
      throw new Error('No editable field provided');
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: update },
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

  // Change the user password — checks the current password before applying.
  async changeUserPassword(userId, { currentPassword, newPassword }) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters');
    }
    if (newPassword.length > 128) {
      throw new Error('New password must be at most 128 characters');
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
      throw new Error('User not found');
    }

    // Users who registered via LinkedIn may not have a local password yet.
    if (user.password) {
      if (!currentPassword || typeof currentPassword !== 'string') {
        throw new Error('Current password is required');
      }
      const ok = await user.comparePassword(currentPassword);
      if (!ok) {
        throw new Error('Current password is incorrect');
      }
    }

    user.password = newPassword;
    await user.save();
    return { success: true };
  }
}

export default new UserService(); 