const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// ─── Middleware: cek role admin dari user_metadata ───────────────────────────
// Role disimpan di auth.users.user_metadata.role — diset manual via SQL/Supabase Dashboard
// TIDAK ada UI untuk set role → aman dari manipulasi user biasa
async function requireAdmin(req, res, next) {
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({ error: 'Sesi tidak valid. Silakan login ulang.' });
    }

    try {
        // Ambil user data via service_role (bypass RLS) → baca user_metadata.role
        const { data, error } = await supabase.auth.admin.getUserById(userId);

        if (error || !data?.user) {
            console.warn('[requireAdmin] Failed to fetch user:', error?.message);
            return res.status(401).json({ error: 'Sesi tidak valid. Silakan login ulang.' });
        }

        const role = data.user.user_metadata?.role;

        if (role !== 'admin') {
            console.warn(`[requireAdmin] Akses ditolak untuk user ${userId} (role: ${role || 'user'})`);
            return res.status(403).json({ error: 'Akses ditolak. Hanya admin yang dapat melihat halaman ini.' });
        }

        // Lanjut ke handler berikutnya
        next();
    } catch (e) {
        console.error('[requireAdmin] Unexpected error:', e.message);
        return res.status(500).json({ error: 'Server error saat validasi akses.' });
    }
}


// ─── Helper: ambil status kuesioner dari DB ──────────────────────────────────
async function getKuesionerStatus() {
    const { data } = await supabase
        .from('kuesioner_settings')
        .select('is_active')
        .eq('id', 1)
        .single();
    return data?.is_active ?? false;
}

// ─── GET /api/kuesioner/status ───────────────────────────────────────────────
// Public — frontend cek apakah kuesioner sedang aktif atau tidak
router.get('/status', async (req, res) => {
    try {
        const isActive = await getKuesionerStatus();
        res.json({ is_active: isActive });
    } catch (e) {
        console.error('[GET /status] Error:', e.message);
        res.status(500).json({ error: 'Gagal mengambil status kuesioner.' });
    }
});

