import authService from '../services/authService.js';
import { getAdminStats, listUsers } from '../services/adminService.js';
import { getUserDetail, updateUserFinancials } from '../services/adminUserDetailService.js';
import { getWalletOverview } from '../services/adminWalletService.js';

export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.adminLogin(email, password, req);
    res.status(200).json({
      message: 'Admin login successful',
      data: result,
    });
  } catch (error) {
    res.status(401).json({ message: error.message || 'Invalid admin credentials' });
  }
};

export const adminStats = async (_req, res) => {
  try {
    const data = await getAdminStats();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load admin stats' });
  }
};

export const adminUsers = async (req, res) => {
  try {
    const data = await listUsers({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      typeUser: req.query.typeUser,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load users' });
  }
};

export const adminUserDetail = async (req, res) => {
  try {
    const data = await getUserDetail(req.params.userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to load user detail' });
  }
};

export const adminUserFinancials = async (req, res) => {
  try {
    const data = await updateUserFinancials(req.params.userId, req.body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update financials' });
  }
};

export const adminWalletOverview = async (_req, res) => {
  try {
    const data = await getWalletOverview();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load wallet overview' });
  }
};
