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
    locale: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);
