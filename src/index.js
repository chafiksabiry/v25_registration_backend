import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1); // Use '1' to trust the first proxy (Netlify/Railway)
const PORT = process.env.PORT || 5000;
// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/filemanager')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));
const corsOptions = {
  origin: [
    'http://localhost:5157',
    'http://38.242.208.242:5175',
    'http://38.242.208.242:5157',
    'https://registration.harx.ai:5157',
    'https://registration.harx.ai',
    'https://v25.harx.ai',
    'https://api-registration.harx.ai',
    'http://localhost:3000',
    'https://harx25register.netlify.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
// Middleware
/* app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true
})); */
app.use(helmet());
app.use(express.json());

// Configure rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true
});

app.use(limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Error handling
app.use(errorHandler);

// Export app for serverless use
export { app };

// Only listen if run directly (not as a module)
if (process.env.NODE_ENV !== 'test' && process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}