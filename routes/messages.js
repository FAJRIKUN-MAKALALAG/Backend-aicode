const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// GET /api/messages/:conversationId
router.get('/:conversationId', requireAuth, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user.id;

        // Validasi ownership conversation via req.supabase (RLS menggunakan auth.uid())
        const { data: conv, error: convErr } = await req.supabase
            .from('conversations')
            .select('user_id')
            .eq('id', conversationId)
            .eq('user_id', userId)
            .single();

        if (convErr || !conv) {
            return res.status(404).json({ error: 'Conversation not found or access denied' });
        }

        const { data, error } = await req.supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Get Messages Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/messages
router.post('/', requireAuth, async (req, res) => {
    try {
        const { conversationId, role, content } = req.body;

        if (!conversationId || !role || !content) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const { data, error } = await req.supabase
            .from('messages')
            .insert({ conversation_id: conversationId, role, content })
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Create Message Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/messages/:id
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await req.supabase
            .from('messages')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Delete Message Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
