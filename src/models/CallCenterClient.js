import mongoose from 'mongoose';

/**
 * Client d'un centre d'appels : entreprise servie en sous-traitance, ou filiale traitée en client interne.
 * Point de rattachement des opérations (gigs) du centre. Propre au produit Call Centre : aucun lien avec les
 * entreprises ni les reps du TaaS.
 */
const addressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const callCenterClientSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    kind: { type: String, enum: ['external', 'internal'], default: 'external' },
    contactName: { type: String, trim: true, default: '' },
    contactEmail: { type: String, trim: true, lowercase: true, default: '' },
    contactPhone: { type: String, trim: true, default: '' },
    billingAddress: { type: addressSchema, default: () => ({}) },
    vatNumber: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true, collection: 'callcenter_clients' }
);

callCenterClientSchema.index({ companyId: 1, name: 1 });

export default mongoose.models.CallCenterClient || mongoose.model('CallCenterClient', callCenterClientSchema);
