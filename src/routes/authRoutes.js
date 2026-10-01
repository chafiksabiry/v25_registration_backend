import express from 'express';
import { register, login, verifyEmail, linkedInAuth, sendOTP, sendVerificationEmail, checkUserType, verifyOTP, verifyAccount, generateVerificationCode, changePassword, linkedinSignIn, checkFirstLogin, changeUserType, resendVerification, checkEmail, checkPhone } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', register);
router.post('/check-email', checkEmail);
router.post('/check-phone', checkPhone);
router.post('/login', login);
router.post('/verify-email', verifyEmail);
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
router.post('/resend-verification', resendVerification);
export default router;