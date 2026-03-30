const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/crypto');

// GET /api/keys - Get API key preview for logged-in user
// FIXED: Dulu pakai /:userId di URL → user_id bocor di URL, dan bentrok antar request
// Sekarang userId diambil dari token (req.user.id) — lebih aman & benar
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('user_secrets')
            .select('key_name, encrypted_value, iv, created_at')
            .eq('user_id', userId)
            .eq('key_name', 'GEMINI_API_KEY')
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        let prefix = null;
        let suffix = null;
        if (data) {
            try {
                const decrypted = decrypt(data.encrypted_value, data.iv);
                prefix = decrypted.substring(0, 4);
                suffix = decrypted.slice(-4);
            } catch (e) {
                console.warn('Could not decrypt key for preview:', e.message);
            }
        }

        res.json({
            hasKey: !!data,
            keyName: data?.key_name,
            createdAt: data?.created_at,
            prefix,
            suffix
        });
    } catch (error) {
        console.error('Get Key Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/keys/value - Get decrypted API key value for logged-in user
router.get('/value', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('user_secrets')
            .select('encrypted_value, iv')
            .eq('user_id', userId)
            .eq('key_name', 'GEMINI_API_KEY')
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        if (!data) return res.status(404).json({ error: 'No API key found. Please add one in Settings.' });

        const decrypted = decrypt(data.encrypted_value, data.iv);
        res.json({ apiKey: decrypted });
    } catch (error) {
        console.error('Decrypt Key Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/keys - Save API Key for logged-in user
router.post('/', requireAuth, async (req, res) => {
    try {
        const { apiKey } = req.body;
        const userId = req.user.id;

        if (!apiKey) {
            return res.status(400).json({ error: 'Missing apiKey' });
        }

        const { encrypted_value, iv } = encrypt(apiKey);

        const { error } = await supabase
            .from('user_secrets')
            .upsert({
                user_id: userId,
                key_name: 'GEMINI_API_KEY',
                encrypted_value,
                iv
            }, { onConflict: 'user_id, key_name' });

        if (error) throw error;

        res.json({ success: true, message: 'API Key saved successfully' });
    } catch (error) {
        console.error('Save Key Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/keys - Hapus API key logged-in user
router.delete('/', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;

        const { error } = await supabase
            .from('user_secrets')
            .delete()
            .eq('user_id', userId)
            .eq('key_name', 'GEMINI_API_KEY');

        if (error) throw error;

        res.json({ success: true, message: 'API Key deleted' });
    } catch (error) {
        console.error('Delete Key Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- BACKWARD COMPAT: route lama /:userId masih diterima tapi userId dari token ---
router.get('/:userId', requireAuth, async (req, res) => {
    // Redirect ke handler baru — abaikan userId dari URL, pakai dari token
    const userId = req.user.id;

    if (req.user.id !== req.params.userId) {
        return res.status(403).json({ error: 'Forbidden: access denied' });
    }

    try {
        const { data, error } = await supabase
            .from('user_secrets')
            .select('key_name, encrypted_value, iv, created_at')
            .eq('user_id', userId)
            .eq('key_name', 'GEMINI_API_KEY')
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        let prefix = null, suffix = null;
        if (data) {
            try {
                const decrypted = decrypt(data.encrypted_value, data.iv);
                prefix = decrypted.substring(0, 4);
                suffix = decrypted.slice(-4);
            } catch (e) {
                console.warn('Could not decrypt key for preview:', e.message);
            }
        }

        res.json({ hasKey: !!data, keyName: data?.key_name, createdAt: data?.created_at, prefix, suffix });
    } catch (error) {
        console.error('Get Key Error (compat):', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/:userId/value', requireAuth, async (req, res) => {
    if (req.user.id !== req.params.userId) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const userId = req.user.id;

    try {
        const { data, error } = await supabase
            .from('user_secrets')
            .select('encrypted_value, iv')
            .eq('user_id', userId)
            .eq('key_name', 'GEMINI_API_KEY')
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        if (!data) return res.status(404).json({ error: 'No API key found. Please add one in Settings.' });

        const decrypted = decrypt(data.encrypted_value, data.iv);
        res.json({ apiKey: decrypted });
    } catch (error) {
        console.error('Decrypt Key Error (compat):', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
