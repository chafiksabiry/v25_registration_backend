import express from 'express';
import rateLimit from 'express-rate-limit';
import { joinWaitlist } from '../services/countryWaitlistService.js';

const router = express.Router();

// Endpoint public qui envoie un e-mail : limité par adresse IP pour éviter qu'il serve à spammer.
router.use(rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }));

/** Public : une personne hors des pays ouverts laisse son adresse. */
router.post('/', async (req, res) => {
  try {
    const data = await joinWaitlist(req.body || {});
    res.status(data.created ? 201 : 200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Request failed' });
  }
});

export default router;
