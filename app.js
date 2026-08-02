const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// --- DIAGNOSTIC LOGS ---
process.on('uncaughtException', (err) => {
    console.error('💥 FATAL ERROR (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Promise 💥 FATAL REJECTION at:', promise, 'reason:', reason);
});

// Robustness Check: Pastikan env krusial termuat
const hasSupabaseUrl = !!process.env.SUPABASE_URL;
const hasSupabaseKey = !!(process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!hasSupabaseUrl || !hasSupabaseKey) {
    console.warn("⚠️ SUPABASE_URL or SUPABASE_KEY missing in environment,,,.");
}

// Routes & Middleware imports
const authRoutes = require('./routes/auth');
const keyRoutes = require('./routes/keys');
const conversationRoutes = require('./routes/conversations');
const messageRoutes = require('./routes/messages');
const codeRoutes = require('./routes/code');
const chatRoutes = require('./routes/chat');
const challengeRoutes = require('./routes/challenges');
const kuesionerRoutes = require('./routes/kuesioner');

const app = express();

// Trust the first proxy (Vercel) to get correct client IP for rate limiting
app.set('trust proxy', 1);

// Dynamic CORS configuration to allow local, current production, and Vercel domains
const allowedOrigins = [
    'https://aicode-rho.vercel.app',
    'https://api.unklab-aicode.online',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://localhost:3000',
];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        let isAllowed = allowedOrigins.includes(origin);
        if (!isAllowed) {
            try {
                const hostname = new URL(origin).hostname;
                isAllowed = hostname === 'vercel.app' || hostname.endsWith('.vercel.app');
            } catch (err) {
                isAllowed = false;
            }
        }
        if (isAllowed) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Set-Cookie'],
    credentials: true,
    optionsSuccessStatus: 200,
};

// Enable CORS for all routes
app.use(cors(corsOptions));

// Standard middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// Global rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10000,                  
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    validate: false, 
    keyGenerator: (req) => {
        return req.body?.userId || req.params?.userId || req.ip;
    }
});
app.use(limiter);

// Base route
app.get('/', (req, res) => {
    res.send('AI Code Backend Running');
});

app.get('/api/config/supabase', (req, res) => {
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
    if (!serviceRoleKey) {
        return res.status(500).json({ error: 'Supabase service role key not configured' });
    }
    res.json({ serviceRoleKey });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/keys', keyRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/code', codeRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/kuesioner', kuesionerRoutes);

module.exports = app;
