import mongoose from 'mongoose';

const harxObjectivesSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    year: { type: Number, required: true },
    companiesSigned: { type: Number, min: 0, default: null },
    companiesOnboarded: { type: Number, min: 0, default: null },
    repsOnboarded: { type: Number, min: 0, default: null },
    repsWithActiveSubscription: { type: Number, min: 0, default: null },
    annualRevenue: { type: Number, min: 0, default: null },
    annualProfit: { type: Number, min: 0, default: null },
    mrr: { type: Number, min: 0, default: null },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

const HarxObjectives = mongoose.model('HarxObjectives', harxObjectivesSchema);

export default HarxObjectives;
