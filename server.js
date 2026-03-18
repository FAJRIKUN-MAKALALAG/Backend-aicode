const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { encrypt, decrypt } = require('./utils/crypto');
const { systemPrompt } = require('./prompts');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

const axios = require('axios');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Trust the first proxy (Nginx) to get correct client IP for rate limiting
app.set('trust proxy', 1);

// Explicit CORS configuration — MUST be before rate limiter or any route
const corsOptions = {
    origin: [
        'https://unklab-aicode.online',
        'http://localhost:5173',
        'http://localhost:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200, // Some browsers (IE11) choke on 204
};

// Enable CORS for all routes
app.use(cors(corsOptions));

// Global rate limiter — longgar untuk auth, data fetch, dsb.
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 500,                  
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    validate: false, 
});

// Chat rate limiter — per USER ID (bukan per IP)
const chatLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 30,                  
    message: 'Too many chat requests, please slow down.',
    standardHeaders: true,
    legacyHeaders: false,
    validate: false, 
    keyGenerator: (req) => {
        return req.body?.userId || req.ip;
    },
    skip: (req) => {
        return false;
    }
});

app.use(limiter);

app.use(express.json());

// GLOBAL REQUEST LOGGER (Untuk melacak semua request yang masuk)
app.use((req, res, next) => {
    console.log(`[REQ] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});


// Initialize Supabase (if env vars match)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey && supabaseUrl.startsWith('http')) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
    } catch (e) {
        console.warn('Failed to initialize Supabase client:', e.message);
    }
} else {
    console.warn('Supabase credentials not found or invalid in environment');
}

// ========== AUTH MIDDLEWARE ==========
async function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No auth token provided' });
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Auth check failed' });
    }
}

// Routes
app.get('/', (req, res) => {
    res.send('AI Code Backend Running');
});

// Expose Supabase config to frontend (safe to expose URL and Anon Key)
app.get('/api/config/supabase', (req, res) => {
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!anonKey) {
        return res.status(500).json({ error: 'SUPABASE_ANON_KEY not configured in backend' });
    }
    res.json({ anonKey });
});

// ========== AUTHENTICATION API ==========

// POST signup - Create new user
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password, username } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username: username || email.split('@')[0] }
            }
        });

        if (error) throw error;

        // Manually create profile (in case trigger doesn't work)
        try {
            await supabase
                .from('profiles')
                .insert({
                    id: data.user.id,
                    username: username || email.split('@')[0]
                });
        } catch (profileError) {
            // Profile might already exist from trigger, ignore error
            console.log('Profile creation note:', profileError.message);
        }

        res.json({
            user: {
                id: data.user.id,
                email: data.user.email,
                username: data.user.user_metadata.username
            },
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at
            }
        });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(400).json({ error: error.message });
    }
});

// POST login - Sign in existing user
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        res.json({
            user: {
                id: data.user.id,
                email: data.user.email,
                username: data.user.user_metadata.username
            },
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at
            }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(401).json({ error: error.message });
    }
});

// POST logout - Sign out user
app.post('/api/auth/logout', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        // Set the auth token for this request
        const { error } = await supabase.auth.admin.signOut(token);

        if (error) throw error;

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout Error:', error);
        // Even if logout fails, return success (token will expire anyway)
        res.json({ success: true });
    }
});

// POST verify - Verify token and get user info
app.post('/api/auth/verify', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error) throw error;

        res.json({
            user: {
                id: user.id,
                email: user.email,
                username: user.user_metadata.username
            }
        });
    } catch (error) {
        console.error('Verify Error:', error);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
});

// POST forgot-password - Send reset password email
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.FRONTEND_URL || 'https://unklab-aicode.online'}/reset-password`
        });

        if (error) throw error;

        // Always return success to avoid email enumeration attacks
        res.json({ success: true, message: 'If this email is registered, a reset link has been sent.' });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(400).json({ error: error.message });
    }
});

