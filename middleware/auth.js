const { createClient } = require('@supabase/supabase-js');
// dotenv sudah di-load di server.js

/**
 * PERBAIKAN: IS_PROD deteksi dari BACKEND_URL juga
 * karena NODE_ENV sering tidak di-set di .env production
 */
const IS_PROD = process.env.NODE_ENV === 'production'
    || (process.env.BACKEND_URL || '').startsWith('https://');

console.log(`[auth.js] IS_PROD = ${IS_PROD} (NODE_ENV=${process.env.NODE_ENV}, BACKEND_URL=${process.env.BACKEND_URL})`);

// Anon key untuk client user-scoped (RLS aktif, aman)
const SUPABASE_URL  = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '').trim();

// Options untuk set cookie
function cookieOpts(maxAge) {
    const opts = {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: IS_PROD ? 'none' : 'lax', // 'none' WAJIB untuk cross-subdomain API & Frontend
        path: '/',
        maxAge,
    };
    
    // Explicitly set domain di production agar cookie bersifat first-party
    // untuk subdomain (api.unklab-aicode.online dan unklab-aicode.online)
    if (IS_PROD && process.env.BACKEND_URL && process.env.BACKEND_URL.includes('unklab-aicode.online')) {
        opts.domain = '.unklab-aicode.online';
    } else if (IS_PROD) {
        opts.domain = '.unklab-aicode.online'; // Default to this domain for this project
    }
    
    return opts;
}

// Options untuk clearCookie — HARUS sama persis dengan saat set
function clearCookieOpts() {
    const opts = {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: IS_PROD ? 'none' : 'lax',
        path: '/',
    };

    if (IS_PROD && process.env.BACKEND_URL && process.env.BACKEND_URL.includes('unklab-aicode.online')) {
        opts.domain = '.unklab-aicode.online';
    } else if (IS_PROD) {
        opts.domain = '.unklab-aicode.online';
    }
    
    return opts;
}

/**
 * Utility to aggressively clear cookies on both the primary domain and host-only,
 * to prevent old cookies from shadowing new ones after architecture changes.
 */
function clearAllLegacyCookies(res) {
    const defaultOpts = { path: '/', httpOnly: true, secure: IS_PROD, sameSite: IS_PROD ? 'none' : 'lax' };
    
    // 1. Clear with Explicit Domain
    res.clearCookie('access_token', clearCookieOpts());
    res.clearCookie('refresh_token', clearCookieOpts());
    res.clearCookie('user_data', { path: '/', domain: clearCookieOpts().domain });
    
    // 2. Clear Host-Only (No domain)
    res.clearCookie('access_token', defaultOpts);
    res.clearCookie('refresh_token', defaultOpts);
    res.clearCookie('user_data', { path: '/' });
}

const ACCESS_TOKEN_TTL  = 8 * 60 * 60 * 1000;       // 8 jam
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 hari

/**
 * Buat Supabase client dengan USER JWT sebagai Authorization header.
 * Ini adalah arsitektur yang BENAR untuk Supabase backend:
 * - RLS berjalan normal (auth.uid() = user's actual UUID)
 * - Tidak perlu service_role key untuk bypass RLS
 * - Setiap request terisolasi — tidak ada shared state
 * - Aman untuk concurrent users
 */
function createUserScopedClient(accessToken) {
    return createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
        global: {
            headers: {
                // User's JWT → RLS policies akan baca auth.uid() dari token ini
                Authorization: `Bearer ${accessToken}`
            }
        }
    });
}

// Admin client (service_role) — HANYA untuk operasi auth (getUser, refreshSession)
// Tidak digunakan untuk query DB tabel biasa
const supabaseAdmin = require('../config/supabase');

// ========== AUTH MIDDLEWARE ==========
async function requireAuth(req, res, next) {
    const rawToken = req.cookies.access_token || req.headers.authorization?.replace('Bearer ', '');
    const INVALID_STRINGS = ['null', 'undefined', ''];
    let token = rawToken && !INVALID_STRINGS.includes(rawToken.trim()) ? rawToken.trim() : null;
    const refreshToken = req.cookies.refresh_token;
    const routeLabel = `${req.method} ${req.path}`;

    if (!token && !refreshToken) {
        console.warn(`[requireAuth] No token & no refresh_token — ${routeLabel}`);
        return res.status(401).json({ error: "Sesi habis/Belum login" });
    }

    try {
        let user = null;
        let validToken = token; // Track token yang valid untuk user-scoped client

        // Step 1: Validasi access_token (stateless, concurrent-safe)
        if (token) {
            // console.log(`[requireAuth] Token is truthy! Type: ${typeof token}, Length: ${token.length}, Value starts with: ${token.substring(0, 15)}...`);
            const { data, error } = await supabaseAdmin.auth.getUser(token);
            if (!error && data?.user) {
                user = data.user;
            } else {
                console.log(`[requireAuth] Access token expired: (Error: ${error?.message}, Status: ${error?.status}) — mencoba refresh...`);
            }
        }

        // Step 2: Refresh token jika access_token expired
        if (!user && refreshToken) {
            const { createClient: mkClient } = require('@supabase/supabase-js');
            const tempClient = mkClient(SUPABASE_URL, SUPABASE_ANON, {
                auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
            });

            const { data, error: refreshError } = await tempClient.auth.refreshSession({ refresh_token: refreshToken });

            if (!refreshError && data?.session) {
                // Refresh berhasil — update cookie dan gunakan token baru
                validToken = data.session.access_token;
                res.cookie('access_token', validToken, cookieOpts(ACCESS_TOKEN_TTL));
                res.cookie('refresh_token', data.session.refresh_token, cookieOpts(REFRESH_TOKEN_TTL));
                user = data.session.user;
                console.log(`[requireAuth] Token refreshed OK for user ${user.id.substring(0, 8)}...`);
            } else {
                const errMsg = refreshError?.message || 'unknown';
                console.warn(`[requireAuth] Refresh gagal: ${errMsg}`);

                // Hanya clear cookie jika token benar-benar tidak valid
                const isTokenInvalid = errMsg.includes('invalid') || errMsg.includes('expired') || errMsg.includes('not found') || errMsg.includes('session');
                if (isTokenInvalid) {
                    clearAllLegacyCookies(res);
                    return res.status(401).json({ error: 'Sesi habis, silakan login kembali' });
                } else {
                    return res.status(503).json({ error: 'Layanan autentikasi sementara tidak tersedia, coba lagi.' });
                }
            }
        }

        if (!user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Attach user dan user-scoped supabase client ke request
        req.user = user;
        // req.supabase = client dengan user's JWT → RLS auth.uid() bekerja benar
        // Setiap request punya client-nya sendiri → TIDAK ada shared state antar user
        req.supabase = createUserScopedClient(validToken);
        next();
    } catch (e) {
        console.error('[requireAuth] Unexpected error:', e.message);
        return res.status(503).json({ error: 'Auth check failed, coba lagi.' });
    }
}

module.exports = {
    requireAuth,
    cookieOpts,
    clearCookieOpts,
    clearAllLegacyCookies,
    ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL
};
