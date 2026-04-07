const { createClient } = require('@supabase/supabase-js');
// dotenv sudah di-load di server.js, JANGAN load ulang di sini

const supabaseUrl  = (process.env.SUPABASE_URL || '').trim();
// Support SUPABASE_KEY (service_role) ATAU SUPABASE_SERVICE_ROLE_KEY
const supabaseKey  = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ [supabase.js] SUPABASE_URL atau SUPABASE_KEY tidak ditemukan di .env!');
}

/**
 * Gunakan SERVICE ROLE KEY + persistSession: false agar:
 * 1. Backend punya akses penuh (bypass RLS) untuk validasi token user
 * 2. TIDAK ada shared session state antar request → aman untuk concurrent users
 * 3. Setiap call getUser(token) bersifat stateless & independen
 */
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,   // Backend tidak perlu auto-refresh
        persistSession: false,     // KRITIS: Tidak simpan session di memory global
        detectSessionInUrl: false, // Tidak relevan untuk backend
    }
});

module.exports = supabase;
