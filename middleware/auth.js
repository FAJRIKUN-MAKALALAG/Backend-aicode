const { createClient } = require('@supabase/supabase-js');
// dotenv sudah di-load di server.js

const IS_PROD = process.env.NODE_ENV === 'production';

// Options untuk set cookie
function cookieOpts(maxAge) {
    return {
        httpOnly: true,
        secure: IS_PROD,                    // true di production (HTTPS wajib)
        sameSite: IS_PROD ? 'none' : 'lax', // 'none' wajib untuk cross-origin beda domain
        path: '/',
        maxAge,
    };
}

// Options untuk clearCookie — HARUS sama persis dengan saat set agar browser benar hapus
function clearCookieOpts() {
    return {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: IS_PROD ? 'none' : 'lax',
        path: '/',
    };
}

const ACCESS_TOKEN_TTL  = 60 * 60 * 1000;           // 1 jam
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 hari

/**
 * Buat Supabase client BARU per-validasi dengan token user.
 * Ini SOLUSI UTAMA untuk masalah concurrent login:
 * - Tidak ada shared session state antar user
 * - Setiap request validasi token-nya sendiri secara independen
 * - Aman untuk banyak user login bersamaan
 */
function createUserClient(accessToken) {
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false,
            },
            global: {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        }
    );
}

// Admin client (service_role) — untuk operasi privileged seperti validasi token
// Singleton aman karena tidak ada session state (persistSession: false di supabase.js)
const supabaseAdmin = require('../config/supabase');

// ========== AUTH MIDDLEWARE ==========
async function requireAuth(req, res, next) {
    // Sanitize token: tolak string "null", "undefined", atau string kosong
    const rawToken = req.cookies.access_token || req.headers.authorization?.replace('Bearer ', '');
    const INVALID_STRINGS = ['null', 'undefined', ''];
    let token = rawToken && !INVALID_STRINGS.includes(rawToken.trim()) ? rawToken.trim() : null;
    const refreshToken = req.cookies.refresh_token;

    if (!token && !refreshToken) {
        return res.status(401).json({ error: "Sesi habis/Belum login" });
    }

    try {
        let user = null;

        // Validasi access_token menggunakan admin client yang stateless
        // getUser(token) pada service_role client → langsung validasi JWT ke Supabase Auth
        // Tidak ada shared session state → aman untuk concurrent users
        if (token) {
            const { data, error } = await supabaseAdmin.auth.getUser(token);
            if (!error && data?.user) {
                user = data.user;
            } else if (error) {
                console.log(`[requireAuth] Access token invalid: ${error.message}`);
            }
        }

        // Jika access_token tidak valid/expired, coba refresh dengan refresh_token
        if (!user && refreshToken) {
            // Buat client sementara khusus untuk refresh ini saja → stateless per-request
            const { createClient: mkClient } = require('@supabase/supabase-js');
            const tempClient = mkClient(
                process.env.SUPABASE_URL,
                process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY,
                { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
            );

            const { data, error: refreshError } = await tempClient.auth.refreshSession({ refresh_token: refreshToken });

            if (refreshError || !data?.session) {
                console.warn(`[requireAuth] Refresh token gagal: ${refreshError?.message}`);
                // Refresh juga gagal — bersihkan semua cookie
                res.clearCookie('access_token', clearCookieOpts());
                res.clearCookie('refresh_token', clearCookieOpts());
                return res.status(401).json({ error: 'Sesi habis, silakan login kembali' });
            }

            // Refresh berhasil — set cookie baru
            res.cookie('access_token', data.session.access_token, cookieOpts(ACCESS_TOKEN_TTL));
            res.cookie('refresh_token', data.session.refresh_token, cookieOpts(REFRESH_TOKEN_TTL));
            user = data.session.user;
        }

        if (!user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Attach user ke req dan lanjutkan
        req.user = user;
        next();
    } catch (e) {
        console.error('[requireAuth] Unexpected error:', e.message);
        return res.status(401).json({ error: 'Auth check failed' });
    }
}

module.exports = {
    requireAuth,
    cookieOpts,
    clearCookieOpts,
    ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL
};
