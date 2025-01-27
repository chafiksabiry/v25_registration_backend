import authService from '../services/authService.js';

export const register = async (req, res) => {
  try {
    await authService.register(req.body);
    res.status(201).json({ message: 'Registration successful' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const result = await authService.login(req.body.email, req.body.password);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const token = await authService.verifyEmail(req.body.email, req.body.code);
    res.json({ token });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const linkedInCallback = async (req, res) => {
  try {
    const token = await authService.linkedInAuth(req.body.code);
    res.json({ token });
  } catch (error) {
    console.error('LinkedIn auth error:', error);
    res.status(500).json({ message: 'Failed to authenticate with LinkedIn' });
  }
};