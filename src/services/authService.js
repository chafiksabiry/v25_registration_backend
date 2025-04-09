import jwt from 'jsonwebtoken';
import axios from 'axios';
import userRepository from '../repositories/userRepository.js';
import User from '../models/User.js'; // Modèle utilisateur
import twilio from 'twilio';

const client = twilio('AC8a453959a6cb01cbbd1c819b00c5782f', '7ade91a170bff98bc625543287ee62c8');
class AuthService {
  generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
  async generateVerificationCodeForRecovery(email) {
    const existingUser = await userRepository.findByEmail(email);
    if (!existingUser) {
      throw new Error('Email not registered');
    }
    const verificationCode= Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpiry = new Date();
    verificationExpiry.setMinutes(verificationExpiry.getMinutes() + 10);

   const result = await userRepository.update(  { _id: existingUser._id},
    {
      $set: {
        'verificationCode.code' : verificationCode,
  'verificationCode.expiresAt' :verificationExpiry,
      },
    },
    { upsert: true, new: true });

    console.log("resultrecovery",result);

    return { verificationCode , result};
  }

  generateToken(userId) {
    return jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
  }

  async register(userData) {
    console.log("userData",userData);
    const existingUser = await userRepository.findByEmail(userData.email);
    if (existingUser) {
      console.warn("Email already registered");
      throw new Error('Email already registered');
    }

    const verificationCode = this.generateVerificationCode();
    const verificationExpiry = new Date();
    verificationExpiry.setMinutes(verificationExpiry.getMinutes() + 10);
   const result = await userRepository.create({
      ...userData,
      verificationCode: {
        code: verificationCode,
        expiresAt: verificationExpiry
      }
    });
    console.log("result2",result);

    return { verificationCode , result};
  }

  async login(email, password) {
    console.log('we are here');
    const user = await userRepository.findByEmail(email);
    console.log("user",user);
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
    console.log("verificationCodeLogin",verificationCode);
    await userRepository.update(user._id, {
      verificationCode: {
        code: verificationCode,
        expiresAt: verificationExpiry
      },
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
          return{ error: true, message:'invalid or expired code. Please try again.'}

         // throw new Error('Invalid or expired verification code');
        }
    
        // Mettre à jour l'utilisateur : retirer le code de vérification
        await userRepository.update(user._id, {
          verificationCode: undefined,
          // isVerified: true
        });
    
        // Générer un token et le retourner
        return { token: this.generateToken(user._id) };
      } catch (error) {
        console.error('Error in verifyEmail:', error.message);
        // Propager une erreur pour qu'elle puisse être gérée par l'appelant
        throw new Error(error.message || 'Failed to verify email');
      }
    }
    

  async linkedInAuth(code) {
    console.log("code before accesstoken",code);
    const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        redirect_uri: `${process.env.FRONTEND_URL}/linkedin/callback`
      }
    });
console.log("redirect_uri",`${process.env.FRONTEND_URL}/linkedin/callback`);
    const accessToken = tokenResponse.data.access_token;
    console.log("accessToken",accessToken);

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
console.log("profile",profileResponse);
    let user = await userRepository.findByEmail(profile.email);
    if (!user) {
      user = await userRepository.create({
        fullName: profile.name,
        email:profile.email,
        isVerified: profile.email_verified,
        linkedInId: profile.sub
      });
    }

    return { token: this.generateToken(user._id) };
  }

// Service pour envoyer un OTP
 async  sendOTPWithTwilio(userId, phoneNumber) {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000);
    const expiresAt = new Date(Date.now() + 300000);
console.log("userIdInSendOTPWithTwilio",userId);
   const result= await userRepository.update(
      { _id: userId },
      {
        $set: {
          'verificationCode.otp': otp,
          'verificationCode.otpExpiresAt': expiresAt,
        },
      },
      { upsert: true, new: true }
    );
    console.log("result",result);

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
 async  verifyOTPTwilio(userId, enteredOtp) {
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
            'verificationCode.otp' : undefined,
      'verificationCode.otpExpiresAt' :undefined,
          },
        },
        { upsert: true, new: true }
      );
      return { success: true, message: 'OTP verified successfully' };
    } else {
      return{ error: true, message:'Invalid OTP. Please try again.'}
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

async changePassword(email, newPassword){
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

async linkedinSignIn(code){
  console.log("code/////",code);
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = `${process.env.FRONTEND_URL}/linkedin/signin/callback`;
console.log("redirectUri",redirectUri);
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
console.log("tokenResponse",tokenResponse);
  const accessToken = tokenResponse.data.access_token;
  console.log("accessToken",accessToken);

   // Fetch LinkedIn User Info
  const profileResponse = await axios.get("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const { sub,name, given_name, family_name, email, email_verified } = profileResponse.data;

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

  // Generate JWT Token
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

  return { token, user }; 
};

async sendVerificationEmail(email, code) {
  console.log("sendverififcationemail from service");
  if (!process.env.BREVO_API_KEY) {
    throw new Error('🚨 BREVO_API_KEY is missing in production!');
  }
  try {
    // Send verification email using Brevo
    const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: {
        name: process.env.SMTP_SENDER_NAME,
        email: process.env.BREVO_FROM_EMAIL
      },
      to: [{
        email: email,
        name: email.split('@')[0]
      }],
      subject: 'Email Verification',
      htmlContent: `
        <h1>Email Verification</h1>
        <p>Your verification code is: <strong>${code}</strong></p>
        <p>This code will expire in 10 minutes.</p>
      `
    }, {
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data) {
      throw new Error('No response data from Brevo API');
    }

    return { success: true, message: 'Verification email sent successfully', data: response.data };
  } catch (error) {
    console.error('Error sending verification email:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Failed to send verification email');
  }
}
async checkFirstLogin(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const isFirstLogin = user.lastLogin === null;

  if (isFirstLogin) {
    user.lastLogin = new Date();
    await user.save();
  }

  return { isFirstLogin };
}

}



export default new AuthService();