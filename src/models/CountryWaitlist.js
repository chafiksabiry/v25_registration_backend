import mongoose from 'mongoose';

/** Une personne intéressée par un produit HARX dans un pays pas encore ouvert. Unique par (email, produit, pays). */
const countryWaitlistSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    country: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{2}$/ },
    product: { type: String, default: 'callcentre', trim: true, lowercase: true },
    companyName: { type: String, trim: true, default: '' },
    locale: { type: String, trim: true, default: null },
    confirmationSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);
countryWaitlistSchema.index({ email: 1, product: 1, country: 1 }, { unique: true });

export default mongoose.model('CountryWaitlist', countryWaitlistSchema);
