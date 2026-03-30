const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// ================================================================
// PENTING: Semua route pakai req.supabase (user-scoped client)
// yang di-inject oleh requireAuth middleware.
// req.supabase membawa user's JWT → RLS auth.uid() bekerja benar.
// ================================================================

// GET /api/conversations  OR  GET /api/conversations/mine
// Ambil semua conversations untuk user yang sedang login
router.get('/mine', requireAuth, async (req, res) => {
    try {
        const { data, error } = await req.supabase
            .from('conversations')
            .select('*')
            .eq('user_id', req.user.id)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Get Conversations Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/conversations/:userId — Backward Compat untuk frontend lama
// Frontend masih panggil /:userId, kita terima tapi pakai userId dari token
router.get('/:userId', requireAuth, async (req, res) => {
    try {
        // Paksa userId dari token — abaikan yang dari URL tapi tetap validasi
        const userId = req.user.id;
        const urlUserId = req.params.userId;

        // Jika urlUserId bukan user-id (panjang UUID), anggap sebagai conversationId
        // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(urlUserId);

        if (isUUID && urlUserId !== userId) {
            // URL userId bukan milik user ini — coba sebagai conversationId
            const { data: conv, error: convErr } = await req.supabase
                .from('conversations')
                .select('*')
                .eq('id', urlUserId)
                .eq('user_id', userId)
                .single();

            if (convErr && convErr.code === 'PGRST116') {
                return res.status(404).json({ error: 'Conversation not found' });
            }
            if (convErr) throw convErr;
            return res.json(conv);
        }

        // Kalau urlUserId === userId atau bukan UUID → return list conversations
        if (urlUserId !== userId) {
            return res.status(403).json({ error: 'Forbidden: access denied' });
        }

        const { data, error } = await req.supabase
            .from('conversations')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Get Conversations Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/conversations — Buat conversation baru
router.post('/', requireAuth, async (req, res) => {
    try {
        const { title } = req.body;
        const userId = req.user.id;

        if (!title) {
            return res.status(400).json({ error: 'Missing title' });
        }

        const { data, error } = await req.supabase
            .from('conversations')
            .insert({ user_id: userId, title })
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Create Conversation Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/conversations/:id — Update title conversation
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;
        const userId = req.user.id;

        if (!title) {
            return res.status(400).json({ error: 'Missing title' });
        }

        const { data, error } = await req.supabase
            .from('conversations')
            .update({ title, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error && error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Conversation not found or access denied' });
        }
        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Update Conversation Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/conversations/:id
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const { data, error } = await req.supabase
            .from('conversations')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)
            .select();

        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Conversation not found or access denied' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Delete Conversation Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
