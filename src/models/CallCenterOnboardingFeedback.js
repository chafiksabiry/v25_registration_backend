import mongoose from 'mongoose';

/** Avis d'un centre d'appels sur sa mise en route : note de 1 à 5, commentaire libre et durée constatée. */
const schema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
    /** Temps actif passé dans la mise en route, en secondes (renseigné par l'application). */
    durationSeconds: { type: Number, default: null },
  },
  { timestamps: true, collection: 'callcenter_onboarding_feedback' }
);

export default mongoose.models.CallCenterOnboardingFeedback || mongoose.model('CallCenterOnboardingFeedback', schema);
