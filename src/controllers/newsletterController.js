import { subscribe as subscribeService } from '../services/newsletterService.js';

export const subscribe = async (req, res) => {
  try {
    const { email, locale, source } = req.body || {};
    const result = await subscribeService({ email, locale, source });
    const status = result.created ? 201 : 200;
    return res.status(status).json({
      success: true,
      data: result,
      message: result.created ? 'Subscribed successfully' : 'Already subscribed',
    });
  } catch (error) {
    const status = error.status || 400;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to subscribe',
    });
  }
};
