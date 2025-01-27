import express from 'express';
import { register, login, verifyEmail, linkedInAuth, sendOTP, verifyOTP,verifyAccount,generateVerificationCode,changePassword} from '../controllers/authController.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/linkedin', linkedInAuth);
// Route pour envoyer l'OTP
router.post('/send-otp', sendOTP);

// Route pour vérifier l'OTP
router.post('/verify-otp', verifyOTP);
router.post('/verify-account', verifyAccount);
router.post('/generate-verification-code', generateVerificationCode);
router.post('/change-password', changePassword);

export default router;