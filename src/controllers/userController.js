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

function handleControllerError(res, error, defaultMessage) {
  console.error(defaultMessage + ':', error.message);
  if (error.message === 'User not found') {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  if (
    error.message === 'Current password is incorrect' ||
    error.message === 'Invalid verification code' ||
    error.message === 'Invalid OTP'
  ) {
    return res.status(401).json({ success: false, error: error.message });
  }
  return res.status(400).json({
    success: false,
    error: error.message || defaultMessage
  });
}

// PATCH /api/users/:userId — fullName only (email/phone/password use the
// dedicated confirmation flows below).
export const updateUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }
    const updated = await userService.updateUserProfile(userId, {
      fullName: req.body?.fullName
    });
    return res.status(200).json({
      success: true,
      data: updated,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    return handleControllerError(res, error, 'Error updating user profile');
  }
};

// EMAIL CHANGE — Brevo
export const requestEmailChange = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await userService.requestEmailChange(userId, {
      newEmail: req.body?.newEmail
    });
    return res.status(200).json(result);
  } catch (error) {
    return handleControllerError(res, error, 'Error requesting email change');
  }
};

export const confirmEmailChange = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await userService.confirmEmailChange(userId, {
      code: req.body?.code
    });
    return res.status(200).json({ ...result, message: 'Email updated successfully' });
  } catch (error) {
    return handleControllerError(res, error, 'Error confirming email change');
  }
};

// PASSWORD CHANGE — Brevo
export const requestPasswordChange = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await userService.requestPasswordChange(userId);
    return res.status(200).json(result);
  } catch (error) {
    return handleControllerError(res, error, 'Error requesting password change');
  }
};

export const confirmPasswordChange = async (req, res) => {
  try {
    const { userId } = req.params;
    await userService.confirmPasswordChange(userId, {
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword,
      code: req.body?.code
    });
    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    return handleControllerError(res, error, 'Error confirming password change');
  }
};

// PHONE CHANGE — Twilio OTP
export const requestPhoneChange = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await userService.requestPhoneChange(userId, {
      newPhone: req.body?.newPhone
    });
    return res.status(200).json(result);
  } catch (error) {
    return handleControllerError(res, error, 'Error requesting phone change');
  }
};

export const confirmPhoneChange = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await userService.confirmPhoneChange(userId, {
      otp: req.body?.otp
    });
    return res.status(200).json({ ...result, message: 'Phone updated successfully' });
  } catch (error) {
    return handleControllerError(res, error, 'Error confirming phone change');
  }
};

// Kept for backward compatibility with any caller still using the legacy
// one-shot password change endpoint. The new flow uses request/confirm above.
export const changeUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    await userService.confirmPasswordChange(userId, {
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword,
      code: req.body?.code
    });
    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    return handleControllerError(res, error, 'Error changing user password');
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

 