const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crypto = require('crypto');

// Fungsi bantuan untuk men-generate kode unik (6 karakter alfanumerik)
function generateRoomCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase(); // Contoh: 'A1B2C3'
}

// 1. POST /api/challenges - Membuat soal/challenge baru
router.post('/', requireAuth, async (req, res) => {
    try {
        const { title, description, expected_output, time_limit_minutes } = req.body;
        const userId = req.user.id;
        let roomCode = generateRoomCode();

        // Menyimpan challenge baru ke DB
        const { data, error } = await req.supabase
            .from('challenges')
            .insert({
                creator_id: userId,
                title,
                description,
                expected_output,
                time_limit_minutes,
                room_code: roomCode
            })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Create Challenge Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. GET /api/challenges/creator - Mendapatkan semua soal yang dibuat oleh user
router.get('/creator', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { data, error } = await req.supabase
            .from('challenges')
            .select('*')
            .eq('creator_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Get Creator Challenges Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. GET /api/challenges/room/:roomCode - Mendapatkan detail soal berdasarkan kode
router.get('/room/:roomCode', requireAuth, async (req, res) => {
    try {
        const { roomCode } = req.params;
        const { data, error } = await req.supabase
            .from('challenges')
            .select('id, title, description, expected_output, time_limit_minutes, creator_id')
            .eq('room_code', roomCode)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Soal tidak ditemukan atau kode salah.' });
        }

        // Ambil nama pembuat dari tabel profiles
        const { data: profData } = await req.supabase
            .from('profiles')
            .select('username')
            .eq('id', data.creator_id)
            .single();
        
        data.creator_name = profData ? profData.username : "Author (Unknown)";

        res.json(data);
    } catch (error) {
        console.error('Get Challenge by Room Code Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3.5 GET /api/challenges/:challengeId - Mendapatkan detail soal berdasarkan ID
router.get('/:challengeId', requireAuth, async (req, res) => {
    try {
        const { challengeId } = req.params;
        const { data, error } = await req.supabase
            .from('challenges')
            .select('id, title, description, expected_output, time_limit_minutes, creator_id')
            .eq('id', challengeId)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Soal tidak ditemukan.' });
        }

        // Ambil nama pembuat dari tabel profiles
        const { data: profData } = await req.supabase
            .from('profiles')
            .select('username')
            .eq('id', data.creator_id)
            .single();
        
        data.creator_name = profData ? profData.username : "Author (Unknown)";

        res.json(data);
    } catch (error) {
        console.error('Get Challenge by ID Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. POST /api/challenges/:challengeId/join - Bergabung / Mulai mengerjakan soal
router.post('/:challengeId/join', requireAuth, async (req, res) => {
    try {
        const { challengeId } = req.params;
        const { student_name } = req.body || {};
        const userId = req.user.id;

        // Cek apakah user sudah pernah join soal ini
        const { data: existingAnswer, error: checkError } = await req.supabase
            .from('challenge_answers')
            .select('*')
            .eq('challenge_id', challengeId)
            .eq('user_id', userId)
            .maybeSingle(); // Pakai maybeSingle agar tidak throw error jika 0 rows

        if (checkError) {
            console.error('Check Error:', checkError);
            return res.status(500).json({ error: 'Gagal mengecek status pengerjaan.' });
        }

        if (existingAnswer) {
            // Jika sudah tersubmit/selesai, block
            if (existingAnswer.status === 'submitted') {
                return res.status(403).json({ error: 'Anda sudah pernah mengerjakan dan mensubmit jawaban untuk soal ini.' });
            }
            // Jika masih in_progress, kembalikan data existing (lanjutkan draft)
            return res.json({ message: 'Melanjutkan pengerjaan...', answer: existingAnswer });
        }

        // Jika belum pernah, buat record baru
        const { data: newAnswer, error: insertError } = await req.supabase
            .from('challenge_answers')
            .insert({
                challenge_id: challengeId,
                user_id: userId,
                student_name: student_name || "Tanpa Nama",
                status: 'in_progress',
                code_content: '',
                cheats_detected: 0
            })
            .select()
            .maybeSingle();

        if (insertError) {
            console.error('Insert Error:', insertError);
            return res.status(500).json({ error: 'Gagal membuat lembar jawaban baru. Pastikan kolom student_name sudah dibuat.' });
        }

        res.json({ message: 'Berhasil bergabung.', answer: newAnswer });

    } catch (error) {
        console.error('Join Challenge Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. PUT /api/challenges/answers/:answerId/save - Auto-save atau Submit kode jawaban
router.put('/answers/:answerId/save', requireAuth, async (req, res) => {
    try {
        const { answerId } = req.params;
        let { code_content, status, cheats_detected } = req.body; // status: 'in_progress' atau 'submitted'
        const userId = req.user.id;

        // --- PRODUCTION SECURITY ENHANCEMENT ---
        // 1. Ambil data jawaban saat ini untuk validasi keamanan server-side
        const { data: currentAnswer, error: fetchErr } = await req.supabase
            .from('challenge_answers')
            .select('status, created_at, challenge_id')
            .eq('id', answerId)
            .eq('user_id', userId)
            .single();

        if (fetchErr || !currentAnswer) {
            return res.status(404).json({ error: 'Jawaban tidak ditemukan atau akses ditolak.' });
        }

        // 2. Cegah manipulasi sistem: Jika sudah disubmit, tolak modifikasi apa pun!
        if (currentAnswer.status === 'submitted') {
            return res.status(403).json({ error: 'PERINGATAN KEAMANAN: Jawaban sudah di-submit secara final dan terkunci rapat.' });
        }

        // 3. Validasi Batas Waktu Server-Side (Cegah eksploitasi timer client-side)
        const { data: challengeData } = await req.supabase
            .from('challenges')
            .select('time_limit_minutes')
            .eq('id', currentAnswer.challenge_id)
            .single();

        if (challengeData && challengeData.time_limit_minutes) {
            const startTime = new Date(currentAnswer.created_at).getTime();
            const now = Date.now();
            // Berikan toleransi keterlambatan jaringan (latency) sebesar 60 detik
            const maxAllowedTime = startTime + (challengeData.time_limit_minutes * 60000) + 60000; 

            if (now > maxAllowedTime) {
                // Paksa jadikan 'submitted' jika terdeteksi melewati batas mutlak server
                status = 'submitted';
            }
        }
        // ---------------------------------------

        // Update ke database
        const updateData = {
            updated_at: new Date().toISOString()
        };
        if (code_content !== undefined) updateData.code_content = code_content;
        if (status) updateData.status = status;
        if (cheats_detected !== undefined) updateData.cheats_detected = cheats_detected;

        if (status === 'submitted') {
            updateData.submitted_at = new Date().toISOString();
        }

        const { data, error } = await req.supabase
            .from('challenge_answers')
            .update(updateData)
            .eq('id', answerId)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            return res.status(404).json({ error: 'Jawaban gagal tersimpan.' });
        }
        res.json(data);
    } catch (error) {
        console.error('Save Answer Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. GET /api/challenges/:challengeId/answers - Mendapatkan rekap jawaban (Khusus Creator Soal)
router.get('/:challengeId/answers', requireAuth, async (req, res) => {
    try {
        const { challengeId } = req.params;
        const userId = req.user.id;

        // Pastikan yang merequest adalah creator dari soal ini
        const { data: challengeData, error: challengeError } = await req.supabase
            .from('challenges')
            .select('creator_id')
            .eq('id', challengeId)
            .single();

        if (challengeError || challengeData.creator_id !== userId) {
            return res.status(403).json({ error: 'Akses ditolak. Anda bukan pembuat soal ini.' });
        }

        // Ambil semua jawaban untuk soal ini
        const { data: answers, error: answerError } = await req.supabase
            .from('challenge_answers')
            .select('*')
            .eq('challenge_id', challengeId)
            .order('submitted_at', { ascending: false });

        if (answerError) throw answerError;

        res.json(answers || []);
    } catch (error) {
        console.error('Get Challenge Answers Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
