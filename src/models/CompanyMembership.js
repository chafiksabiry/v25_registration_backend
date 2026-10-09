import mongoose from 'mongoose';

const companyMembershipSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  fullName: {
    type: String,
    default: '',
    trim: true,
  },
  permissions: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  preset: {
    type: String,
    enum: ['admin', 'operator', 'readonly', 'custom'],
    default: 'custom',
  },
  status: {
    type: String,
    enum: ['pending', 'invited', 'active'],
    default: 'pending',
  },
  invitedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  invitedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

companyMembershipSchema.index({ companyId: 1, userId: 1 }, { unique: true });
companyMembershipSchema.index({ companyId: 1, email: 1 });

export default mongoose.model('CompanyMembership', companyMembershipSchema);
