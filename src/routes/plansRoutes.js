import express from 'express';
import { getPublicCompanyPlans, getPublicRepPlans } from '../controllers/plansController.js';

const router = express.Router();

router.get('/company', getPublicCompanyPlans);
router.get('/rep', getPublicRepPlans);

export default router;
