const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const supabaseAdmin = require('../config/supabase');

// =========================================================
// IMPORTANT: Specific routes MUST be declared before
// wildcard routes like /:userId or /:id to avoid shadowing.
// =========================================================

// GET /api/code/share/:id (Public — no auth required)
router.get('/share/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabaseAdmin
            .from('shared_codes')
            .select('id, title, code_content, language, created_at')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Shared code tidak ditemukan' });
            }
            throw error;
        }
        res.json(data);
    } catch (error) {
        console.error('Get Shared Code Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/code/share (Save to shared_codes — requires auth)
router.post('/share', requireAuth, async (req, res) => {
    try {
        const { title, code_content, language } = req.body;
        const authorId = req.user.id;

        if (!code_content || !language) {
            return res.status(400).json({ error: 'Missing code_content or language' });
        }

        const { data, error } = await supabaseAdmin
            .from('shared_codes')
            .insert({
                title: title || 'Shared Code',
                code_content,
                language,
                author_id: authorId
            })
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Create Shared Code Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/code/conversation/:conversationId (must be before /:userId)
router.get('/conversation/:conversationId', requireAuth, async (req, res) => {
    try {
        const { conversationId } = req.params;

        const { data, error } = await req.supabase
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

// POST /api/code (create snippet)
router.post('/', requireAuth, async (req, res) => {
    try {
        const { conversationId, title, code_content, language } = req.body;
        const userId = req.user.id;

        if (!code_content || !language) {
            return res.status(400).json({ error: 'Missing required fields (code_content, language)' });
        }

        const { data, error } = await req.supabase
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

// PUT /api/code/:id (must be before /:userId)
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, code_content, language } = req.body;
        const userId = req.user.id;

        const updates = {};
        if (title !== undefined) updates.title = title;
        if (code_content !== undefined) updates.code_content = code_content;
        if (language !== undefined) updates.language = language;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const { data, error } = await req.supabase
            .from('code_snippets')
            .update(updates)
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error && error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Code snippet not found or access denied' });
        }
        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('Update Code Snippet Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/code/:id (must be before /:userId)
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const { error } = await req.supabase
            .from('code_snippets')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Delete Code Snippet Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/code/:userId — MUST be last among GETs (wildcard)
router.get('/:userId', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;

        if (req.user.id !== userId) {
            return res.status(403).json({ error: 'Forbidden: access denied' });
        }

        const { data, error } = await req.supabase
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

module.exports = router;
