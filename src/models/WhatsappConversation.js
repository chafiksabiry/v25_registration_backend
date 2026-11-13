import mongoose from 'mongoose';

/**
 * Historique de la conversation WhatsApp d'un numéro avec l'agent IA.
 * `messages` suit le format de l'API Messages de Claude (role + content, éventuellement des blocs tool_use / tool_result).
 */
const whatsappConversationSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, index: true }, // numéro WhatsApp, chiffres uniquement
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  messages: { type: [mongoose.Schema.Types.Mixed], default: [] },
  processedMessageIds: { type: [String], default: [] }, // dédoublonnage des webhooks Meta
  escalated: { type: Boolean, default: false },
  escalationReason: { type: String, default: '' },
  escalatedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('WhatsappConversation', whatsappConversationSchema);
