import { listPublicCompanyPlans, listPublicRepPlans } from '../services/adminPlansService.js';

export const getPublicCompanyPlans = async (req, res) => {
  try {
    const data = await listPublicCompanyPlans();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load company plans' });
  }
};

export const getPublicRepPlans = async (req, res) => {
  try {
    const data = await listPublicRepPlans();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load rep plans' });
  }
};
