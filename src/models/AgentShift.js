import mongoose from 'mongoose';

/** Créneau de travail d'un agent employé par un centre, posé par son manager ou son superviseur. */
const agentShiftSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  /** AAAA-MM-JJ */
  date: { type: String, required: true },
  /** HH:MM */
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  gigId: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

agentShiftSchema.index({ companyId: 1, userId: 1, date: 1 });

export default mongoose.model('AgentShift', agentShiftSchema);
