import express from 'express';
import {
  getUserDetails,
  getUserIPHistory,
  updateUserProfile,
  changeUserPassword,
  requestEmailChange,
  confirmEmailChange,
  requestPasswordChange,
  confirmPasswordChange,
  requestPhoneChange,
  confirmPhoneChange
} from '../controllers/userController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET /api/users/:userId - Récupérer les détails d'un utilisateur
router.get('/:userId', getUserDetails);

// PATCH /api/users/:userId - Mettre à jour fullName (email/phone/password ont leur propre flow)
router.patch('/:userId', updateUserProfile);

// Email change with Brevo email confirmation
router.post('/:userId/email/request-change', requestEmailChange);
router.post('/:userId/email/confirm-change', confirmEmailChange);

// Password change with Brevo email confirmation
router.post('/:userId/password/request-change', requestPasswordChange);
router.post('/:userId/password/confirm-change', confirmPasswordChange);

// Phone change with Twilio OTP confirmation
router.post('/:userId/phone/request-change', requestPhoneChange);
router.post('/:userId/phone/confirm-change', confirmPhoneChange);

// Legacy endpoint kept for compatibility — now requires a code from the email flow
router.post('/:userId/change-password', changeUserPassword);

// GET /api/users/:userId/ip-history - Récupérer l'historique IP d'un utilisateur
router.get('/:userId/ip-history', getUserIPHistory);

export default router; 