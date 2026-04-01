const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { decrypt } = require('../utils/crypto');

// ─── Helper: ambil & dekripsi API key milik user dari user_secrets ───────────
async function getUserGeminiKey(supabase, userId) {
    const { data: keyData } = await supabase
        .from('user_secrets')
        .select('encrypted_value, iv')
        .eq('user_id', userId)
        .eq('key_name', 'GEMINI_API_KEY')
        .single();

    if (!keyData) return null;
    return decrypt(keyData.encrypted_value, keyData.iv);
}

// ─── Helper: generate embedding text → vektor ─────────────────────────────────
async function generateEmbedding(apiKey, text) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const embedModel = genAI.getGenerativeModel({ model: 'embedding-001' });
    const result = await embedModel.embedContent(text);
    return result.embedding.values;
}

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

// POST /api/messages/context (Vector search — pencari memori RAG)
router.post('/context', requireAuth, async (req, res) => {
    try {
        const { query } = req.body;
        const userId = req.user.id;

        if (!query) return res.json({ context: "" });

        // 1. Ambil API key milik user
        const userApiKey = await getUserGeminiKey(req.supabase, userId);
        if (!userApiKey) {
            console.warn(`[CONTEXT] User ${userId} belum punya API key, skip vector search.`);
            return res.json({ context: "" });
        }

        // 2. Generate embedding dari query user
        const query_embedding = await generateEmbedding(userApiKey, query);

        // 3. Cari chat yang relevan via RPC match_user_chats
        const { data: matchedChats, error } = await req.supabase.rpc('match_user_chats', {
            query_embedding,
            match_threshold: 0.5,
            match_count: 5,
            p_user_id: userId
        });

        if (error) {
            console.error('[CONTEXT] Vector Search Error:', error);
            return res.json({ context: "" });
        }

        if (!matchedChats || matchedChats.length === 0) {
            return res.json({ context: "" });
        }

        const contextText = matchedChats.map(chat =>
            `[Waktu chat: ${new Date(chat.created_at).toLocaleString()}] Pesan Terdahulu: "${chat.content}"`
        ).join('\n---\n');

        console.log(`[CONTEXT] Ditemukan ${matchedChats.length} memori relevan untuk user ${userId}`);
        res.json({ context: contextText });

    } catch (error) {
        console.error('[CONTEXT] Context Endpoint Error:', error.message);
        res.json({ context: "" }); // Fallback kosong agar gagal tidak memutuskan chat
    }
});

// POST /api/messages
router.post('/', requireAuth, async (req, res) => {
    try {
        const { conversationId, role, content } = req.body;
        const userId = req.user.id;

        if (!conversationId || !role || !content) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Generate embedding menggunakan API key MILIK USER sendiri
        let embedding = null;
        try {
            const userApiKey = await getUserGeminiKey(req.supabase, userId);
            if (userApiKey) {
                embedding = await generateEmbedding(userApiKey, content);
                console.log(`[EMBEDDING] OK — user: ${userId}, role: ${role}`);
            } else {
                console.warn(`[EMBEDDING] User ${userId} belum punya API key, embedding dilewati.`);
            }
        } catch (embedErr) {
            // Tetap simpan pesan meski embedding gagal — chat tidak boleh crash
            console.error('[EMBEDDING] Gagal generate embedding:', embedErr.message);
        }

        const { data, error } = await req.supabase
            .from('messages')
            .insert({ conversation_id: conversationId, role, content, embedding })
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
