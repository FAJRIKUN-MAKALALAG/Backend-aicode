const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { decrypt } = require('../utils/crypto');
const { systemPrompt } = require('../prompts');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const axios = require('axios');
const rateLimit = require('express-rate-limit');

// Chat rate limiter — per USER ID (bukan per IP)
const chatLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 30,                  
    message: 'Too many chat requests, please slow down.',
    standardHeaders: true,
    legacyHeaders: false,
    validate: false, 
    keyGenerator: (req) => {
        return req.body?.userId || req.ip;
    }
});

router.post('/', chatLimiter, async (req, res) => {
    // Logging for PM2 monitoring
    console.log("--- REQUEST MASUK ---");
    console.log("User ID:", req.body.userId);
    console.log("Mode:", req.body.mode);
    console.log("Jumlah Pesan History:", req.body.messages?.length);

    // 1. EARLY FLUSH: Set headers and flush immediately
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    // 2. DUMMY CHUNK: Force open the pipe
    res.write(' ');

    try {
        const { messages: currentMessages, conversationId, userId, mode, apiKey: providedKey } = req.body;

        // 3. Parallel Fetch: API Key and 15-message history
        const [keyResult, historyResult] = await Promise.all([
            (!providedKey && userId) ?
                supabase.from('user_secrets').select('encrypted_value, iv').eq('user_id', userId).eq('key_name', 'GEMINI_API_KEY').single() :
                Promise.resolve({ data: null }),
            conversationId ?
                supabase.from('messages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(15) :
                Promise.resolve({ data: [] })
        ]);

        // 4. Resolve API Key
        let geminiKey = providedKey;
        if (!geminiKey && keyResult.data) {
            try {
                geminiKey = decrypt(keyResult.data.encrypted_value, keyResult.data.iv);
            } catch (e) {
                console.error('Decryption failed:', e);
            }
        }
        geminiKey = geminiKey || process.env.GEMINI_API_KEY;

        if (!geminiKey || geminiKey === 'your_gemini_api_key') {
            res.write(`data: ${JSON.stringify({ error: 'API Key missing. Please set it in Settings.' })}\n\n`);
            return res.end();
        }

        // 5. Map History for SDK
        const historicalContext = (historyResult.data || []).reverse().map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        // 6. Non-Blocking User Msg Save
        const lastUserMsg = currentMessages[currentMessages.length - 1];
        if (conversationId && lastUserMsg) {
            supabase.from('messages').insert({
                conversation_id: conversationId,
                role: lastUserMsg.role,
                content: lastUserMsg.content
            }).catch(err => console.error('BG User Save Error:', err));
        }

        // 7. Prompt Engineering for Fast vs Reasoning
        let finalSystemInstruction = systemPrompt;
        if (mode === 'reasoning') {
            finalSystemInstruction = `[REASONING MODE ENABLED]\n${systemPrompt}\n\nTugas Anda: Berikan jawaban yang mendalam, analitis, dan jelaskan langkah-langkah logika Anda secara menyeluruh. Evaluasi berbagai kemungkinan sebelum memberikan solusi akhir.`;
        } else {
            finalSystemInstruction = `[FAST MODE ENABLED]\n${systemPrompt}\n\nTugas Anda: Berikan jawaban yang sangat singkat, padat, langsung ke poinnya, dan efisien.`;
        }

        // 8. SDK Initialization (Using gemini-3-flash-preview)
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-3-flash-preview",
            systemInstruction: finalSystemInstruction
        });

        // 9. Stream Generation
        const result = await model.generateContentStream({
            contents: [
                ...historicalContext,
                ...currentMessages.map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                }))
            ]
        });

        // 10. SSE Consumption & Async Assistant Save
        let fullAssistantText = "";
        try {
            for await (const chunk of result.stream) {
                const textChunk = chunk.text();
                if (textChunk) {
                    fullAssistantText += textChunk;
                    res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
                }
            }
            res.write('data: [DONE]\n\n');
        } catch (streamErr) {
            console.error('SDK Streaming Error:', streamErr);
            res.write(`data: ${JSON.stringify({ error: 'Streaming failed', details: streamErr.message })}\n\n`);
        } finally {
            console.log("--- RESPONSE KELUAR ---");
            const estimatedOutputTokens = Math.ceil(fullAssistantText.length / 4);
            console.log(`[TOKEN USAGE] AI Response Length: ${fullAssistantText.length} chars (~${estimatedOutputTokens} tokens)`);
            res.end();
            
            if (conversationId && fullAssistantText) {
                supabase.from('messages').insert({
                    conversation_id: conversationId,
                    role: 'assistant',
                    content: fullAssistantText
                }).catch(err => console.error('BG Assistant Save Error:', err));
            }
        }

    } catch (error) {
        console.error('Gemini SDK Error:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

// ========== GROQ FALLBACK CHAT API ==========
router.post('/groq-fallback', chatLimiter, requireAuth, async (req, res) => {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array is required' });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(500).json({ error: 'Groq API key not configured' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    try {
        const groq = new Groq({ apiKey: groqKey });
        const groqMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content }))
        ];

        const stream = await groq.chat.completions.create({
            messages: groqMessages,
            model: 'moonshotai/kimi-k2-instruct',
            temperature: 0.6,
            max_completion_tokens: 4096,
            top_p: 1,
            stream: true,
            stop: null
        });

        let fullText = "";
        for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
                fullText += text;
                res.write('data: ' + JSON.stringify({ text }) + '\n\n');
            }
        }
        res.write('data: [DONE]\n\n');
        
        const estTokens = Math.ceil(fullText.length / 4);
        console.log(`[TOKEN USAGE - GROQ] Response Chars: ${fullText.length} (~${estTokens} tokens)`);
        res.end();

    } catch (error) {
        console.error('[GROQ FALLBACK ERROR]', error.message);
        res.write('data: ' + JSON.stringify({ error: error.message }) + '\n\n');
        res.end();
    }
});

module.exports = router;
