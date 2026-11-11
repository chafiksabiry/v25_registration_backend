import * as service from '../services/callCenterClientPortalService.js';

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

export const getBranding = handle((req) => service.getBranding(callerId(req), companyOf(req)), 'Failed to read branding');
export const setBranding = handle((req) => service.setBranding(callerId(req), companyOf(req), req.body), 'Failed to save branding');
export const listClientAccess = handle((req) => service.listClientAccess(callerId(req), companyOf(req), req.query.clientId), 'Failed to list client access');
export const inviteClientContact = handle((req) => service.inviteClientContact(callerId(req), companyOf(req), req.body), 'Failed to invite client contact', 201);
export const resendClientInvitation = handle((req) => service.resendClientInvitation(callerId(req), companyOf(req), req.params.userId), 'Failed to resend invitation');
export const updateClientAccess = handle((req) => service.updateClientAccess(callerId(req), companyOf(req), req.params.userId, req.body), 'Failed to update client access');
export const revokeClientAccess = handle((req) => service.revokeClientAccess(callerId(req), companyOf(req), req.params.userId), 'Failed to revoke client access');
