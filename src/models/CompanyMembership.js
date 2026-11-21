import mongoose from 'mongoose';

const companyMembershipSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  fullName: {
    type: String,
    default: '',
    trim: true,
  },
  permissions: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  preset: {
    type: String,
    enum: ['admin', 'operator', 'readonly', 'custom'],
    default: 'custom',
  },
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  roleName: {
    type: String,
    default: '',
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'invited', 'active'],
    default: 'pending',
  },
  /**
   * Date à laquelle le titulaire (ou un admin de l'équipe) a accordé l'écoute des enregistrements à ce membre. Sur
   * l'offre Accueil, `permissions['calls.listen']` ne compte que si cette date est posée (ou profil admin).
   */
  listenGrantedAt: {
    type: Date,
    default: null,
  },
  /** Date à laquelle le titulaire a retiré l'écoute (sert pour un admin, qui écoute par défaut). */
  listenRevokedAt: {
    type: Date,
    default: null,
  },
  invitedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  invitedAt: {
    type: Date,
    default: null,
  },
  connectedAt: {
    type: Date,
    default: null,
  },
  lastSeenAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

companyMembershipSchema.index({ companyId: 1, userId: 1 }, { unique: true });
companyMembershipSchema.index({ companyId: 1, email: 1 });

export default mongoose.model('CompanyMembership', companyMembershipSchema);
