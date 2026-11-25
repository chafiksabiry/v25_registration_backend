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
    // Facultatif : l'inscription par e-mail ne le demande plus (il est redemandé à l'appel test de l'onboarding),
    // les agents invités par e-mail l'ajoutent plus tard. Pas d'index unique : plusieurs comptes sans numéro coexistent.
    required: false,
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
      expiresAt: Date,
      attempts: { type: Number, default: 0 }
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
  /** Produit HARX du compte (ex. « callcentre ») : la connexion mène à ce produit. */
  product: {
    type: String,
    enum: ['callcentre', null],
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
  /**
   * Emplois d'un agent (un compte peut travailler pour plusieurs centres). `employerCompanyId` reste le centre par
   * défaut et vaut entrée active tant que la liste ne le contredit pas (voir utils/employments.js).
   */
  employments: {
    type: [
      new mongoose.Schema(
        {
          companyId: { type: mongoose.Schema.Types.ObjectId, required: true },
          status: { type: String, enum: ['active', 'ended'], default: 'active' },
          startedAt: { type: Date, default: Date.now },
          endedAt: { type: Date, default: null },
        },
        { _id: false }
      ),
    ],
    default: [],
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
    lastRequestedAt: { type: Date, default: null },
  },
  /**
   * Lien d'accès direct d'une invitation (secrétaire invitée par un centre) : seul le SHA-256 du jeton est stocké ;
   * il reste valable jusqu'à expiresAt.
   */
  inviteLogin: {
    tokenHash: { type: String, default: null, index: true },
    expiresAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  /**
   * Origine de l'inscription : paramètres utm_ du lien de campagne, enregistrés seulement avec le consentement « mesure d'audience »
   * (voir utils/attribution.js).
   */
  attribution: {
    utm_source: { type: String, default: null },
    utm_medium: { type: String, default: null },
    utm_campaign: { type: String, default: null },
    utm_content: { type: String, default: null },
    utm_term: { type: String, default: null },
  },
  /** Profile data carried over from HARX v1 (segment, languages, activities...). */
  legacyV1: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  /**
   * Compte désactivé par un administrateur (réversible) : connexion refusée, jetons déjà émis refusés (services/accountGate.js).
   * L'abonnement et le numéro ne sont pas modifiés. `disabledBy` : l'administrateur (id et nom affiché), pour la fiche admin.
   */
  disabled: {
    type: Boolean,
    default: false,
    index: true,
  },
  disabledAt: {
    type: Date,
    default: null,
  },
  disabledReason: {
    type: String,
    default: null,
  },
  disabledBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, default: null },
  },
  /**
   * Parcours d'entrée (utils/signupJourney.js) : offre et produit de l'adresse d'inscription, posés une fois à la création ;
   * valeurs de listes fermées seulement. Absent pour les comptes créés avant le suivi.
   */
  signup: {
    type: new mongoose.Schema(
      {
        offer: { type: String, enum: ['nomad', 'cloud', 'taas', null], default: null },
        product: { type: String, enum: ['receptionist', 'entreprise', 'contact_centre', null], default: null },
        entry: { type: String, default: null },
        lang: { type: String, default: null },
        country: { type: String, default: null },
        at: { type: Date, default: null },
      },
      { _id: false }
    ),
    default: undefined,
  },
  /**
   * Étapes datées du parcours d'inscription, chacune posée la première fois seulement (services/signupJourney.js ; identité,
   * appel d'essai, numéro et paiement posés par v25_comporchestrator_back dans la même collection). Absent pour les comptes antérieurs.
   */
  journey: {
    type: new mongoose.Schema(
      {
        account_created: Date,
        email_verified: Date,
        phone_verified: Date,
        identity_submitted: Date,
        identity_verified: Date,
        offer_chosen: Date,
        trial_call: Date,
        trial_call_outcome: { type: String, enum: ['done', 'skipped', 'used'] },
        number_chosen: Date,
        payment_succeeded: Date,
        onboarding_finished: Date,
        first_login_app: Date,
      },
      { _id: false }
    ),
    default: undefined,
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