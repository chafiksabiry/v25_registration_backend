import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  password: {
    type: String,
    required: function() {
      return !this.linkedInId;
    }
  },
  phone: {
    type: String,
    required: function() {
      return !this.linkedInId;
    }
  },
  linkedInId: {
    type: String,
    sparse: true,
    unique: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: {
    code: String,
    expiresAt: Date,
    otp: { type: Number },
    otpExpiresAt: { type: Date },
  },
  ipHistory: [{
    ip: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    action: {
      type: String,
      enum: ['register', 'login']
    },
    locationInfo: {
      location: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Timezone',
        required: false
      },
      region: String,
      city: String,
      isp: String,
      postal: String,
      coordinates: String // format: "lat,lng"
    }
  }],
  // Pending account changes — held until the user proves possession of
  // the new email / phone (or current email for password) via Brevo / OTP.
  pendingChanges: {
    emailChange: {
      newEmail: String,
      code: String,
      expiresAt: Date
    },
    passwordChange: {
      code: String,
      expiresAt: Date
    },
    phoneChange: {
      newPhone: String,
      otp: String,
      otpExpiresAt: Date
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  typeUser: {
    type :String,
    default: null,
  },
  firstTime: {
    type: Boolean,
    default: true
  },
  /** Call-center staff: company that employs this rep. */
  employerCompanyId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true,
  },
  /** Set when a call center provisions the account with a temporary password. */
  mustChangePassword: {
    type: Boolean,
    default: false,
  },
  invitationStatus: {
    type: String,
    enum: ['none', 'pending', 'invited', 'active'],
    default: 'none',
  },
  invitedAt: {
    type: Date,
    default: null,
  },
  invitedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  /** Set by scripts/importV1Reps.js for accounts migrated from HARX v1. */
  source: {
    type: String,
    default: null,
  },
  importBatch: {
    type: String,
    default: null,
    index: true,
  },
  /**
   * One-click link sent to migrated HARX v1 reps. Only the SHA-256 of the token is stored;
   * the link stays valid until expiresAt so mail-scanner prefetches and re-visits keep working.
   */
  reengagement: {
    tokenHash: { type: String, default: null, index: true },
    expiresAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  /** Profile data carried over from HARX v1 (segment, languages, activities...). */
  legacyV1: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);