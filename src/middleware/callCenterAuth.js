import jwt from 'jsonwebtoken';

/**
 * Call-centre and team routes: a valid Bearer JWT is required.
 *
 * The historical fallback (a bare userId taken from X-User-Id, the query or the body, without any token) let
 * anyone act as any account. It is now OFF. AUTH_USERID_FALLBACK=allow re-enables it temporarily, with a
 * warning on every use, for a client that still sends no token. Ownership is still enforced in the services.
 */
function fallbackAllowed() {
  return String(process.env.AUTH_USERID_FALLBACK || '').toLowerCase() === 'allow';
}

export function authenticateCallCenter(req, res, next) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[callCenterAuth] JWT_SECRET is not set: refusing every protected request');
    return res.status(500).json({ message: 'Authentication is not configured (JWT_SECRET missing)' });
  }
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const payload = jwt.verify(token, secret);
        if (payload?.userId) {
          req.user = payload;
          // Identité prouvée par un JWT valide (et non par l'en-tête X-User-Id) : exigée pour les gestes réservés au titulaire.
          req.authJwt = true;
          return next();
        }
      } catch {
        // handled below
      }
    }
  }

  if (fallbackAllowed()) {
    const userId =
      req.headers['x-user-id'] ||
      req.query.userId ||
      req.body?.callerUserId ||
      req.body?.userId;
    if (userId && String(userId).trim()) {
      console.warn(`[callCenterAuth] userId fallback used without a valid JWT: ${req.method} ${req.originalUrl}`);
      req.user = { userId: String(userId).trim() };
      return next();
    }
  }

  return res.status(401).json({
    message: 'Authentication required. Sign in again or refresh the page.',
  });
}

/** Signed-in person only: a valid Bearer JWT is required (no header or body fallback). */
export function authenticateUserJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (token) {
    try {
      if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET missing');
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload?.userId) {
        req.user = payload;
        return next();
      }
    } catch {
      // handled below
    }
  }
  return res.status(401).json({ message: 'Authentication required. Sign in again.' });
}