// POST reset-password - Update to new password using recovery token
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { access_token, refresh_token, password } = req.body;

        if (!access_token || !password) {
            return res.status(400).json({ error: 'access_token and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Set the session with the recovery token from the email link
        const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token: refresh_token || access_token,
        });

        if (sessionError) throw sessionError;

        // Update the user's password
        const { error: updateError } = await supabase.auth.updateUser({ password });

        if (updateError) throw updateError;

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(400).json({ error: error.message });
    }
});

// POST refresh - Refresh access token
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({ error: 'Refresh token required' });
        }

        const { data, error } = await supabase.auth.refreshSession({
            refresh_token
        });

        if (error) throw error;

        res.json({
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at
            }
        });
    } catch (error) {
        console.error('Refresh Error:', error);
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});


// ========== NEW GOOGLE OAUTH FLOW (BACKEND MANAGED) ==========

// GET google/login - Redirect user to Google OAuth consent screen
app.get('/api/auth/google/login', (req, res) => {
    const googleAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: `${process.env.BACKEND_URL}/api/auth/google/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account'
    });

    res.redirect(`${googleAuthUrl}?${params.toString()}`);
});

// GET google/callback - Exchange code for tokens and sync with Supabase
app.get('/api/auth/google/callback', async (req, res) => {
    try {
        const { code } = req.query;

        if (!code) {
            return res.status(400).json({ error: 'Authorization code missing' });
        }

        // 1. Exchange authorization code for tokens
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: `${process.env.BACKEND_URL}/api/auth/google/callback`,
            grant_type: 'authorization_code'
        });

        const { id_token, access_token: google_access_token } = tokenResponse.data;

        if (!id_token) {
            throw new Error('Failed to get ID token from Google');
        }

        // 2. Sign in to Supabase using the Google ID token
        // This will automatically create the user if they don't exist
        const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: id_token
        });

        if (authError) throw authError;

        const { user, session } = authData;

        // 3. Sync profile metadata
        const username = user.user_metadata?.full_name
            || user.user_metadata?.name
            || user.email?.split('@')[0]
            || 'user';

        const avatarUrl = user.user_metadata?.avatar_url
            || user.user_metadata?.picture
            || null;

        await supabase
            .from('profiles')
            .upsert({
                id: user.id,
                username,
                avatar_url: avatarUrl,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

        // 4. Redirect back to frontend with session tokens
        // We use URL fragments (#) for security to match Supabase's default behavior
        const frontendUrl = process.env.FRONTEND_URL || 'https://unklab-aicode.online';
        const redirectUrl = new URL(`${frontendUrl}/auth/callback`);
        
        // Add tokens as hash parameters
        redirectUrl.hash = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_at=${session.expires_at}&type=recovery`;

        res.redirect(redirectUrl.toString());

    } catch (error) {
        console.error('Google Callback Error:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'https://unklab-aicode.online';
        res.redirect(`${frontendUrl}/auth/error?message=${encodeURIComponent(error.message)}`);
    }
});

