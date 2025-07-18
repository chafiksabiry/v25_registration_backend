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

 