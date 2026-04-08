const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const crypto = require('crypto');
const supabaseAdmin = require('../config/supabase'); // Service role — bypass RLS untuk operasi admin

// Fungsi bantuan untuk men-generate kode unik (6 karakter alfanumerik)
function generateRoomCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase(); // Contoh: 'A1B2C3'
}

// IMI. POST /api/challenges/upload-image - Upload gambar soal ke Supabase Storage
// Menerima { base64, mimeType, prefix } dari frontend
// Menggunakan service_role key (supabaseAdmin) agar bypass RLS Storage
router.post('/upload-image', requireAuth, async (req, res) => {
    try {
        const { base64, mimeType, prefix = 'misc' } = req.body;
        if (!base64 || !mimeType) {
            return res.status(400).json({ error: 'base64 dan mimeType wajib diisi.' });
        }

        // Konversi base64 ke Buffer
        const buffer = Buffer.from(base64, 'base64');
        const ext = mimeType.split('/')[1] || 'png';
        const path = `${prefix}/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;

        // Upload ke Supabase Storage pakai supabaseAdmin (service_role key)
        const { error: uploadError } = await supabaseAdmin.storage
            .from('challenge-images')
            .upload(path, buffer, {
                contentType: mimeType,
                upsert: true,
            });

        if (uploadError) throw uploadError;

        // Ambil public URL
        const { data } = supabaseAdmin.storage
            .from('challenge-images')
            .getPublicUrl(path);

        res.json({ url: data.publicUrl });
    } catch (error) {
        console.error('Upload Image Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 1. POST /api/challenges - Membuat soal/challenge baru
router.post('/', requireAuth, async (req, res) => {
    try {
        const { title, description, expected_output, time_limit_minutes, max_tab_switches } = req.body;
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
                max_tab_switches: max_tab_switches || 2, // Default max tab switches
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
            .select('id, title, description, expected_output, time_limit_minutes, creator_id, max_tab_switches')
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

// 3.5 GET /api/challenges/my-history - Riwayat ujian untuk user yang login
// HARUS didefinisikan SEBELUM /:challengeId agar tidak konflik route di Express!
router.get('/my-history', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: answers, error } = await req.supabase
            .from('challenge_answers')
            .select(`
                id,
                status,
                grade,
                submitted_at,
                updated_at,
                created_at,
                student_name,
                teacher_comment,
                cheats_detected,
                challenge_id,
                challenges (
                    id,
                    title,
                    description,
                    room_code,
                    time_limit_minutes
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(answers || []);
    } catch (error) {
        console.error('My History Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ── CHALLENGE QUESTIONS ──────────────────────────────────────────────────────

// Q1. GET /api/challenges/:challengeId/questions - Ambil semua soal dalam ujian
router.get('/:challengeId/questions', requireAuth, async (req, res) => {
    try {
        const { challengeId } = req.params;
        const { data, error } = await req.supabase
            .from('challenge_questions')
            .select('*')
            .eq('challenge_id', challengeId)
            .order('nomor', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Get Questions Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Q2. POST /api/challenges/:challengeId/questions - Tambah soal baru ke ujian
router.post('/:challengeId/questions', requireAuth, async (req, res) => {
    try {
        const { challengeId } = req.params;
        const { description, description_image_url, expected_output, expected_output_image_url } = req.body;
        const userId = req.user.id;

        // Pastikan hanya creator yang bisa tambah soal
        const { data: ch, error: chErr } = await req.supabase
            .from('challenges')
            .select('creator_id')
            .eq('id', challengeId)
            .single();

        if (chErr || !ch || ch.creator_id !== userId) {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        // Hitung nomor soal berikutnya (pakai req.supabase agar sesuai konteks user pembuat soal)
        const { count } = await req.supabase
            .from('challenge_questions')
            .select('id', { count: 'exact', head: true })
            .eq('challenge_id', challengeId);

        const nomor = (count || 0) + 1;

        // INSERT pakai req.supabase (native RLS)
        const { data, error } = await req.supabase
            .from('challenge_questions')
            .insert({
                challenge_id: challengeId,
                nomor,
                description: description || null,
                description_image_url: description_image_url || null,
                expected_output: expected_output || null,
                expected_output_image_url: expected_output_image_url || null,
            })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        console.error('Add Question Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Q3. PUT /api/challenges/questions/:questionId - Edit soal
router.put('/questions/:questionId', requireAuth, async (req, res) => {
    try {
        const { questionId } = req.params;
        const { description, description_image_url, expected_output, expected_output_image_url } = req.body;
        const userId = req.user.id;

        // Ambil challenge_id dari soal, lalu cek creator
        const { data: q, error: qErr } = await req.supabase
            .from('challenge_questions')
            .select('challenge_id')
            .eq('id', questionId)
            .single();

        if (qErr || !q) return res.status(404).json({ error: 'Soal tidak ditemukan.' });

        const { data: ch } = await req.supabase
            .from('challenges')
            .select('creator_id')
            .eq('id', q.challenge_id)
            .single();

        if (!ch || ch.creator_id !== userId) {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        // UPDATE pakai req.supabase (native RLS)
        const { data, error } = await req.supabase
            .from('challenge_questions')
            .update({
                description: description ?? null,
                description_image_url: description_image_url ?? null,
                expected_output: expected_output ?? null,
                expected_output_image_url: expected_output_image_url ?? null,
            })
            .eq('id', questionId)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Update Question Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Q4. DELETE /api/challenges/questions/:questionId - Hapus soal
router.delete('/questions/:questionId', requireAuth, async (req, res) => {
    try {
        const { questionId } = req.params;
        const userId = req.user.id;

        const { data: q } = await req.supabase
            .from('challenge_questions')
            .select('challenge_id')
            .eq('id', questionId)
            .single();

        if (!q) return res.status(404).json({ error: 'Soal tidak ditemukan.' });

        const { data: ch } = await req.supabase
            .from('challenges')
            .select('creator_id')
            .eq('id', q.challenge_id)
            .single();

        if (!ch || ch.creator_id !== userId) {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        // DELETE pakai req.supabase (native RLS)
        const { error } = await req.supabase
            .from('challenge_questions')
            .delete()
            .eq('id', questionId);

        if (error) throw error;

        // Re-nomor soal yang tersisa (pakai req.supabase)
        const { data: remaining } = await req.supabase
            .from('challenge_questions')
            .select('id')
            .eq('challenge_id', q.challenge_id)
            .order('nomor', { ascending: true });

        if (remaining && remaining.length > 0) {
            await Promise.all(remaining.map((r, idx) =>
                req.supabase
                    .from('challenge_questions')
                    .update({ nomor: idx + 1 })
                    .eq('id', r.id)
            ));
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Delete Question Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3.6 GET /api/challenges/:challengeId - Mendapatkan detail soal berdasarkan ID
router.get('/:challengeId', requireAuth, async (req, res) => {
    try {
        const { challengeId } = req.params;
        const { data, error } = await req.supabase
            .from('challenges')
            .select('id, title, description, expected_output, time_limit_minutes, creator_id, room_code, max_tab_switches')
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
            // Jika sudah tersubmit/selesai, block KECUALI ada soal baru
            if (existingAnswer.status === 'submitted') {
                // Cek apakah ada soal yang ditambahkan setelah user mensubmit
                const submitTime = existingAnswer.submitted_at 
                    ? new Date(existingAnswer.submitted_at) 
                    : new Date(existingAnswer.updated_at);
                
                const { data: latestQuestion } = await req.supabase
                    .from('challenge_questions')
                    .select('created_at')
                    .eq('challenge_id', challengeId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (latestQuestion && latestQuestion.created_at) {
                    const latestQuestionTime = new Date(latestQuestion.created_at);
                    if (latestQuestionTime > submitTime) {
                        // Buka kembali ujian ke status in_progress dan reset waktu mulai (created_at)
                        const { data: updatedAnswer, error: updateErr } = await req.supabase
                            .from('challenge_answers')
                            .update({ 
                                status: 'in_progress', 
                                submitted_at: null,
                                created_at: new Date().toISOString() // Reset timer
                            })
                            .eq('id', existingAnswer.id)
                            .select()
                            .single();
                        
                        if (!updateErr) {
                            return res.json({ 
                                message: 'Ada soal baru ditambahkan. Melanjutkan pengerjaan...', 
                                answer: updatedAnswer 
                            });
                        }
                    }
                }

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

// 6.5 PUT /api/challenges/answers/:answerId/grade - Pembuat soal memberi nilai
router.put('/answers/:answerId/grade', requireAuth, async (req, res) => {
    try {
        const { answerId } = req.params;
        const { grade, teacher_comment } = req.body;
        const userId = req.user.id;

        // Validasi nilai
        if (grade === undefined || grade === null || isNaN(Number(grade))) {
            return res.status(400).json({ error: 'Nilai harus berupa angka.' });
        }
        const gradeNum = Number(grade);
        if (gradeNum < 0 || gradeNum > 100) {
            return res.status(400).json({ error: 'Nilai harus antara 0 dan 100.' });
        }

        // Ambil jawaban, lalu cek apakah user adalah creator soalnya
        const { data: answerData, error: ansErr } = await req.supabase
            .from('challenge_answers')
            .select('challenge_id')
            .eq('id', answerId)
            .single();

        if (ansErr || !answerData) {
            return res.status(404).json({ error: 'Jawaban tidak ditemukan.' });
        }

        const { data: challengeData, error: chalErr } = await req.supabase
            .from('challenges')
            .select('creator_id')
            .eq('id', answerData.challenge_id)
            .single();

        if (chalErr || !challengeData || challengeData.creator_id !== userId) {
            return res.status(403).json({ error: 'Akses ditolak. Anda bukan pembuat soal ini.' });
        }

        // Gunakan req.supabase (dengan memanfaatkan RLS Policy agar bisa di-update oleh sang pembuat)
        const updatePayload = { grade: gradeNum, graded_at: new Date().toISOString() };
        if (teacher_comment !== undefined) updatePayload.teacher_comment = teacher_comment;

        const { data, error } = await req.supabase
            .from('challenge_answers')
            .update(updatePayload)
            .eq('id', answerId)
            .select()
            .single();

        if (error) {
            console.error('Grade DB Error:', error);
            // Jika kolom graded_at belum ada, coba tanpa field tersebut
            if (error.message?.includes('graded_at')) {
                const fallbackPayload = { grade: gradeNum };
                if (teacher_comment !== undefined) fallbackPayload.teacher_comment = teacher_comment;

                const { data: data2, error: error2 } = await req.supabase
                    .from('challenge_answers')
                    .update(fallbackPayload)
                    .eq('id', answerId)
                    .select()
                    .single();
                if (error2) throw error2;
                return res.json({ success: true, answer: data2 });
            }
            throw error;
        }
        res.json({ success: true, answer: data });
    } catch (error) {
        console.error('Grade Answer Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6.6 GET /api/challenges/my-history - dipindah ke atas (lihat route 3.5)
// Route ini sengaja dihapus dari sini agar tidak duplikat

// 7. DELETE /api/challenges/:challengeId - Menghapus soal (Khusus Creator Soal)
router.delete('/:challengeId', requireAuth, async (req, res) => {
    try {
        const { challengeId } = req.params;
        const userId = req.user.id;

        // Pastikan yang merequest adalah pembuat soal
        const { data: challengeData, error: challengeError } = await req.supabase
            .from('challenges')
            .select('creator_id')
            .eq('id', challengeId)
            .single();

        if (challengeError || !challengeData) {
            return res.status(404).json({ error: 'Soal tidak ditemukan.' });
        }

        if (challengeData.creator_id !== userId) {
            return res.status(403).json({ error: 'Akses ditolak. Anda bukan pembuat soal ini.' });
        }

        const { error: deleteError } = await req.supabase
            .from('challenges')
            .delete()
            .eq('id', challengeId)
            .eq('creator_id', userId);

        if (deleteError) throw deleteError;

        res.json({ message: 'Soal berhasil dihapus.' });
    } catch (error) {
        console.error('Delete Challenge Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
