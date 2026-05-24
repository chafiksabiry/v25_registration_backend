import express from 'express';
import {
  getUserDetails,
  getUserIPHistory,
  updateUserProfile,
  changeUserPassword
} from '../controllers/userController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Routes pour les utilisateurs (toutes protégées par authentification)

// GET /api/users/:userId - Récupérer les détails d'un utilisateur
router.get('/:userId', getUserDetails);

// PATCH /api/users/:userId - Mettre à jour fullName / phone
router.patch('/:userId', updateUserProfile);

// POST /api/users/:userId/change-password - Changer le mot de passe
router.post('/:userId/change-password', changeUserPassword);

// GET /api/users/:userId/ip-history - Récupérer l'historique IP d'un utilisateur
router.get('/:userId/ip-history', getUserIPHistory);

export default router; 