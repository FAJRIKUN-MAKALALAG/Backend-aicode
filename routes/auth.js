const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const axios = require('axios');
const { requireAuth, cookieOpts, clearCookieOpts, clearAllLegacyCookies, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } = require('../middleware/auth');

// GET /api/auth/me - Retrieve current user (flat object for frontend compatibility)
router.get('/me', requireAuth, async (req, res) => {
    const u = req.user;
    
    // Fetch profile data in case it's not in user_metadata
    let dbAvatar = null;
    let dbUsername = null;
    try {
        const { data } = await supabase.from('profiles').select('avatar_url, username').eq('id', u.id).single();
        if (data) {
            dbAvatar = data.avatar_url;
            dbUsername = data.username;
        }
    } catch (e) {}

    res.json({
        id:       u.id,
        email:    u.email,
        username: dbUsername 
                  || u.user_metadata?.username
                  || u.user_metadata?.full_name
                  || u.user_metadata?.name
                  || u.email?.split('@')[0]
                  || 'User',
        avatar_url: u.user_metadata?.avatar_url || u.user_metadata?.picture || dbAvatar || null
    });
});

// PUT /api/auth/profile - Update user profile
router.put('/profile', requireAuth, async (req, res) => {
    try {
        const { username } = req.body;
        const userId = req.user.id;

        if (!username || username.trim() === '') {
            return res.status(400).json({ error: 'Username is required' });
        }

        // 1. Update public.profiles table (if exists)
        try {
            await supabase
                .from('profiles')
                .update({ username, updated_at: new Date().toISOString() })
                .eq('id', userId);
        } catch (e) {
            console.warn('Could not update profile table:', e.message);
        }

        // 2. Update auth user metadata
        const { data, error } = await supabase.auth.admin.updateUserById(userId, {
            user_metadata: { username }
        });

        if (error) throw error;

        res.json({ 
            success: true, 
            message: 'Profile updated successfully',
            user: {
                id: data.user.id,
                email: data.user.email,
                username: data.user.user_metadata.username,
                avatar_url: data.user.user_metadata.avatar_url || data.user.user_metadata.picture || null
            }
        });
    } catch (error) {
        console.error('Update Profile Error:', error);
        res.status(400).json({ error: error.message || 'Failed to update profile' });
    }
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

        // Clear legacy cookies to prevent shadowing before setting new cookies
        clearAllLegacyCookies(res);

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
    clearAllLegacyCookies(res);
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

        clearAllLegacyCookies(res);
        res.cookie('access_token', data.session.access_token, cookieOpts(ACCESS_TOKEN_TTL));
        if (data.session.refresh_token) {
            res.cookie('refresh_token', data.session.refresh_token, cookieOpts(REFRESH_TOKEN_TTL));
        }

        res.json({
            user: {
                id: data.user.id,
                email: data.user.email,
                username: data.user.user_metadata?.username,
                avatar_url: data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture || null
            },
            message: "Direct cookie auth success"
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

        if (error) {
            // Cek apakah user ini terdaftar via Google OAuth (tidak punya password)
            if (error.message?.toLowerCase().includes('invalid login credentials')) {
                const { data: userData } = await supabase.auth.admin.listUsers();
                const existingUser = userData?.users?.find(u => u.email === email);
                if (existingUser) {
                    const identities = existingUser.identities || [];
                    const isGoogleOnly = identities.some(i => i.provider === 'google')
                        && !identities.some(i => i.provider === 'email');
                    if (isGoogleOnly) {
                        return res.status(401).json({
                            error: 'Akun ini terdaftar via Google. Login dengan tombol "Login with Google", atau klik "Lupa Password" untuk membuat password manual.',
                            hint: 'google_oauth_user'
                        });
                    }
                }
            }
            throw error;
        }

        clearAllLegacyCookies(res);
        res.cookie('access_token', data.session.access_token, cookieOpts(ACCESS_TOKEN_TTL));
        if (data.session.refresh_token) {
            res.cookie('refresh_token', data.session.refresh_token, cookieOpts(REFRESH_TOKEN_TTL));
        }

        res.json({
            user: {
                id: data.user.id,
                email: data.user.email,
                username: data.user.user_metadata.username,
                avatar_url: data.user.user_metadata.avatar_url || data.user.user_metadata.picture || null
            },
            message: "Direct cookie auth success"
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

        clearAllLegacyCookies(res);

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
                username: user.user_metadata.username,
                avatar_url: user.user_metadata.avatar_url || user.user_metadata.picture || null
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

        clearAllLegacyCookies(res);
        res.cookie('access_token', data.session.access_token, cookieOpts(ACCESS_TOKEN_TTL));
        res.cookie('refresh_token', data.session.refresh_token, cookieOpts(REFRESH_TOKEN_TTL));

        res.json({ success: true, message: 'Session refreshed successfully' });
    } catch (error) {
        console.error('Refresh Error:', error);
        clearAllLegacyCookies(res);
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

        // FAST GOOGLE AUTH: Set cookies directly at backend, skip frontend callback UI entirely!
        clearAllLegacyCookies(res);
        res.cookie('access_token', session.access_token, cookieOpts(ACCESS_TOKEN_TTL));
        if (session.refresh_token) {
            res.cookie('refresh_token', session.refresh_token, cookieOpts(REFRESH_TOKEN_TTL));
        }

        const frontendUrl = process.env.FRONTEND_URL || 'https://unklab-aicode.online';
        // Redirect completely to home. Frontend AuthContext will detect the session instantly!
        res.redirect(frontendUrl);

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
