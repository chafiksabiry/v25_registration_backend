import express from 'express';
import { register, login, verifyEmail, linkedInAuth, sendOTP, sendVerificationEmail, checkUserType, setProduct, verifyOTP, verifyAccount, generateVerificationCode, changePassword, linkedinSignIn, checkFirstLogin, changeUserType, resendVerification, checkEmail, checkPhone, reengageLogin, reengageRequest } from '../controllers/authController.js';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/check-email', checkEmail);
router.post('/check-phone', checkPhone);
router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/reengage-login', reengageLogin);
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
router.post('/verify-account', verifyAccount);
router.post('/generate-verification-code', generateVerificationCode);
router.post('/change-password', authenticate, changePassword);
router.post('/send-verification-email', sendVerificationEmail);
router.post('/check-first-login', checkFirstLogin);
router.post('/change-user-type', changeUserType);
router.post('/check-user-type', checkUserType);
router.post('/product', authenticate, setProduct);
router.post('/resend-verification', resendVerification);
export default router;