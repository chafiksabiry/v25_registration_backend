import mongoose from 'mongoose';

/**
 * Accès « portail client » : un contact d'un client du centre, invité en lecture seule.
 * Un compte = un client (sous-compte) : l'accès ne porte jamais que sur les opérations de CE client.
 */
const schema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    fullName: { type: String, trim: true, default: '' },
    /** Le client peut réécouter les enregistrements de ses appels : décidé par le centre, désactivé par défaut. */
    allowRecordings: { type: Boolean, default: false },
    status: { type: String, enum: ['invited', 'active', 'revoked'], default: 'invited' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId },
    invitedAt: { type: Date, default: Date.now },
    connectedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'callcenter_client_access' }
);

// Un compte ne dépend que d'un seul client : jamais deux accès pour la même personne.
schema.index({ userId: 1 }, { unique: true });
schema.index({ companyId: 1, clientId: 1 });

export default mongoose.models.CallCenterClientAccess || mongoose.model('CallCenterClientAccess', schema);
