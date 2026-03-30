const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/conversations - Get all conversations for the logged-in user
// FIXED: Dulu pakai /:userId yang BENTROK dengan /:id di bawah!
// Express tidak bisa bedakan "userId" vs "id" — keduanya string parameter.
// Solusi: gunakan /mine untuk list, dan /:id untuk detail.
router.get('/mine', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id; // Ambil dari token, BUKAN dari URL param

        const { data, error } = await supabase
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

// GET /api/conversations/:id - Get single conversation detail
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)  // Filter sekaligus untuk ownership check
            .single();

        if (error && error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Conversation not found or access denied' });
        }
        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Get Conversation Details Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/conversations - Create new conversation
router.post('/', requireAuth, async (req, res) => {
    try {
        const { title } = req.body;
        const userId = req.user.id; // SELALU dari token, bukan dari body

        if (!title) {
            return res.status(400).json({ error: 'Missing title' });
        }

        const { data, error } = await supabase
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

// PUT /api/conversations/:id - Update conversation title
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;
        const userId = req.user.id;

        if (!title) {
            return res.status(400).json({ error: 'Missing title' });
        }

        // Update dengan ownership check sekaligus
        const { data, error } = await supabase
            .from('conversations')
            .update({ title, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', userId)  // Pastikan hanya bisa update punya sendiri
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

        // Delete dengan ownership check sekaligus — tidak perlu fetch dulu
        const { data, error } = await supabase
            .from('conversations')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)  // Hanya hapus kalau memang punya sendiri
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
