import companyMemberService from '../services/companyMemberService.js';

function callerId(req) {
  return req.user?.userId || req.user?.id || req.user?._id;
}

function fail(res, error, fallback) {
  const status = error.statusCode || 500;
  return res.status(status).json({ success: false, message: error.message || fallback });
}

export const getCompanyMemberCatalog = (_req, res) => {
  return res.json({ success: true, data: companyMemberService.catalog() });
};

export const getMyCompanyAccess = async (req, res) => {
  try {
    const data = await companyMemberService.session(callerId(req));
    return res.json({ success: true, data });
  } catch (error) {
    return fail(res, error, 'Failed to resolve company access');
  }
};

export const listCompanyMembers = async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const data = await companyMemberService.list(callerId(req), companyId);
    return res.json({ success: true, data, catalog: companyMemberService.catalog() });
  } catch (error) {
    return fail(res, error, 'Failed to list company members');
  }
};

export const inviteCompanyMember = async (req, res) => {
  try {
    const data = await companyMemberService.invite(callerId(req), req.body);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return fail(res, error, 'Failed to invite member');
  }
};

export const reinviteCompanyMember = async (req, res) => {
  try {
    const companyId = req.body?.companyId || req.query.companyId;
    const data = await companyMemberService.reinvite(
      callerId(req),
      companyId,
      req.params.userId,
      req.body
    );
    return res.json({ success: true, data });
  } catch (error) {
    return fail(res, error, 'Failed to resend invitation');
  }
};

export const updateCompanyMember = async (req, res) => {
  try {
    const companyId = req.body?.companyId || req.query.companyId;
    const data = await companyMemberService.update(
      callerId(req),
      companyId,
      req.params.userId,
      req.body
    );
    return res.json({ success: true, data });
  } catch (error) {
    return fail(res, error, 'Failed to update member');
  }
};

export const removeCompanyMember = async (req, res) => {
  try {
    const companyId = req.body?.companyId || req.query.companyId;
    const data = await companyMemberService.remove(callerId(req), companyId, req.params.userId);
    return res.json({ success: true, data });
  } catch (error) {
    return fail(res, error, 'Failed to remove member');
  }
};
