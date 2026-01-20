import jwt from 'jsonwebtoken';
import axios from 'axios';
import userRepository from '../repositories/userRepository.js';
import User from '../models/User.js'; // Modèle utilisateur
import Timezone from '../models/Timezone.js';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import { getClientIp } from '../utils/ipHelper.js';
import ipInfoService from './ipInfoService.js';


const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
class AuthService {
  generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
  async generateVerificationCodeForRecovery(email) {
    const existingUser = await userRepository.findByEmail(email);
    if (!existingUser) {
      throw new Error('Email not registered');
    }
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpiry = new Date();
    verificationExpiry.setMinutes(verificationExpiry.getMinutes() + 10);

    const result = await userRepository.update({ _id: existingUser._id },
      {
        $set: {
          'verificationCode.code': verificationCode,
          'verificationCode.expiresAt': verificationExpiry,
        },
      },
      { upsert: true, new: true });

    console.log("resultrecovery", result);

    return { verificationCode, result };
  }

  generateToken(userId, userInfo = {}) {
    return jwt.sign(
      {
        userId,
        email: userInfo.email,
        fullName: userInfo.fullName,
        typeUser: userInfo.typeUser,
        isVerified: userInfo.isVerified
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
  }

  // Méthode pour trouver un timezone existant
  async findTimezone(locationInfo) {
    try {
      if (!locationInfo || !locationInfo.timezone || !locationInfo.countryCode) {
        return null;
      }

      // Chercher si le timezone existe avec country code ET zone name
      const timezone = await Timezone.findOne({
        countryCode: locationInfo.countryCode,
        zoneName: locationInfo.timezone
      });

      if (!timezone) {
        console.warn(`Timezone not found for country: ${locationInfo.countryCode}, zone: ${locationInfo.timezone}`);
        return null;
      }

      return timezone._id;
    } catch (error) {
      console.error('Error in findTimezone:', error);
      return null;
    }
  }

  // Méthode pour enrichir les informations IP avec les données géographiques
  async enrichIPInfo(ipAddress) {
    try {
      if (!ipAddress) {
        console.warn('No IP address provided');
        return null;
      }

      const locationInfo = await ipInfoService.getLocationInfo(ipAddress);

      if (!locationInfo) {
        console.warn('Unable to get location info for IP:', ipAddress);
        return null;
      }

      // Trouver le timezone existant
      const timezoneId = await this.findTimezone(locationInfo);

      // Si on n'arrive pas à trouver le timezone, retourner null
      if (!timezoneId) {
        console.warn('Unable to find timezone for:', locationInfo);
        return null;
      }

      return {
        region: locationInfo.region || null,
        city: locationInfo.city || null,
        isp: locationInfo.isp || null,
        postal: locationInfo.postal || null,
        coordinates: locationInfo.coordinates || null,
        location: timezoneId
      };
    } catch (error) {
      console.error('Error enriching IP info:', error);
      return null;
    }
  }

  async register(userData, req) {
    console.log("userData", userData);
    const existingUser = await userRepository.findByEmail(userData.email);
    if (existingUser) {
      console.warn("Email already registered");
      throw new Error('Email already registered');
    }

    const verificationCode = this.generateVerificationCode();
    const verificationExpiry = new Date();
    verificationExpiry.setMinutes(verificationExpiry.getMinutes() + 10);

    const clientIp = getClientIp(req);
    const locationInfo = await this.enrichIPInfo(clientIp);

    const result = await userRepository.create({
      ...userData,
      verificationCode: {
        code: verificationCode,
        expiresAt: verificationExpiry
      },
      ipHistory: [{
        ip: clientIp,
        action: 'register',
        ...(locationInfo && { locationInfo: locationInfo })
      }]
    });
    console.log("result2", result);

    return { verificationCode, result };
  }

  async login(email, password, req) {
    console.log('we are here');
    const user = await userRepository.findByEmail(email);
    console.log("user", user);
    if (!user) {
      console.log('user not found');
      throw new Error('Invalid credentials');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('invalid credentials')
      throw new Error('Invalid credentials');
    }

    const verificationCode = this.generateVerificationCode();
    const verificationExpiry = new Date();
    verificationExpiry.setMinutes(verificationExpiry.getMinutes() + 10);
    console.log("verificationCodeLogin", verificationCode);

    const clientIp = getClientIp(req);
    const locationInfo = await this.enrichIPInfo(clientIp);

    // Check if it's first time login
    const isFirstTime = user.firstTime;

    await userRepository.update(user._id, {
      verificationCode: {
        code: verificationCode,
        expiresAt: verificationExpiry
      },
      firstTime: false, // Set firstTime to false after first login
      $push: {
        ipHistory: {
          ip: clientIp,
          action: 'login',
          ...(locationInfo && { locationInfo: locationInfo })
        }
      }
    });

    return { verificationCode };
  }


  async verifyEmail(email, code) {
    try {
      // Récupérer l'utilisateur par email
      const user = await userRepository.findByEmail(email);
      console.log("userInVerifyEmail:", user);

      if (!user) {
        throw new Error('User not found');
      }

      // Vérifier le code de vérification et sa validité
      if (
        !user.verificationCode ||
        user.verificationCode.code !== code ||
        user.verificationCode.expiresAt < new Date()
      ) {
        console.log('Verification failed: invalid or expired code');
        return { error: true, message: 'invalid or expired code. Please try again.' }

        // throw new Error('Invalid or expired verification code');
      }

      // Mettre à jour l'utilisateur : retirer le code de vérification
      await userRepository.update(user._id, {
        verificationCode: undefined,
        // isVerified: true
      });

      // Générer un token et le retourner avec les informations utilisateur
      return {
        token: this.generateToken(user._id, {
          email: user.email,
          fullName: user.fullName,
          typeUser: user.typeUser,
          isVerified: user.isVerified
        })
      };
    } catch (error) {
      console.error('Error in verifyEmail:', error.message);
      // Propager une erreur pour qu'elle puisse être gérée par l'appelant
      throw new Error(error.message || 'Failed to verify email');
    }
  }


  async linkedInAuth(code) {
    console.log("code before accesstoken", code);
    const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        redirect_uri: `${process.env.FRONTEND_URL}/linkedin/callback`
      }
    });
    console.log("redirect_uri", `${process.env.FRONTEND_URL}/linkedin/callback`);
    const accessToken = tokenResponse.data.access_token;
    console.log("accessToken", accessToken);

