const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const axios = require('axios');
const { requireAuth, cookieOpts, clearCookieOpts, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } = require('../middleware/auth');

// GET /api/me - Retrieve current user explicitly
router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
});

// POST /api/auth/set-session - Ubah token jadi HTTP-Only Cookie secara aman
router.post('/set-session', async (req, res) => {
    try {
        const { access_token, refresh_token } = req.body;
        
        if (!access_token) {
            return res.status(400).json({ error: "Access token required" });
        }

        // Validate token to Supabase instead of trusting frontend user data
        const { data: { user }, error } = await supabase.auth.getUser(access_token);
        
        if (error || !user) {
            return res.status(401).json({ error: "Invalid token" });
        }

        // Set access_token cookie
        res.cookie('access_token', access_token, cookieOpts(ACCESS_TOKEN_TTL));

        // Set refresh_token cookie jika tersedia
        if (refresh_token) {
            res.cookie('refresh_token', refresh_token, cookieOpts(REFRESH_TOKEN_TTL));
        }

        res.json({ message: "Session berhasil dibuat", user });
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
});

// POST /api/auth/clear-session - Hapus cookie secara total
router.post('/clear-session', (req, res) => {
    res.clearCookie('access_token', clearCookieOpts());
    res.clearCookie('refresh_token', clearCookieOpts());
    res.clearCookie('user_data', { path: '/' }); 
    res.json({ message: "Session berhasil dihapus" });
});

// POST /api/auth/signup - Create new user
router.post('/signup', async (req, res) => {
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

        try {
            await supabase
                .from('profiles')
                .insert({
                    id: data.user.id,
                    username: username || email.split('@')[0]
                });
        } catch (profileError) {
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

// POST /api/auth/login - Sign in existing user
router.post('/login', async (req, res) => {
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

// POST /api/auth/logout - Sign out user
router.post('/logout', async (req, res) => {
    try {
        const token = req.cookies.access_token || req.headers.authorization?.replace('Bearer ', '');

        res.clearCookie('access_token', clearCookieOpts());
        res.clearCookie('refresh_token', clearCookieOpts());
        res.clearCookie('user_data', { path: '/' });

        if (token) {
            await supabase.auth.admin.signOut(token).catch(e => {
                console.warn('Supabase signOut warning:', e.message);
            });
        }

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout Error:', error);
        res.json({ success: true });
    }
});

// POST /api/auth/verify - Verify token
router.post('/verify', async (req, res) => {
    try {
        const token = req.cookies.access_token || req.headers.authorization?.replace('Bearer ', '');

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

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.FRONTEND_URL || 'https://unklab-aicode.online'}/reset-password`
        });

        if (error) throw error;

        res.json({ success: true, message: 'If this email is registered, a reset link has been sent.' });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(400).json({ error: error.message });
    }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    try {
        const { access_token, refresh_token, password } = req.body;

        if (!access_token || !password) {
            return res.status(400).json({ error: 'access_token and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token: refresh_token || access_token,
        });

        if (sessionError) throw sessionError;

        const { error: updateError } = await supabase.auth.updateUser({ password });

        if (updateError) throw updateError;

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(400).json({ error: error.message });
    }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
    try {
        const refresh_token = req.cookies.refresh_token;

        if (!refresh_token) {
            return res.status(401).json({ error: 'Refresh token required' });
        }

        const { data, error } = await supabase.auth.refreshSession({
            refresh_token
        });

        if (error) throw error;

        res.cookie('access_token', data.session.access_token, cookieOpts(ACCESS_TOKEN_TTL));
        res.cookie('refresh_token', data.session.refresh_token, cookieOpts(REFRESH_TOKEN_TTL));

        res.json({ success: true, message: 'Session refreshed successfully' });
    } catch (error) {
        console.error('Refresh Error:', error);
        res.clearCookie('access_token', clearCookieOpts());
        res.clearCookie('refresh_token', clearCookieOpts());
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

// ========== GOOGLE OAUTH ROUTES ==========

router.get('/google/login', (req, res) => {
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

router.get('/google/callback', async (req, res) => {
    try {
        const { code } = req.query;

        if (!code) {
            return res.status(400).json({ error: 'Authorization code missing' });
        }

        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: `${process.env.BACKEND_URL}/api/auth/google/callback`,
            grant_type: 'authorization_code'
        });

        const { id_token } = tokenResponse.data;

        if (!id_token) {
            throw new Error('Failed to get ID token from Google');
        }

        const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: id_token
        });

        if (authError) throw authError;

        const { user, session } = authData;

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

        const frontendUrl = process.env.FRONTEND_URL || 'https://unklab-aicode.online';
        const redirectUrl = new URL(`${frontendUrl}/auth/callback`);
        
        redirectUrl.hash = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=${session.expires_in || 3600}&token_type=bearer&type=magiclink`;

        res.redirect(redirectUrl.toString());

    } catch (error) {
        console.error('Google Callback Error:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'https://unklab-aicode.online';
        const errorMsg = encodeURIComponent(error.message);
        res.redirect(`${frontendUrl}/auth/error?message=${errorMsg}`);
    }
});

router.post('/google/callback', async (req, res) => {
    try {
        const token = req.cookies.access_token || req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        res.json({
            success: true,
            message: 'Profile already synced via backend redirect',
            user: { provider: 'google' }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
