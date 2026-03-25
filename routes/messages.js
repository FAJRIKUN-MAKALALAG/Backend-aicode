const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/messages/:conversationId - Get all messages in a conversation
router.get('/:conversationId', requireAuth, async (req, res) => {
    try {
        const { conversationId } = req.params;

        const { data: conv, error: convErr } = await supabase
            .from('conversations')
            .select('user_id')
            .eq('id', conversationId)
            .single();

        if (convErr || !conv) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        if (conv.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Forbidden: not your conversation' });
        }

        const { data, error } = await supabase
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

// POST /api/messages - Add message to conversation
router.post('/', requireAuth, async (req, res) => {
    try {
        const { conversationId, role, content } = req.body;

        if (!conversationId || !role || !content) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const { data, error } = await supabase
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

        const { error } = await supabase
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
