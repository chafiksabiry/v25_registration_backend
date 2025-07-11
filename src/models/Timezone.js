import mongoose from 'mongoose';

const timezoneSchema = new mongoose.Schema({
  countryCode: {
    type: String,
    required: true,
    uppercase: true,
    maxlength: 2
  },
  countryName: {
    type: String,
    required: true,
    trim: true
  },
  zoneName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  gmtOffset: {
    type: Number,
    required: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index pour optimiser les recherches
timezoneSchema.index({ countryCode: 1 });
timezoneSchema.index({ zoneName: 1 });

export default mongoose.model('Timezone', timezoneSchema); 