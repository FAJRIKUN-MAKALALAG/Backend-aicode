const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/conversations/:userId - Get all conversations for a user
router.get('/:userId', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;

        if (req.user.id !== userId) {
            return res.status(403).json({ error: 'Forbidden: access denied' });
        }

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

// POST /api/conversations - Create new conversation
router.post('/', requireAuth, async (req, res) => {
    try {
        const { title } = req.body;
        const userId = req.user.id;

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

        if (!title) {
            return res.status(400).json({ error: 'Missing title' });
        }

        const { data, error } = await supabase
            .from('conversations')
            .update({ title, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

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

        const { data: conv, error: fetchErr } = await supabase
            .from('conversations')
            .select('user_id')
            .eq('id', id)
            .single();

        if (fetchErr || !conv) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        if (conv.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Forbidden: not your conversation' });
        }

        const { error } = await supabase
            .from('conversations')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Delete Conversation Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
