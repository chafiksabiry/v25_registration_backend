import mongoose from 'mongoose';

/** Marque blanche d'un centre : ce que ses clients voient dans leur portail à la place de HARX. */
const schema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    displayName: { type: String, trim: true, default: '' },
    logoUrl: { type: String, trim: true, default: '' },
    primaryColor: { type: String, trim: true, default: '' },
  },
  { timestamps: true, collection: 'callcenter_branding' }
);

export default mongoose.models.CallCenterBranding || mongoose.model('CallCenterBranding', schema);
