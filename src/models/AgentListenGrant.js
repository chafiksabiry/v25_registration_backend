import mongoose from 'mongoose';

/**
 * Décision du titulaire sur l'écoute des enregistrements d'appels pour UN agent (secrétaire) de SON centre. Les droits
 * d'un agent sont calculés (agentPermissions) ; ce document est la seule exception enregistrée. Sans document : défaut
 * de l'offre (Accueil : pas d'écoute ; autres offres : écoute).
 */
const agentListenGrantSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    listen: { type: Boolean, required: true },
    decidedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

agentListenGrantSchema.index({ companyId: 1, userId: 1 }, { unique: true });

export default mongoose.models.AgentListenGrant || mongoose.model('AgentListenGrant', agentListenGrantSchema);
