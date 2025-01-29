//import { Request, Response } from 'express';
import authService from '../services/authService.js';

export const register = async (req, res) => {
  try {
    const result = await authService.register(req.body);
    console.log("result1",result);
    console.log("result._id",result.result._id);
    console.log('Verification code:', result.verificationCode);
    //res.status(201).json({ message: 'Registration successful' });
    res.status(201).json({ 
      message: 'Registration successful', 
      data: { code: result.verificationCode , _id:result.result._id} 
  });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const result = await authService.login(req.body.email, req.body.password);
    console.log('Login verification code:', result.verificationCode);
    //res.json({ message: 'Verification code sent' });
    res.status(201).json({ 
      message: 'Verification code sent', 
      data: { code: result.verificationCode } 
  });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const result = await authService.verifyEmail(req.body.email, req.body.code);
    console.log("ResultController",result);
    res.json({ token: result.token,result });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const linkedInAuth = async (req, res) => {
  console.log("code",req.body.code);
  try {
    const result = await authService.linkedInAuth(req.body.code);
    res.json({ token: result.token });
  } catch (error) {
    console.error('LinkedIn auth error:', error);
    res.status(500).json({ message: 'Failed to authenticate with LinkedIn' });
  }
};


// Contrôleur pour envoyer un OTP
export const sendOTP = async (req, res) => {
  const { userId, phoneNumber } = req.body;
console.log("userId in sndotp controller",userId);
  if (!userId || !phoneNumber) {
    return res.status(400).json({ error: 'userId and phoneNumber are required' });
  }

  try {
    const result = await authService.sendOTPWithTwilio(userId, phoneNumber);
    console.log("result in otp controller",result)
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Contrôleur pour vérifier un OTP
export const verifyOTP = async (req, res) => {
  const { userId, otp } = req.body;
  console.log("userId",userId);
console.log("userandotp",otp);
  if (!userId || !otp) {
    return res.status(400).json({ error: 'userId and otp are required' });
  }

  try {
    const result = await authService.verifyOTPTwilio(userId, otp);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Contrôleur pour vérifier le compte utilisateur
export async function verifyAccount(req, res) {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const result = await authService.verifyAccount(userId);
    return res.status(200).json(result);  // Compte vérifié avec succès
  } catch (error) {
    return res.status(500).json({ error: error.message });  // En cas d'erreur
  }
  //generer du code pour la verification email 

};
//generer du code pour la verification email 
export async function generateVerificationCode(req,res){
  const { email } = req.body;
  const result = await authService.generateVerificationCodeForRecovery(email);
  console.log("resultControllerrecovry",result);
  return res.status(200).json(result);  // Compte vérifié avec succès
};

//controlleur pour changement de mot de passe
export async function changePassword(req, res) {
  try {
      const { email, newPassword } = req.body;
console.log("email",email);
console.log("password",newPassword);
      // Validation des champs
      if (!email || !newPassword) {
          return res.status(400).json({ message: 'Email et nouveau mot de passe requis.' });
      }

      // Appel du service pour changer le mot de passe
      const result = await authService.changePassword(email, newPassword);

      return res.status(200).json({ message: result });
  } catch (error) {
      return res.status(500).json({ message: error.message });
  }
};
export async function linkedinSignIn(req, res){
  try {
    const { code } = req.body;
    const { token, user } = await authService.linkedinSignIn(code);
    res.json({ token, user });
  } catch (error) {
    console.error("LinkedIn OAuth Error:", error);
    res.status(500).json({ error: "LinkedIn authentication failed" });
  }
};