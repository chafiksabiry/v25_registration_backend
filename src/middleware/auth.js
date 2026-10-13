import jwt from 'jsonwebtoken';

export const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // AUTH-11: a member still on their invite temp password must not reach
    // any other authenticated endpoint on this service — only changing the
    // password is allowed until the flag clears.
    if (decoded.mustChangePassword && req.path !== '/change-password') {
      return res.status(403).json({
        message: 'Password change required before continuing',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};