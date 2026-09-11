import jwt from 'jsonwebtoken';

/**
 * Company MF often keeps a session via userId cookie without a fresh JWT.
 * Accept Bearer JWT when valid; otherwise fall back to X-User-Id / query / body.
 * Ownership is still enforced in callCenterAgentService.resolveCallerCompany.
 */
export function authenticateCallCenter(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        return next();
      } catch {
        // fall through to userId-based session
      }
    }
  }

  const userId =
    req.headers['x-user-id'] ||
    req.query.userId ||
    req.body?.callerUserId ||
    req.body?.userId;

  if (userId && String(userId).trim()) {
    req.user = { userId: String(userId).trim() };
    return next();
  }

  return res.status(401).json({
    message: 'Authentication required. Sign in again or refresh the page.',
  });
}
