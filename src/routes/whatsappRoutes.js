import express from 'express';
import { verifyWebhook, receiveWebhook } from '../controllers/whatsappWebhookController.js';

const router = express.Router();

// Webhook Meta WhatsApp Cloud API (URL à déclarer chez Meta : https://<hôte>/api/whatsapp/webhook)
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

export default router;