// ─── POST /api/kuesioner/admin/toggle ────────────────────────────────────────
// Admin only — aktifkan atau nonaktifkan form kuesioner
router.post('/admin/toggle', requireAuth, requireAdmin, async (req, res) => {
    try {
        // Ambil status sekarang
        const currentStatus = await getKuesionerStatus();
        const newStatus = !currentStatus;

        // Update di DB (upsert agar row pasti ada)
        const { error } = await supabase
            .from('kuesioner_settings')
            .upsert({ id: 1, is_active: newStatus, updated_at: new Date().toISOString() }, { onConflict: 'id' });

        if (error) {
            console.error('[POST /admin/toggle] Supabase error:', error.message);
            return res.status(500).json({ error: 'Gagal mengubah status kuesioner.' });
        }

        console.log(`[POST /admin/toggle] Kuesioner status → ${newStatus ? 'AKTIF' : 'NONAKTIF'}`);
        res.json({ success: true, is_active: newStatus });
    } catch (e) {
        console.error('[POST /admin/toggle] Unexpected error:', e.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// ─── POST /api/kuesioner ─────────────────────────────────────────────────────
// Public — siapapun bisa submit tanpa login
router.post('/', async (req, res) => {
    try {
        const { nama, email, answers, pesan } = req.body;

        // Validasi input
        if (!nama || typeof nama !== 'string' || !nama.trim()) {
            return res.status(400).json({ error: 'Nama lengkap wajib diisi.' });
        }
        if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ error: 'Format email tidak valid.' });
        }
        if (!answers || typeof answers !== 'object') {
            return res.status(400).json({ error: 'Jawaban tidak valid.' });
        }

        // Validasi semua 10 pertanyaan terisi dengan nilai 1-5
        const Q_KEYS = ['q1','q2','q3','q4','q5','q6','q7','q8','q9','q10'];
        for (const key of Q_KEYS) {
            const val = answers[key];
            if (!val || typeof val !== 'number' || val < 1 || val > 5 || !Number.isInteger(val)) {
                return res.status(400).json({ error: `Jawaban untuk ${key} tidak valid. Nilai harus 1-5.` });
            }
        }

        // Cek apakah kuesioner sedang aktif
        const isActive = await getKuesionerStatus();
        if (!isActive) {
            return res.status(403).json({ error: 'Kuesioner sedang tidak aktif. Pengumpulan jawaban telah ditutup.' });
        }

        // Cek apakah email sudah pernah mengisi
        const userEmail = email.trim().toLowerCase();
        const { data: existingUsers, error: checkError } = await supabase
            .from('kuesioner_responses')
            .select('id')
            .eq('email', userEmail)
            .limit(1);

        if (checkError) {
            console.error('[POST /kuesioner] Supabase check email error:', checkError.message);
            return res.status(500).json({ error: 'Gagal memvalidasi data user. Silakan coba lagi.' });
        }

        if (existingUsers && existingUsers.length > 0) {
            return res.status(400).json({ error: 'Email ini sudah pernah digunakan untuk mengisi kuesioner. Setiap orang hanya dapat mengisi satu kali.' });
        }

        // Hitung total skor
        const totalSkor = Q_KEYS.reduce((sum, key) => sum + answers[key], 0);

        // Simpan ke Supabase
        const { error } = await supabase
            .from('kuesioner_responses')
            .insert({
                nama: nama.trim(),
                email: userEmail,
                answers,
                total_skor: totalSkor,
                pesan: pesan ? pesan.trim() : null,
            });

        if (error) {
            console.error('[POST /kuesioner] Supabase insert error:', error.message);
            return res.status(500).json({ error: 'Gagal menyimpan data. Silakan coba lagi.' });
        }

        console.log(`[POST /kuesioner] Responden baru: ${nama.trim()} <${email.trim()}> | Skor: ${totalSkor}`);
        res.json({ success: true, message: 'Kuesioner berhasil dikirim. Terima kasih!' });

    } catch (e) {
        console.error('[POST /kuesioner] Unexpected error:', e.message);
        res.status(500).json({ error: 'Server error. Silakan coba lagi.' });
    }
});

// ─── GET /api/kuesioner/admin/stats ─────────────────────────────────────────
// Admin only — statistik lengkap + rekap per pertanyaan
router.get('/admin/stats', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('kuesioner_responses')
            .select('*')
            .order('submitted_at', { ascending: false });

        if (error) {
            console.error('[GET /admin/stats] Supabase error:', error.message);
            return res.status(500).json({ error: 'Gagal mengambil data dari database.' });
        }

        const jumlahResponden = data.length;
        const totalSkorSemua = data.reduce((sum, r) => sum + (r.total_skor || 0), 0);
        const skorMaksimum = 10 * jumlahResponden * 5;
        const persentase = skorMaksimum > 0
            ? parseFloat(((totalSkorSemua / skorMaksimum) * 100).toFixed(2))
            : 0;

        // Rekap SS/S/N/TS/STS per pertanyaan
        const Q_KEYS = ['q1','q2','q3','q4','q5','q6','q7','q8','q9','q10'];
        const perPertanyaan = Q_KEYS.map((qKey, idx) => {
            const counts = { q: idx + 1, ss: 0, s: 0, n: 0, ts: 0, sts: 0, total: 0 };
            data.forEach(r => {
                const val = r.answers?.[qKey] || 0;
                if (val === 5) counts.ss++;
                else if (val === 4) counts.s++;
                else if (val === 3) counts.n++;
                else if (val === 2) counts.ts++;
                else if (val === 1) counts.sts++;
                counts.total += val;
            });
            return counts;
        });

        res.json({
            jumlah_pertanyaan: 10,
            jumlah_responden: jumlahResponden,
            total_skor_semua: totalSkorSemua,
            skor_maksimum: skorMaksimum,
            persentase,
            per_pertanyaan: perPertanyaan,
            responses: data, // data lengkap semua responden (untuk tabel detail)
        });

    } catch (e) {
        console.error('[GET /admin/stats] Unexpected error:', e.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// ─── GET /api/kuesioner/admin/responses ─────────────────────────────────────
// Admin only — semua data responden individual
router.get('/admin/responses', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('kuesioner_responses')
            .select('*')
            .order('submitted_at', { ascending: false });

        if (error) {
            console.error('[GET /admin/responses] Supabase error:', error.message);
            return res.status(500).json({ error: 'Gagal mengambil data responden.' });
        }

        res.json(data);

    } catch (e) {
        console.error('[GET /admin/responses] Unexpected error:', e.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
