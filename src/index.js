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
  origin: true, // Allow any origin dynamically (for debugging CORS issues)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable pre-flight across-the-board

app.use(helmet());
app.use(express.json());

// Health Check
app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

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

// Start Server Logic
console.log('--- STARTUP DEBUG ---');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('npm_lifecycle_event:', process.env.npm_lifecycle_event);
console.log('argv[1]:', process.argv[1]);
console.log('meta.url:', import.meta.url);

const shouldStartServer =
  process.env.NODE_ENV !== 'test' &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.env.npm_lifecycle_event === 'start' ||
    process.env.npm_lifecycle_event === 'dev' ||
    !!process.env.PORT // If PORT is set, assume we need to listen
  );

console.log('shouldStartServer:', shouldStartServer);

if (shouldStartServer) {
  app.listen(PORT, '0.0.0.0', () => { // Explicitly bind to 0.0.0.0
    console.log(`Server running on port ${PORT}`);
  });
} else {
  console.log('Server not starting. shouldStartServer is false.');
}