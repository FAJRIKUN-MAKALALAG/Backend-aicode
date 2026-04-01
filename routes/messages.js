const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { decrypt } = require('../utils/crypto');

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

// POST /api/messages/context (Endpoint pencari memori/vector search)
router.post('/context', requireAuth, async (req, res) => {
    try {
        const { query } = req.body;
        const userId = req.user.id;

        if (!query) return res.json({ context: "" });

        // 1. Generate Embedding untuk query pencarian user saat ini
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const result = await embedModel.embedContent(query);
        const query_embedding = result.embedding.values;

        // 2. Tembak RPC match_user_chats
        const { data: matchedChats, error } = await req.supabase.rpc('match_user_chats', {
            query_embedding: query_embedding,
            match_threshold: 0.5,
            match_count: 5,
            p_user_id: userId
        });

        if (error) {
            console.error('Vector Search Error:', error);
            return res.json({ context: "" });
        }

        // 3. Rangkai konteksnya menjadi string format rapi
        if (!matchedChats || matchedChats.length === 0) {
            return res.json({ context: "" });
        }

        const contextText = matchedChats.map(chat => 
            `[Waktu chat: ${new Date(chat.created_at).toLocaleString()}] Pesan Terdahulu: "${chat.content}"`
        ).join('\n---\n');

        res.json({ context: contextText });
    } catch (error) {
        console.error('Context Endpoint Error:', error);
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

        // Generate embedding menggunakan API key MILIK USER sendiri (dari user_secrets)
        let embedding = null;
        try {
            // 1. Ambil dan decrypt API key milik user dari DB
            const { data: keyData } = await req.supabase
                .from('user_secrets')
                .select('encrypted_value, iv')
                .eq('user_id', userId)
                .eq('key_name', 'GEMINI_API_KEY')
                .single();

            if (keyData) {
                const userApiKey = decrypt(keyData.encrypted_value, keyData.iv);
                // 2. Pakai kunci user untuk generate embedding
                const genAI = new GoogleGenerativeAI(userApiKey);
                const embedModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
                const result = await embedModel.embedContent(content);
                embedding = result.embedding.values;
                console.log(`[EMBEDDING] Berhasil generate embedding untuk user ${userId}, role: ${role}`);
            } else {
                console.warn(`[EMBEDDING] User ${userId} belum punya API key, embedding dilewati.`);
            }
        } catch (embedErr) {
            // Gagal generate embedding — tetap simpan pesan tanpa embedding
            // agar chat tidak crash
            console.error('[EMBEDDING] Gagal generate embedding:', embedErr.message);
        }

        const { data, error } = await req.supabase
            .from('messages')
            .insert({ 
                conversation_id: conversationId, 
                role, 
                content,
                embedding
            })
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
