import mongoose from 'mongoose';
import { REQUEST_KINDS, REQUEST_STATUSES } from '../services/callCenterScheduleValidation.js';

/** Demande d'un agent à son centre : congé, maladie, absence, arrivée tardive, sortie anticipée, autre. */
const scheduleRequestSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  /** Nom de l'agent au moment de la demande (affiché dans la boîte du centre). */
  userName: { type: String, default: '' },
  kind: { type: String, enum: REQUEST_KINDS, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  /** Heure d'arrivée ou de départ prévue (arrivée tardive, sortie anticipée). */
  time: { type: String, default: null },
  reason: { type: String, default: '', maxlength: 500 },
  status: { type: String, enum: REQUEST_STATUSES, default: 'pending', index: true },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  decisionNote: { type: String, default: '', maxlength: 300 },
}, { timestamps: true });

scheduleRequestSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export default mongoose.model('ScheduleRequest', scheduleRequestSchema);
