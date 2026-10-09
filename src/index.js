// FORCE UPDATE: Debug logs added
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import plansRoutes from './routes/plansRoutes.js';
import userRoutes from './routes/userRoutes.js';
import newsletterRoutes from './routes/newsletterRoutes.js';
import callCenterRoutes from './routes/callCenterRoutes.js';
import companyMemberRoutes from './routes/companyMemberRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1); // Use '1' to trust the first proxy (Netlify/Railway)
const PORT = process.env.PORT;
// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/filemanager')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));
const corsOptions = {
  origin: true, // Allow any origin dynamically (for debugging CORS issues)
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable pre-flight across-the-board

const logoPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'logo-pink.png');
app.get('/email/logo-pink.png', (_req, res) => {
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('png');
  res.sendFile(logoPath);
});

app.use(helmet());
app.use(express.json());

// Health Check (excluded from rate limiting)
app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Global soft limit — high enough that shared proxy IPs don't lock out signup.
// Auth abuse is handled by a tighter limiter on /api/auth only.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 1000),
  standardHeaders: true,
  legacyHeaders: false,
  // With trust proxy = 1 above, req.ip is the real client when X-Forwarded-For is set.
  skip: (req) => req.path === '/' || req.path === '/health',
});

// Stricter on auth endpoints (register/login/OTP) — per real client IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many attempts. Please wait a few minutes and try again.',
    code: 'RATE_LIMITED',
  },
});

app.use(globalLimiter);

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/users', userRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/call-center', callCenterRoutes);
app.use('/api/company-members', companyMemberRoutes);

// Error handling
app.use(errorHandler);

// Export app for serverless use
export { app };

// Start Server Logic
console.log('--- STARTUP DEBUG ---');
console.log('PORT:', process.env.PORT);

// Simplified startup logic:
// 1. If PORT is defined (Railway/Heroku/Docker), we MUST listen on it.
// 2. If running directly (node src/index.js), we should listen (defaulting to 5000).
// 3. If Netlify Functions, PORT is usually undefined, and we export 'app' instead.

// Detect if running as main module
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
const shouldStartServer = !!process.env.PORT || isMainModule;

console.log('shouldStartServer:', shouldStartServer);

if (shouldStartServer) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('--- SERVER STARTED ---');
    console.log(`Server running on port ${PORT}`);
    console.log('----------------------');
  });
} else {
  console.log('Server not started (Serverless mode or missing PORT).');
}