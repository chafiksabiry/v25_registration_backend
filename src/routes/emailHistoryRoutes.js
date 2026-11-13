import express from 'express';
import { knownEmails, recordEmails, updateStatuses } from '../controllers/emailHistoryController.js';

// Monte dans adminRoutes.js derriere authenticate + requireAdmin.
const router = express.Router();
router.post('/bulk', recordEmails);
router.patch('/status', updateStatuses);
router.post('/known', knownEmails);

export default router;
