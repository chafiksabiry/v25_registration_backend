import express from 'express';
import { 
  getUserDetails, 
  getUserIPHistory
} from '../controllers/userController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Routes pour les utilisateurs (toutes protégées par authentification)

// GET /api/users/:userId - Récupérer les détails d'un utilisateur
router.get('/:userId', getUserDetails);

// GET /api/users/:userId/ip-history - Récupérer l'historique IP d'un utilisateur
router.get('/:userId/ip-history', getUserIPHistory);

export default router; 