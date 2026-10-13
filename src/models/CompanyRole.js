import mongoose from 'mongoose';

const companyRoleSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  permissions: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  createdByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, { timestamps: true });

companyRoleSchema.index({ companyId: 1, name: 1 }, { unique: true });

export default mongoose.model('CompanyRole', companyRoleSchema);
