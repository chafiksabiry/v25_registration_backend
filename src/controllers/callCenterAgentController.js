import callCenterAgentService from '../services/callCenterAgentService.js';

function callerId(req) {
  return req.user?.userId || req.user?.id || req.user?._id;
}

export const createCallCenterAgent = async (req, res) => {
  try {
    const result = await callCenterAgentService.createAndInvite(callerId(req), req.body);
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to create agent' });
  }
};

export const listCallCenterAgents = async (req, res) => {
  try {
    const companyId = req.query.companyId || req.body?.companyId;
    const agents = await callCenterAgentService.listAgents(callerId(req), companyId);
    return res.json({ success: true, data: agents });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to list agents' });
  }
};

export const resendCallCenterAgentInvite = async (req, res) => {
  try {
    const companyId = req.body?.companyId || req.query.companyId;
    const agentUserId = req.params.userId;
    const result = await callCenterAgentService.resendInvite(callerId(req), companyId, agentUserId);
    return res.json({ success: true, data: result });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to resend invite' });
  }
};
