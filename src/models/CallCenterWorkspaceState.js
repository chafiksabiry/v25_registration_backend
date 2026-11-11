import mongoose from 'mongoose';

/**
 * Avancement et réglages du portail Call Centre qui ne sont portés par aucune autre donnée : files d'attente, étapes de
 * mise en route, lignes testées (portée `company`, partagée par tout le centre), et progression personnelle (portée
 * `user` : académie, message de bienvenue). Sans cela, ils restaient dans le navigateur et disparaissaient à chaque
 * nouveau navigateur ou appareil.
 */
const schema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    scope: { type: String, enum: ['company', 'user'], required: true },
    /** Renseigné pour la portée `user`, null pour `company`. */
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'callcenter_workspace_state' }
);

schema.index({ companyId: 1, scope: 1, userId: 1 }, { unique: true });

export default mongoose.models.CallCenterWorkspaceState || mongoose.model('CallCenterWorkspaceState', schema);
