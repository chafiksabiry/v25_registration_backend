import mongoose from 'mongoose';
import {
  DEFAULT_MINUTE_PACKS,
  DEFAULT_MINUTES_CUSTOM_RATE_CENTS,
  DEFAULT_PHONE_LINE_PRICING,
} from '../config/platformPricingDefaults.js';

const minutePackSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    minutes: { type: Number, required: true, min: 1 },
    priceCents: { type: Number, required: true, min: 1 },
    active: { type: Boolean, default: true },
  },
  { _id: false },
);

const platformPricingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    minutePacks: { type: [minutePackSchema], default: () => DEFAULT_MINUTE_PACKS },
    minutesCustomRateCents: {
      type: Number,
      default: DEFAULT_MINUTES_CUSTOM_RATE_CENTS,
      min: 0.01,
    },
    phoneLineSetupFeeCents: {
      type: Number,
      default: DEFAULT_PHONE_LINE_PRICING.setupFeeCents,
      min: 0,
    },
    phoneLineCurrency: {
      type: String,
      default: DEFAULT_PHONE_LINE_PRICING.currency,
      uppercase: true,
      trim: true,
    },
    phoneLineTrialDays: {
      type: Number,
      default: DEFAULT_PHONE_LINE_PRICING.trialDays,
      min: 0,
      max: 365,
    },
  },
  { timestamps: true },
);

const PlatformPricing = mongoose.model('PlatformPricing', platformPricingSchema);

export default PlatformPricing;
