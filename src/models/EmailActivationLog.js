import mongoose from 'mongoose';

/**
 * Journal des emails d'activation declenches depuis Zoho CRM
 * (case `Envoyer_R_activation` cochee -> workflow Zoho).
 *
 * Un document = un deal Zoho pour une campagne donnee. `deliveryConfirmed`
 * reste false tant qu'aucune source (webhook, rapport Zoho) n'a confirme la
 * delivrance : cocher la case ne prouve pas qu'un email est parti.
 */
const emailActivationLogSchema = new mongoose.Schema(
  {
    campaign: { type: String, required: true, trim: true, default: 'reps_activation' },
    zohoDealId: { type: String, required: true, trim: true },
    zohoContactId: { type: String, trim: true, default: null },
    email: { type: String, required: true, trim: true, lowercase: true },
    pipeline: { type: String, trim: true, default: null },
    stage: { type: String, trim: true, default: null },
    action: { type: String, trim: true, default: null },
    batch: { type: Number, min: 0, default: null },
    zohoUpdateStatus: { type: String, enum: ['SUCCESS', 'FAILED'], default: 'SUCCESS' },
    verifiedBy: { type: String, trim: true, default: null },
    deliveryStatus: {
      type: String,
      enum: ['unknown', 'delivered', 'bounced', 'opened', 'clicked', 'failed'],
      default: 'unknown',
    },
    deliveryConfirmed: { type: Boolean, default: false },
    source: { type: String, trim: true, default: null },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'email_activation_logs' }
);

emailActivationLogSchema.index({ campaign: 1, zohoDealId: 1 }, { unique: true });
emailActivationLogSchema.index({ email: 1 });
emailActivationLogSchema.index({ campaign: 1, batch: 1 });

export default mongoose.model('EmailActivationLog', emailActivationLogSchema);
