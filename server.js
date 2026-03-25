const express = require('express');
const cors = require('cors');
require('dotenv').config();
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// Routes & Middleware imports
const authRoutes = require('./routes/auth');
const keyRoutes = require('./routes/keys');
const conversationRoutes = require('./routes/conversations');
const messageRoutes = require('./routes/messages');
const codeRoutes = require('./routes/code');
const chatRoutes = require('./routes/chat');

const app = express();
const port = process.env.PORT || 3000;

// Trust the first proxy (Nginx) to get correct client IP for rate limiting
app.set('trust proxy', 1);

// Explicit CORS configuration — MUST be before rate limiter or any route
const corsOptions = {
    origin: [
        'https://unklab-aicode.online',      // ✅ Frontend production (domain utama)
        'https://www.aicode-unklab.online',  // ✅ Frontend www
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
    max: 2000,                  
    message: 'Too many requests, please try again later.',
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

// Supabase public config
app.get('/api/config/supabase', (req, res) => {
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!anonKey) {
        return res.status(500).json({ error: 'SUPABASE_ANON_KEY not configured' });
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

// Start server
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
