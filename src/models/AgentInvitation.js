import mongoose from 'mongoose';

/**
 * Invitation of an email address to a call centre. An address can be invited by any number of
 * call centres; a person who already has a HARX account accepts after signing in.
 */
const agentInvitationSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    invitedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
    invitedAt: { type: Date, default: Date.now },
    respondedAt: { type: Date },
  },
  { timestamps: true }
);

agentInvitationSchema.index({ companyId: 1, email: 1 }, { unique: true });
agentInvitationSchema.index({ email: 1, status: 1 });

export default mongoose.models.AgentInvitation || mongoose.model('AgentInvitation', agentInvitationSchema);
