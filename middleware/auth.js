const { createClient } = require('@supabase/supabase-js');
// dotenv sudah di-load di server.js

/**
 * PERBAIKAN KRITIS #1: IS_PROD tidak boleh hanya bergantung pada NODE_ENV
 * karena NODE_ENV sering tidak di-set di .env production!
 * Deteksi dari BACKEND_URL — kalau pakai https:// berarti production.
 */
const IS_PROD = process.env.NODE_ENV === 'production'
    || (process.env.BACKEND_URL || '').startsWith('https://');

console.log(`[auth.js] IS_PROD = ${IS_PROD} (NODE_ENV=${process.env.NODE_ENV}, BACKEND_URL=${process.env.BACKEND_URL})`);

// Options untuk set cookie
function cookieOpts(maxAge) {
    return {
        httpOnly: true,
        secure: IS_PROD,                    // true di production (HTTPS wajib)
        sameSite: IS_PROD ? 'none' : 'lax', // 'none' WAJIB untuk cross-subdomain (unklab-aicode.online <-> api.unklab-aicode.online)
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

/**
 * PERBAIKAN KRITIS #2: ACCESS_TOKEN_TTL di-set ke 8 jam (bukan 1 jam)
 * agar user tidak sering re-login di tengah sesi belajar.
 * Supabase JWT sendiri expire dalam 1 jam, tapi refresh_token akan otomatis
 * memperbarui cookie saat user request berikutnya.
 */
const ACCESS_TOKEN_TTL  = 8 * 60 * 60 * 1000;           // 8 jam (cookie berlaku 8 jam)
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000;     // 30 hari (dari 7 hari)

/**
 * Buat Supabase client sementara untuk operasi refresh per-request.
 * TIDAK pakai singleton agar tidak ada shared session state.
 */
function makeTempClient() {
    const { createClient: mkClient } = require('@supabase/supabase-js');
    return mkClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
    );
}

// Admin client (service_role) — stateless, aman untuk concurrent
const supabaseAdmin = require('../config/supabase');

// ========== AUTH MIDDLEWARE ==========
async function requireAuth(req, res, next) {
    // Sanitize token: tolak string "null", "undefined", atau string kosong
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

        // Step 1: Validasi access_token dengan admin client (stateless, concurrent-safe)
        if (token) {
            const { data, error } = await supabaseAdmin.auth.getUser(token);
            if (!error && data?.user) {
                user = data.user;
            } else {
                console.log(`[requireAuth] Access token expired/invalid (${error?.message}) — mencoba refresh...`);
            }
        }

        // Step 2: Jika access_token expired → refresh dengan refresh_token
        // PERBAIKAN KRITIS #3: Jangan clearCookie saat refresh gagal KECUALI
        // error-nya benar-benar "invalid refresh token" (bukan network error dll)
        if (!user && refreshToken) {
            const tempClient = makeTempClient();
            const { data, error: refreshError } = await tempClient.auth.refreshSession({ refresh_token: refreshToken });

            if (!refreshError && data?.session) {
                // Refresh berhasil — update cookie dengan token baru
                res.cookie('access_token', data.session.access_token, cookieOpts(ACCESS_TOKEN_TTL));
                res.cookie('refresh_token', data.session.refresh_token, cookieOpts(REFRESH_TOKEN_TTL));
                user = data.session.user;
                console.log(`[requireAuth] Token refreshed OK for user ${user.id.substring(0, 8)}...`);
            } else {
                const errMsg = refreshError?.message || 'unknown';
                console.warn(`[requireAuth] Refresh gagal: ${errMsg}`);

                // Hanya clear cookie kalau memang token tidak valid (bukan masalah jaringan)
                const isTokenInvalid = errMsg.includes('invalid') || errMsg.includes('expired') || errMsg.includes('not found');
                if (isTokenInvalid) {
                    res.clearCookie('access_token', clearCookieOpts());
                    res.clearCookie('refresh_token', clearCookieOpts());
                    return res.status(401).json({ error: 'Sesi habis, silakan login kembali' });
                } else {
                    // Error network/server sementara — jangan logout user, beri error 503
                    return res.status(503).json({ error: 'Layanan autentikasi sementara tidak tersedia, coba lagi.' });
                }
            }
        }

        if (!user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        req.user = user;
        next();
    } catch (e) {
        console.error('[requireAuth] Unexpected error:', e.message);
        // Jangan logout user karena unexpected error — bisa jadi network issue
        return res.status(503).json({ error: 'Auth check failed, coba lagi.' });
    }
}

module.exports = {
    requireAuth,
    cookieOpts,
    clearCookieOpts,
    ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL
};
