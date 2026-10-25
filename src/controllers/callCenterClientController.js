import * as service from '../services/callCenterClientService.js';

const callerId = (req) => req.user?.userId || req.user?.id || req.user?._id;
const companyOf = (req) => req.query.companyId || req.body?.companyId;

const handle = (fn, fallback, okStatus = 200) => async (req, res) => {
  try {
    const data = await fn(req);
    return res.status(okStatus).json({ success: true, data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || fallback });
  }
};

export const listClients = handle((req) => service.listClients(callerId(req), companyOf(req)), 'Failed to list clients');
export const createClient = handle((req) => service.createClient(callerId(req), companyOf(req), req.body), 'Failed to create client', 201);
export const updateClient = handle((req) => service.updateClient(callerId(req), companyOf(req), req.params.id, req.body), 'Failed to update client');
export const archiveClient = handle((req) => service.setClientStatus(callerId(req), companyOf(req), req.params.id, 'archived'), 'Failed to archive client');
export const restoreClient = handle((req) => service.setClientStatus(callerId(req), companyOf(req), req.params.id, 'active'), 'Failed to restore client');
export const deleteClient = handle((req) => service.deleteClient(callerId(req), companyOf(req), req.params.id), 'Failed to delete client');
export const listOperationClients = handle((req) => service.listOperationClients(callerId(req), companyOf(req)), 'Failed to list operation clients');
export const setOperationClient = handle((req) => service.setOperationClient(callerId(req), companyOf(req), req.params.gigId, req.body?.clientId ?? null), 'Failed to set operation client');
