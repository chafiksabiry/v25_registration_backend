import express from 'express';
import {
  bulkUpsertEmailLogs,
  listEmailLogs,
  emailLogStats,
  updateDeliveryStatus,
} from '../controllers/emailLogController.js';

// L'authentification (authenticate + requireAdmin) est appliquee au montage,
// dans adminRoutes.js : toutes ces routes sont reservees aux administrateurs.
const router = express.Router();

router.post('/bulk', bulkUpsertEmailLogs);
router.get('/', listEmailLogs);
router.get('/stats', emailLogStats);
router.patch('/delivery', updateDeliveryStatus);

export default router;
