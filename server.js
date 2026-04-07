const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// Robustness Check: Pastikan env krusial termuat
const hasSupabaseUrl = !!process.env.SUPABASE_URL;
const hasSupabaseKey = !!(process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!hasSupabaseUrl || !hasSupabaseKey) {
    console.error("❌ CRITICAL ERROR: .env variables failed to load!");
    console.log("Looking for .env at:", path.join(__dirname, '.env'));
    console.log("  SUPABASE_URL:", hasSupabaseUrl ? '✅ found' : '❌ MISSING');
    console.log("  SUPABASE_KEY:", hasSupabaseKey ? '✅ found' : '❌ MISSING');
} else {
    console.log('✅ Env loaded OK — SUPABASE_URL & SUPABASE_KEY found');
}

// Version: 1.0.3 - CI/CD Robustness Pack

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
const port = process.env.PORT || 3000;

// Trust the first proxy (Nginx) to get correct client IP for rate limiting
app.set('trust proxy', 1);

// Explicit CORS configuration — MUST be before rate limiter or any route
const corsOptions = {
    origin: [
        'https://unklab-aicode.online',      // ✅ Domain utama
        'https://api.unklab-aicode.online',  // Domain API
        'http://localhost:5173',             // Dev frontend Vite
        'http://localhost:8080',             // Dev alt
        'http://localhost:3000',             // Dev Express
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Set-Cookie'],
    credentials: true,
    optionsSuccessStatus: 200,
};

// Enable CORS for all routes
app.use(cors(corsOptions));

// Standard middleware (cors is already handled above)
app.use(express.json());
app.use(cookieParser());

// Global rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10000,                  
    message: 'Too many requests, please try again laterr',
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

// Supabase public config — kirim anon key ke frontend agar bisa init Supabase client
// Prioritas: SUPABASE_ANON_KEY (jika ada) → fallback ke SUPABASE_KEY (biasanya service role, tapi aman untuk dibaca frontend jika memang anon)
app.get('/api/config/supabase', (req, res) => {
    const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '').trim();
    if (!anonKey) {
        return res.status(500).json({ error: 'Supabase anon key not configured' });
    }
    res.json({ anonKey });
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

// Start server
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
