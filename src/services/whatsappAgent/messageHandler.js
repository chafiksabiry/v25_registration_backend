import WhatsappConversation from '../../models/WhatsappConversation.js';
import User from '../../models/User.js';
import { runAgent } from './agent.js';
import { trimHistory } from './history.js';
import { sendWhatsappText, markWhatsappRead } from './whatsappClient.js';

const MAX_TRACKED_IDS = 200;

/** Retrouve l'utilisateur HARX par numéro (best-effort, sert seulement à personnaliser). */
async function findUserByPhone(digits) {
  try {
    return await User.findOne({ phone: { $in: [digits, `+${digits}`] } }).select('fullName').lean();
  } catch {
    return null;
  }
}

/** Traite un message WhatsApp entrant : agent Claude → réponse WhatsApp. */
export async function handleIncomingMessage(msg) {
  const phone = String(msg.from || '').replace(/\D/g, '');
  if (!phone || !msg.id) return;

  // Dédoublonnage atomique : Meta peut renvoyer le même webhook. Si le message est déjà dans
  // processedMessageIds, le filtre ne matche pas et l'upsert échoue en doublon (11000) => on ignore.
  const claim = () => WhatsappConversation.findOneAndUpdate(
    { phone, processedMessageIds: { $ne: msg.id } },
    { $push: { processedMessageIds: { $each: [msg.id], $slice: -MAX_TRACKED_IDS } } },
    { new: true, upsert: true },
  );
  let current;
  try {
    current = await claim();
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Soit déjà traité, soit course à la création du document : un second essai tranche.
    try { current = await claim(); } catch (e) { if (e.code === 11000) return; throw e; }
  }

  await markWhatsappRead(msg.id);

  if (msg.type !== 'text' || !msg.text?.body) {
    await sendWhatsappText(phone, "Je ne peux lire que les messages texte pour le moment. Pouvez-vous décrire votre demande par écrit ?");
    return;
  }

  const user = current.userId ? null : await findUserByPhone(phone);
  if (user && !current.userId) await WhatsappConversation.updateOne({ _id: current._id }, { userId: user._id });

  const { reply, messages } = await runAgent({
    history: trimHistory(current.messages || []),
    text: msg.text.body,
    userName: user?.fullName?.split(' ')[0],
    onEscalate: async (reason) => {
      console.log(`[whatsapp-agent] ESCALADE ${phone}: ${reason}`);
      await WhatsappConversation.updateOne({ _id: current._id }, { escalated: true, escalationReason: reason, escalatedAt: new Date() });
    },
  });

  await WhatsappConversation.updateOne({ _id: current._id }, { messages: trimHistory(messages) });
  await sendWhatsappText(phone, reply);
}
