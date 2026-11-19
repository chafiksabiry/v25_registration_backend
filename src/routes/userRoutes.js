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
import { authenticate, authenticateUserOrService, requireSelf, requireSelfOrAdmin } from '../middleware/auth.js';

const router = express.Router();

// Every route of this file is about ONE account: its owner (JWT), an administrator, or — for the read only —
// another HARX backend with a service token of scope "registration-user-read".

// GET /api/users/:userId - Récupérer les détails d'un utilisateur
router.get('/:userId', authenticateUserOrService(['registration-user-read']), requireSelfOrAdmin, getUserDetails);

// PATCH /api/users/:userId - Mettre à jour fullName (email/phone/password ont leur propre flow)
router.patch('/:userId', authenticate, requireSelf, updateUserProfile);

// Email change with Brevo email confirmation
router.post('/:userId/email/request-change', authenticate, requireSelf, requestEmailChange);
router.post('/:userId/email/confirm-change', authenticate, requireSelf, confirmEmailChange);

// Password change with Brevo email confirmation
router.post('/:userId/password/request-change', authenticate, requireSelf, requestPasswordChange);
router.post('/:userId/password/confirm-change', authenticate, requireSelf, confirmPasswordChange);

// Phone change with Twilio OTP confirmation
router.post('/:userId/phone/request-change', authenticate, requireSelf, requestPhoneChange);
router.post('/:userId/phone/confirm-change', authenticate, requireSelf, confirmPhoneChange);

// Legacy endpoint kept for compatibility — now requires a code from the email flow
router.post('/:userId/change-password', authenticate, requireSelf, changeUserPassword);

// GET /api/users/:userId/ip-history - Récupérer l'historique IP d'un utilisateur
router.get('/:userId/ip-history', authenticate, requireSelfOrAdmin, getUserIPHistory);

export default router; 