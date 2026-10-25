import mongoose from 'mongoose';

/** Rattachement d'une opération (gig) du centre à l'un de ses clients. Une opération a au plus un client. */
const schema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    gigId: { type: mongoose.Schema.Types.ObjectId, required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: true, collection: 'callcenter_operation_clients' }
);

schema.index({ companyId: 1, gigId: 1 }, { unique: true });

export default mongoose.models.CallCenterOperationClient || mongoose.model('CallCenterOperationClient', schema);