    const [profileResponse] = await Promise.all([
      axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
        /*  params: {
           projection: '(localizedFirstName,localizedLastName)'
         } */
      })
      /*   axios.get('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', {
          headers: { Authorization: `Bearer ${accessToken}` }
        }) */
    ]);

    const profile = profileResponse.data;
    // const email = emailResponse.data.elements[0]['handle~'].emailAddress;
    console.log("profile", profileResponse);
    let user = await userRepository.findByEmail(profile.email);
    if (!user) {
      user = await userRepository.create({
        fullName: profile.name,
        email: profile.email,
        isVerified: profile.email_verified,
        linkedInId: profile.sub
      });
    }

    return {
      token: this.generateToken(user._id, {
        email: user.email,
        fullName: user.fullName,
        typeUser: user.typeUser,
        isVerified: user.isVerified
      })
    };
  }

  // Service pour envoyer un OTP
  async sendOTPWithTwilio(userId, phoneNumber) {
    try {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
        console.error("🚨 Missing Twilio Configuration! Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.");
        throw new Error('Server misconfiguration: Missing SMS credentials.');
      }

      const otp = Math.floor(100000 + Math.random() * 900000);
      const expiresAt = new Date(Date.now() + 300000);
      console.log("userIdInSendOTPWithTwilio", userId);
      const result = await userRepository.update(
        { _id: userId },
        {
          $set: {
            'verificationCode.otp': otp,
            'verificationCode.otpExpiresAt': expiresAt,
          },
        },
        { upsert: true, new: true }
      );
      console.log("result", result);

      await client.messages.create({
        body: `Your OTP code is: ${otp}`,
        to: phoneNumber,
        from: process.env.TWILIO_PHONE_NUMBER,
      });
      console.log('done');
      return { success: true, message: 'OTP sent successfully' };

    } catch (error) {
      console.error('Error in sendOTPWithTwilio:', error);
      throw new Error('Failed to send OTP');
    }
  }

  // Service pour vérifier un OTP
  async verifyOTPTwilio(userId, enteredOtp) {
    try {
      const user = await userRepository.findById({ _id: userId });

      if (!user || !user.verificationCode) {
        throw new Error('User not found or OTP not generated');
      }

      const { otp, otpExpiresAt } = user.verificationCode;

      if (!otpExpiresAt || new Date() > otpExpiresAt) {
        throw new Error('OTP has expired. Please request a new one.');
      }
      if (String(otp) === String(enteredOtp)) {
        console.log("search for otp");
        await userRepository.update(
          { _id: user._id },
          {
            $set: {
              'verificationCode.otp': undefined,
              'verificationCode.otpExpiresAt': undefined,
            },
          },
          { upsert: true, new: true }
        );
        return { success: true, message: 'OTP verified successfully' };
      } else {
        return { error: true, message: 'Invalid OTP. Please try again.' }
        // throw new Error('Invalid OTP. Please try again.');
      }
    } catch (error) {
      console.error('Error in verifyOTPTwilio:', error);
      throw new Error(error.message || 'Failed to verify OTP');
    }
  }

  async verifyAccount(userId) {
    try {
      // Chercher l'utilisateur par son ID
      const user = await userRepository.findById({ _id: userId });

      if (!user) {
        throw new Error('User not found');
      }

      // Si l'utilisateur est déjà vérifié, retourner un message sans effectuer d'action
      if (user.isVerified) {
        return { success: true, message: 'Account is already verified' };
      }

      // Mettre à jour le champ isVerified à true
      await userRepository.update(
        { _id: user._id },
        {
          $set: {
            isVerified: true,
          },
        },
        { upsert: true, new: true }
      );
      return { success: true, message: 'Account verified successfully' };
    } catch (error) {
      console.error('Error in verifyAccount:', error);
      throw new Error('Failed to verify account');
    }
  }

  /* 
  async changePassword(email, newPassword){
    // Recherche de l'utilisateur par email
    const user = await userRepository.findByEmail(email);
    if (!user) {
        throw new Error('Utilisateur non trouvé.');
    }
    console.log("userinchangepasswd",user);
    // Mise à jour du mot de passe dans la base de données
     await userRepository.update(
      { _id: user._id },
      {
        $set: {
          password: newPassword,
        },
      },
      { upsert: true, new: true }
    ); 
      // Mettre à jour le mot de passe
      user.password = newPassword; // Le hook `pre('save')` hash automatiquement le mot de passe
      await user.save();
  
    return { success: true, message: 'Mot de passe changé avec succès.' };
  
  } */

  async changePassword(email, newPassword) {
    // Recherche de l'utilisateur par email
    const user = await User.findOne({ email });
    if (!user) {
      throw new Error('Utilisateur non trouvé.');
    }

    // Mettre à jour le mot de passe
    user.password = newPassword; // Le hook `pre('save')` hash automatiquement le mot de passe
    await user.save();

    return { success: true, message: 'Mot de passe changé avec succès.' };

  }

  async linkedinSignIn(code) {
    console.log("code/////", code);
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectUri = `${process.env.FRONTEND_URL}/linkedin/signin/callback`;
    console.log("redirectUri", redirectUri);
    // Get LinkedIn Access Token
    const tokenResponse = await axios.post("https://www.linkedin.com/oauth/v2/accessToken", null, {
      params: {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      },
    });
    console.log("tokenResponse", tokenResponse);
    const accessToken = tokenResponse.data.access_token;
    console.log("accessToken", accessToken);

    // Fetch LinkedIn User Info
    const profileResponse = await axios.get("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const { sub, name, given_name, family_name, email, email_verified } = profileResponse.data;

    // Check if user exists, else create one
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        fullName: name,
        email,
        linkedInId: sub,
        isVerified: email_verified,
      });
      await user.save();
    }

    // Generate JWT Token with user info
    const token = jwt.sign({
      userId: user._id,
      email: user.email,
      fullName: user.fullName,
      typeUser: user.typeUser,
      isVerified: user.isVerified
    }, process.env.JWT_SECRET, { expiresIn: "7d" });

    return { token, user };
  };

  async sendVerificationEmail(email, code) {
    console.log("sendVerificationEmail: Starting Nodemailer process...");

    // Check for required SMTP environment variables
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error("🚨 Missing SMTP configuration! Check SMTP_HOST, SMTP_USER, SMTP_PASS.");
      throw new Error('Server misconfiguration: Missing email credentials.');
    }

    try {
      // Create Nodemailer transporter
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      // Define email options
      const mailOptions = {
        from: `"${process.env.SMTP_FROM_NAME || 'Support'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
        to: email,
        subject: 'Email Verification',
        html: `
          <h1>Email Verification</h1>
          <p>Your verification code is: <strong>${code}</strong></p>
          <p>This code will expire in 10 minutes.</p>
        `,
      };

      // Send email
      const info = await transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully:', info.messageId);

      return { success: true, message: 'Verification email sent successfully', data: info };

    } catch (error) {
      console.error('❌ Error sending verification email with Nodemailer:', error);
      throw new Error('Failed to send verification email: ' + error.message);
    }
  }
  async checkFirstLogin(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    return { isFirstLogin: user.firstTime };
  }
  async changeUserType(userId, newType) {
    try {
      // Find the user by their ID
      const user = await userRepository.findById({ _id: userId });

      if (!user) {
        throw new Error('User not found');
      }

      // Update the user's type
      user.typeUser = newType;
      await user.save();

      return { success: true, message: `User type changed to ${newType}` };
    } catch (error) {
      console.error('Error changing user type:', error);
      throw new Error('Failed to change user type');
    }
  }

  async checkUserType(userId) {
    const user = await userRepository.findById({ _id: userId });
    if (!user) {
      throw new Error('User not found');
    }
    return user.typeUser;
  }


}



export default new AuthService();