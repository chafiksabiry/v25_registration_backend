import authService from '../services/authService.js';
import { getAdminStats, listUsers } from '../services/adminService.js';
import { getUserDetail, updateUserFinancials } from '../services/adminUserDetailService.js';
import { getWalletOverview } from '../services/adminWalletService.js';
import {
  getMinutesPricing,
  getPhoneLinePricing,
  updateMinutesPricing,
  updatePhoneLinePricing,
} from '../services/adminPricingService.js';
import {
  listCompanyPlans,
  listRepPlans,
  updateCompanyPlan,
  updateRepPlan,
} from '../services/adminPlansService.js';

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
      verified: req.query.verified,
      onboardingStatus: req.query.onboardingStatus,
      planName: req.query.planName,
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

export const adminMinutesPricing = async (_req, res) => {
  try {
    const data = await getMinutesPricing();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load minutes pricing' });
  }
};

export const adminUpdateMinutesPricing = async (req, res) => {
  try {
    const data = await updateMinutesPricing(req.body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update minutes pricing' });
  }
};

export const adminPhoneLinePricing = async (_req, res) => {
  try {
    const data = await getPhoneLinePricing();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load phone line pricing' });
  }
};

export const adminUpdatePhoneLinePricing = async (req, res) => {
  try {
    const data = await updatePhoneLinePricing(req.body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update phone line pricing' });
  }
};

export const adminCompanyPlans = async (_req, res) => {
  try {
    const data = await listCompanyPlans();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load company plans' });
  }
};

export const adminUpdateCompanyPlan = async (req, res) => {
  try {
    const data = await updateCompanyPlan(req.params.planId, req.body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update company plan' });
  }
};

export const adminRepPlans = async (_req, res) => {
  try {
    const data = await listRepPlans();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load rep plans' });
  }
};

export const adminUpdateRepPlan = async (req, res) => {
  try {
    const data = await updateRepPlan(req.params.planId, req.body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to update rep plan' });
  }
};