// POST google/callback - Success placeholder for frontend sync
// Backend already synced the profile in the GET callback, so we just return success
app.post('/api/auth/google/callback', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        // We bypass direct Supabase verification here because the GET callback 
        // already verified the user and synced the profile. This POST is for frontend compatibility.
        res.json({
            success: true,
            message: 'Profile already synced via backend redirect',
            user: { provider: 'google' } // Minimal info to satisfy frontend
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get User API Key (check if exists, return masked preview)
app.get('/api/keys/:userId', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;

        // Ownership check: hanya pemilik yang boleh melihat key-nya sendiri
        if (req.user.id !== userId) {
            return res.status(403).json({ error: 'Forbidden: access denied' });
        }

        const { data, error } = await supabase
            .from('user_secrets')
            .select('key_name, encrypted_value, iv, created_at')
            .eq('user_id', userId)
            .eq('key_name', 'GEMINI_API_KEY')
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
            throw error;
        }

        let prefix = null;
        let suffix = null;
        if (data) {
            try {
                const decrypted = decrypt(data.encrypted_value, data.iv);
                prefix = decrypted.substring(0, 4);         // e.g. "AIza"
                suffix = decrypted.slice(-4);               // e.g. "xK3p"
            } catch (e) {
                console.warn('Could not decrypt key for preview:', e.message);
            }
        }

        res.json({
            hasKey: !!data,
            keyName: data?.key_name,
            createdAt: data?.created_at,
            prefix,   // first 4 chars — e.g. "AIza"
            suffix    // last 4 chars  — e.g. "xK3p"
        });
    } catch (error) {
        console.error('Get Key Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET decrypted API key value — requires valid Bearer token (user fetches their own key)
app.get('/api/keys/:userId/value', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;

        // Ownership check (req.user sudah diisi oleh requireAuth)
        if (req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' });

        const { data, error } = await supabase
            .from('user_secrets')
            .select('encrypted_value, iv')
            .eq('user_id', userId)
            .eq('key_name', 'GEMINI_API_KEY')
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        if (!data) return res.status(404).json({ error: 'No API key found. Please add one in Settings.' });

        const decrypted = decrypt(data.encrypted_value, data.iv);
        res.json({ apiKey: decrypted });
    } catch (error) {
        console.error('Decrypt Key Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Save User API Key
app.post('/api/keys', requireAuth, async (req, res) => {
    try {
        const { apiKey } = req.body;
        // userId selalu diambil dari token, bukan dari body (mencegah spoofing)
        const userId = req.user.id;

        if (!apiKey) {
            return res.status(400).json({ error: 'Missing apiKey' });
        }

        // Encrypt the key
        const { encrypted_value, iv } = encrypt(apiKey);

        // Store in DB (upsert)
        const { error } = await supabase
            .from('user_secrets')
            .upsert({
                user_id: userId,
                key_name: 'GEMINI_API_KEY',
                encrypted_value,
                iv
            }, { onConflict: 'user_id, key_name' });

        if (error) throw error;

        res.json({ success: true, message: 'API Key saved successfully' });
    } catch (error) {
        console.error('Save Key Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== CONVERSATIONS API ==========

// GET all conversations for a user
app.get('/api/conversations/:userId', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;

        // Ownership check: user hanya bisa lihat conversations miliknya sendiri
        if (req.user.id !== userId) {
            return res.status(403).json({ error: 'Forbidden: access denied' });
        }

        const { data, error } = await supabase
            .from('conversations')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Get Conversations Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST create new conversation
app.post('/api/conversations', requireAuth, async (req, res) => {
    try {
        const { title } = req.body;
        // userId selalu dari token, tidak percaya body
        const userId = req.user.id;

        if (!title) {
            return res.status(400).json({ error: 'Missing title' });
        }

        const { data, error } = await supabase
            .from('conversations')
            .insert({ user_id: userId, title })
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Create Conversation Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT update conversation title
app.put('/api/conversations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Missing title' });
        }

        const { data, error } = await supabase
            .from('conversations')
            .update({ title, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update Conversation Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE conversation
app.delete('/api/conversations/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Ownership check: pastikan conversation ini milik user yang request
        const { data: conv, error: fetchErr } = await supabase
            .from('conversations')
            .select('user_id')
            .eq('id', id)
            .single();

        if (fetchErr || !conv) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        if (conv.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Forbidden: not your conversation' });
        }

        const { error } = await supabase
            .from('conversations')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Delete Conversation Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== MESSAGES API ==========

// GET all messages in a conversation
app.get('/api/messages/:conversationId', requireAuth, async (req, res) => {
    try {
        const { conversationId } = req.params;

        // Ownership check: pastikan conversation milik user yang request
        const { data: conv, error: convErr } = await supabase
            .from('conversations')
            .select('user_id')
            .eq('id', conversationId)
            .single();

        if (convErr || !conv) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        if (conv.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Forbidden: not your conversation' });
        }

        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Get Messages Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST add message to conversation
app.post('/api/messages', async (req, res) => {
    try {
        const { conversationId, role, content } = req.body;

        if (!conversationId || !role || !content) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const { data, error } = await supabase
            .from('messages')
            .insert({ conversation_id: conversationId, role, content })
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Create Message Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE message
app.delete('/api/messages/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('messages')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Delete Message Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== CODE SNIPPETS API ==========

// GET all code snippets for a user
app.get('/api/code/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const { data, error } = await supabase
            .from('code_snippets')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Get Code Snippets Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET code snippets for a specific conversation
app.get('/api/code/conversation/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;

        const { data, error } = await supabase
            .from('code_snippets')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Get Conversation Code Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST save new code snippet
app.post('/api/code', async (req, res) => {
    try {
        const { userId, conversationId, title, code_content, language } = req.body;

        if (!userId || !code_content || !language) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const { data, error } = await supabase
            .from('code_snippets')
            .insert({
                user_id: userId,
                conversation_id: conversationId || null,
                title: title || null,
                code_content,
                language
            })
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Create Code Snippet Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT update code snippet
app.put('/api/code/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, code_content, language } = req.body;

        const updates = {};
        if (title !== undefined) updates.title = title;
        if (code_content !== undefined) updates.code_content = code_content;
        if (language !== undefined) updates.language = language;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const { data, error } = await supabase
            .from('code_snippets')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update Code Snippet Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE code snippet
app.delete('/api/code/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('code_snippets')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Delete Code Snippet Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/chat', chatLimiter, async (req, res) => {
    // Logging for PM2 monitoring
    console.log("--- REQUEST MASUK ---");
    console.log("User ID:", req.body.userId);
    console.log("Mode:", req.body.mode);
    console.log("Jumlah Pesan History:", req.body.messages?.length);

    // 1. EARLY FLUSH: Set headers and flush immediately
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 2. DUMMY CHUNK: Force open the pipe
    res.write(' ');

    try {
        const { messages: currentMessages, conversationId, userId, mode, apiKey: providedKey } = req.body;

        // 3. Parallel Fetch: API Key and 15-message history
        const [keyResult, historyResult] = await Promise.all([
            (!providedKey && userId) ?
                supabase.from('user_secrets').select('encrypted_value, iv').eq('user_id', userId).eq('key_name', 'GEMINI_API_KEY').single() :
                Promise.resolve({ data: null }),
            conversationId ?
                supabase.from('messages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(15) :
                Promise.resolve({ data: [] })
        ]);

        // 4. Resolve API Key
        let geminiKey = providedKey;
        if (!geminiKey && keyResult.data) {
            try {
                geminiKey = decrypt(keyResult.data.encrypted_value, keyResult.data.iv);
            } catch (e) {
                console.error('Decryption failed:', e);
            }
        }
        geminiKey = geminiKey || process.env.GEMINI_API_KEY;

        if (!geminiKey || geminiKey === 'your_gemini_api_key') {
            res.write(`data: ${JSON.stringify({ error: 'API Key missing. Please set it in Settings.' })}\n\n`);
            return res.end();
        }

        // 5. Map History for SDK
        const historicalContext = (historyResult.data || []).reverse().map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        // 6. Non-Blocking User Msg Save
        const lastUserMsg = currentMessages[currentMessages.length - 1];
        if (conversationId && lastUserMsg) {
            supabase.from('messages').insert({
                conversation_id: conversationId,
                role: lastUserMsg.role,
                content: lastUserMsg.content
            }).catch(err => console.error('BG User Save Error:', err));
        }

        // 7. Prompt Engineering for Fast vs Reasoning
        // No SDK thinking_level used as it causes 400 errors for this endpoint style
        let finalSystemInstruction = systemPrompt;
        if (mode === 'reasoning') {
            finalSystemInstruction = `[REASONING MODE ENABLED]\n${systemPrompt}\n\nTugas Anda: Berikan jawaban yang mendalam, analitis, dan jelaskan langkah-langkah logika Anda secara menyeluruh. Evaluasi berbagai kemungkinan sebelum memberikan solusi akhir.`;
        } else {
            finalSystemInstruction = `[FAST MODE ENABLED]\n${systemPrompt}\n\nTugas Anda: Berikan jawaban yang sangat singkat, padat, langsung ke poinnya, dan efisien.`;
        }

        // 8. SDK Initialization (Using gemini-3-flash-preview)
        console.log("[DEBUG] Initializing SDK with Model: gemini-3-flash-preview");
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-3-flash-preview",
            systemInstruction: finalSystemInstruction
        });

        // 9. Count Input Tokens (Optional logging)
        try {
            const countResult = await model.countTokens({
                contents: [
                    ...historicalContext,
                    ...currentMessages.map(m => ({
                        role: m.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: m.content }]
                    }))
                ]
            });
            console.log(`[TOKEN USAGE] Input Tokens: ${countResult.totalTokens}`);
        } catch (tokenErr) {
            console.warn('Failed to count input tokens:', tokenErr.message);
        }

        // 10. Stream Generation with SDK
        console.log("[DEBUG] Starting generateContentStream...");
        const result = await model.generateContentStream({
            contents: [
                ...historicalContext,
                ...currentMessages.map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                }))
            ]
        });

        // 11. SSE Consumption & Async Assistant Save
        let fullAssistantText = "";
        try {
            console.log("[DEBUG] Consuming SDK stream chunks...");
            for await (const chunk of result.stream) {
                const textChunk = chunk.text();
                if (textChunk) {
                    fullAssistantText += textChunk;
                    res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
                }
            }
            console.log("[DEBUG] Stream consumption finished.");
            res.write('data: [DONE]\n\n');
        } catch (streamErr) {
            console.error('SDK Streaming Error:', streamErr);
            res.write(`data: ${JSON.stringify({ error: 'Streaming failed', details: streamErr.message })}\n\n`);
        } finally {
            console.log("--- RESPONSE KELUAR ---");
            
            // Hitung estimasi token output (kasar: 4 karakter ~ 1 token)
            const estimatedOutputTokens = Math.ceil(fullAssistantText.length / 4);
            console.log(`[TOKEN USAGE] AI Response Length: ${fullAssistantText.length} chars (~${estimatedOutputTokens} tokens)`);
            
            res.end();
            // 11. Background Save AI Response
            if (conversationId && fullAssistantText) {
                supabase.from('messages').insert({
                    conversation_id: conversationId,
                    role: 'assistant',
                    content: fullAssistantText
                }).catch(err => console.error('BG Assistant Save Error:', err));
            }
        }

    } catch (error) {
        console.error('Gemini SDK Error:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

// ========== GROQ FALLBACK CHAT API ==========
app.post('/api/chat/groq-fallback', chatLimiter, requireAuth, async (req, res) => {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array is required' });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(500).json({ error: 'Groq API key not configured' });

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
        const groq = new Groq({ apiKey: groqKey });
        const groqMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content }))
        ];

        const stream = await groq.chat.completions.create({
            messages: groqMessages,
            model: 'moonshotai/kimi-k2-instruct',
            temperature: 0.6,
            max_completion_tokens: 4096,
            top_p: 1,
            stream: true,
            stop: null
        });

        let fullText = "";
        for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
                fullText += text;
                res.write('data: ' + JSON.stringify({ text }) + '\n\n');
            }
        }
        res.write('data: [DONE]\n\n');
        
        // Log Token Usage untuk Groq
        const estTokens = Math.ceil(fullText.length / 4);
        console.log(`[TOKEN USAGE - GROQ] Response Chars: ${fullText.length} (~${estTokens} tokens)`);
        
        res.end();

    } catch (error) {
        console.error('[GROQ FALLBACK ERROR]', error.message);
        res.write('data: ' + JSON.stringify({ error: error.message }) + '\n\n');
        res.end();
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
