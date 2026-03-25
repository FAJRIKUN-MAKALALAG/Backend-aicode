const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/code/:userId - Get all code snippets for a user
router.get('/:userId', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;

        if (req.user.id !== userId) {
            return res.status(403).json({ error: 'Forbidden: access denied' });
        }

        const { data, error } = await supabase
            .from('code_snippets')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Get Code Snippets Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/code/conversation/:conversationId - Get code snippets for a specific conversation
router.get('/conversation/:conversationId', requireAuth, async (req, res) => {
    try {
        const { conversationId } = req.params;

        const { data, error } = await supabase
            .from('code_snippets')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data || []);
    } catch (error) {
        console.error('Get Conversation Code Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/code - Save new code snippet
router.post('/', requireAuth, async (req, res) => {
    try {
        const { userId, conversationId, title, code_content, language } = req.body;

        if (!userId || !code_content || !language) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const { data, error } = await supabase
            .from('code_snippets')
            .insert({
                user_id: userId,
                conversation_id: conversationId || null,
                title: title || null,
                code_content,
                language
            })
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Create Code Snippet Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/code/:id - Update code snippet
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, code_content, language } = req.body;

        const updates = {};
        if (title !== undefined) updates.title = title;
        if (code_content !== undefined) updates.code_content = code_content;
        if (language !== undefined) updates.language = language;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const { data, error } = await supabase
            .from('code_snippets')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Update Code Snippet Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/code/:id
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('code_snippets')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true });
    } catch (error) {
        console.error('Delete Code Snippet Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
