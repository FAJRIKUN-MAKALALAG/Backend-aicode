const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// --- DIAGNOSTIC LOGS ---
process.on('uncaughtException', (err) => {
    console.error('💥 FATAL ERROR (Uncaught Exception):', err);
    // Beri waktu log untuk ter-flush sebelum exit
    setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Promise 💥 FATAL REJECTION at:', promise, 'reason:', reason);
});

process.on('exit', (code) => {
    console.log(`🛑 Process is exiting with code: ${code}`);
});
// -----------------------

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

// --- System Monitoring & Logging (PM2 Logs) ---
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        
        // Coba dapatkan informasi user jika melewati middleware requireAuth
        const userIdentifier = req.user ? (req.user.email || req.user.id || 'Unknown User') : 'Anonymous';
        
        // LOG INTO PM2 (Bisa dilihat dari pm2 logs)
        const logColor = res.statusCode >= 500 ? '\x1b[31m' : (res.statusCode >= 400 ? '\x1b[33m' : '\x1b[32m'); // Red for 5xx, Yellow for 4xx, Green for 2xx/3xx
        const resetColor = '\x1b[0m';
        console.log(`[API REQUEST] ${logColor}${req.method} ${req.originalUrl}${resetColor} - Status: ${res.statusCode} - Duration: ${duration}ms - User: ${userIdentifier}`);
        
        if (res.statusCode >= 400) {
            console.error(`[API ERROR] ❌ Terjadi error ${res.statusCode} pada endpoint ${req.originalUrl} oleh User: ${userIdentifier}`);
        }
    });
    next();
});
// ----------------------------------------------

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
// PERBAIKAN: Naikkan limit JSON untuk memfasilitasi pengiriman gambar base64 berukuran besar (misal: 10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
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

// Start server with robust error handling
const server = app.listen(port, () => {
    console.log(`🚀 Server listening on port ${port}`);
    
    // Keep-alive: Pastikan event loop tidak kosong agar tidak exit code 0
    setInterval(() => {
        // Dummy interval
    }, 1000 * 60 * 60); 
});

server.on('error', (err) => {
    console.error('❌ SERVER CRITICAL ERROR:', err);
    if (err.code === 'EADDRINUSE') {
        console.error(`Gagal: Port ${port} sudah digunakan oleh aplikasi lain!`);
    }
    process.exit(1);
});
