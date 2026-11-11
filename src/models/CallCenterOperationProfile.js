import mongoose from 'mongoose';

/** Description d'une opération du centre (objectif, volume attendu) et ses indicateurs de pilotage. Une fiche par opération. */
const kpiSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    unit: { type: String, default: '' },
    target: { type: Number, default: null },
    /** `min` : l'objectif est un plancher à atteindre ; `max` : un plafond à ne pas dépasser. */
    goal: { type: String, enum: ['min', 'max'], default: 'min' },
    custom: { type: Boolean, default: false },
  },
  { _id: false }
);

/** Dernière valeur saisie à la main pour un indicateur qui n'a pas de source automatique (satisfaction, chiffre d'affaires…). */
const manualValueSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    value: { type: Number, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    gigId: { type: mongoose.Schema.Types.ObjectId, required: true },
    objective: { type: String, default: '' },
    dailyVolume: { type: Number, default: null },
    kpis: { type: [kpiSchema], default: [] },
    manualValues: { type: [manualValueSchema], default: [] },
  },
  { timestamps: true, collection: 'callcenter_operation_profiles' }
);

schema.index({ companyId: 1, gigId: 1 }, { unique: true });

export default mongoose.models.CallCenterOperationProfile || mongoose.model('CallCenterOperationProfile', schema);
