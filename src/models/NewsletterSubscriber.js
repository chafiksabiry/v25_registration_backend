import mongoose from 'mongoose';

const newsletterSubscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    source: {
      type: String,
      default: 'landing_footer',
      trim: true,
    },
    /** Annonces demandées en plus de la lettre (ex. `taas_company_launch` : ouverture de « Publier un gig »). */
    interests: {
      type: [String],
      default: [],
    },
    locale: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);
