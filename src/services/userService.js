import User from '../models/User.js';
import Timezone from '../models/Timezone.js';

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



}

export default new UserService(); 