import userService from '../services/userService.js';

// Contrôleur pour récupérer les détails d'un utilisateur
export const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User ID is required' 
      });
    }

    const userDetails = await userService.getUserDetails(userId);
    
    return res.status(200).json({
      success: true,
      data: userDetails,
      message: 'User details retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting user details:', error.message);
    
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve user details'
    });
  }
};

// Contrôleur pour mettre à jour le profil utilisateur (fullName, phone)
export const updateUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    const updated = await userService.updateUserProfile(userId, {
      fullName: req.body?.fullName,
      phone: req.body?.phone
    });

    return res.status(200).json({
      success: true,
      data: updated,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating user profile:', error.message);
    if (error.message === 'User not found') {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to update user profile'
    });
  }
};

// Contrôleur pour changer le mot de passe utilisateur
export const changeUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    await userService.changeUserPassword(userId, {
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword
    });

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Error changing user password:', error.message);
    if (error.message === 'User not found') {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (error.message === 'Current password is incorrect') {
      return res.status(401).json({ success: false, error: error.message });
    }
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to change password'
    });
  }
};

// Contrôleur pour récupérer l'historique IP d'un utilisateur
export const getUserIPHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User ID is required' 
      });
    }

    const ipHistory = await userService.getUserIPHistory(userId);
    
    return res.status(200).json({
      success: true,
      data: ipHistory,
      message: 'User IP history retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting user IP history:', error.message);
    
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve user IP history'
    });
  }
};

 