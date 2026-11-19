import express from 'express';
import { register, login, verifyEmail, linkedInAuth, sendOTP, sendVerificationEmail, checkUserType, setProduct, verifyOTP, verifyAccount, generateVerificationCode, changePassword, linkedinSignIn, checkFirstLogin, changeUserType, resendVerification, checkEmail, checkPhone, reengageLogin, reengageRequest, inviteLogin } from '../controllers/authController.js';
import rateLimit from 'express-rate-limit';
import { authenticate, optionalAuthenticate, requireBodySelfOrAdmin } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = express.Router();

router.post('/register', register);
router.post('/check-email', checkEmail);
router.post('/check-phone', checkPhone);
router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/reengage-login', reengageLogin);
// Lien d'accès direct d'une invitation : même limite par IP que les autres échanges de jeton.
router.post('/invite-login', rateLimit({ windowMs: 60 * 60 * 1000, max: Number(process.env.RATE_LIMIT_INVITE_LOGIN_MAX || 60), standardHeaders: true, legacyHeaders: false, message: { success: false, error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' } }), inviteLogin);
// A real REP asks once or twice; keep this tight per client IP on top of the per-account cooldown.
const reengageRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_REENGAGE_REQUEST_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
});
router.post('/reengage-request', reengageRequestLimiter, reengageRequest);
router.post('/linkedin', linkedInAuth);
router.post("/signin/linkedin", linkedinSignIn);

// Route pour envoyer l'OTP
router.post('/send-otp', sendOTP);

// Route pour vérifier l'OTP
router.post('/verify-otp', verifyOTP);
// Marks the account verified: only the account itself (token received after the e-mail / SMS code) or an admin.
router.post('/verify-account', authenticate, requireBodySelfOrAdmin, verifyAccount);
router.post('/generate-verification-code', generateVerificationCode);
router.post('/change-password', authenticate, changePassword);
// Sends a caller-chosen code to any address: no front uses it any more; administrators only.
router.post('/send-verification-email', authenticate, requireAdmin, sendVerificationEmail);
router.post('/check-first-login', authenticate, requireBodySelfOrAdmin, checkFirstLogin);
// The account itself (JWT), an admin, or — right after sign-up, before any token — the FIRST choice of a type only.
router.post('/change-user-type', optionalAuthenticate, changeUserType);
// Anonymous callers (sign-in screen, before the code) only learn the type; the rest needs the account's token.
router.post('/check-user-type', optionalAuthenticate, checkUserType);
router.post('/product', authenticate, setProduct);
router.post('/resend-verification', resendVerification);
export default router;