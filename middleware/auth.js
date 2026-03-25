const supabase = require('../config/supabase');

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

        // Jika ada access_token yang valid (bukan null/undefined/kosong), coba validasi dulu
        if (token) {
            const { data, error } = await supabase.auth.getUser(token);
            if (!error && data?.user) {
                user = data.user;
            }
        }
        
        // Jika token tidak valid/expired, otomatis coba lakukan refresh dengan refresh_token
        if (!user && refreshToken) {
            const { data, error: refreshError } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
            if (refreshError || !data?.session) {
                // Refresh juga gagal — bersihkan semua cookie
                res.clearCookie('access_token', clearCookieOpts());
                res.clearCookie('refresh_token', clearCookieOpts());
                return res.status(401).json({ error: 'Sesi habis, silakan login kembali' });
            }
            
            // Refresh berhasil — set cookie baru
            res.cookie('access_token', data.session.access_token, cookieOpts(ACCESS_TOKEN_TTL));
            res.cookie('refresh_token', data.session.refresh_token, cookieOpts(REFRESH_TOKEN_TTL));
            user = data.user;
        }

        if (!user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        
        // Attach user ke req dan lanjutkan
        req.user = user;
        next();
    } catch (e) {
        console.error('[requireAuth] Error:', e.message);
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
