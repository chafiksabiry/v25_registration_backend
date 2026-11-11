import * as service from '../services/callCenterScheduleService.js';

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

export const listMyShifts = handle((req) => service.listMyShifts(callerId(req), companyOf(req), req.query), 'Failed to read schedule');
export const listAgentShifts = handle((req) => service.listAgentShifts(callerId(req), companyOf(req), req.query), 'Failed to read agent schedule');
export const setAgentShifts = handle((req) => service.setAgentShifts(callerId(req), companyOf(req), req.params.userId, req.body), 'Failed to save agent schedule');
export const listMyRequests = handle((req) => service.listMyRequests(callerId(req), companyOf(req)), 'Failed to read requests');
export const createRequest = handle((req) => service.createRequest(callerId(req), companyOf(req), req.body), 'Failed to create request', 201);
export const cancelRequest = handle((req) => service.cancelRequest(callerId(req), companyOf(req), req.params.id), 'Failed to cancel request');
export const listRequests = handle((req) => service.listRequests(callerId(req), companyOf(req), req.query), 'Failed to read requests');
export const decideRequest = handle((req) => service.decideRequest(callerId(req), companyOf(req), req.params.id, req.body), 'Failed to answer request');
