/**
 * Test Script — Groq Fallback (Standalone)
 * Jalankan: node scripts/test-groq.js
 * Tidak perlu server berjalan, langsung hit Groq API.
 */
require('dotenv').config();
const Groq = require('groq-sdk');

const groqKey = process.env.GROQ_API_KEY;

if (!groqKey || groqKey === 'your_groq_api_key_here') {
    console.error('❌ GROQ_API_KEY belum diisi di file .env!');
    process.exit(1);
}

async function testGroq() {
    console.log('🚀 Menghubungi Groq API...');
    console.log('📦 Model: moonshotai/kimi-k2-instruct');
    console.log('─'.repeat(50));

    const groq = new Groq({ apiKey: groqKey });

    const stream = await groq.chat.completions.create({
        messages: [
            {
                role: 'system',
                content: 'Kamu adalah asisten AI Python yang ramah dan edukatif.',
            },
            {
                role: 'user',
                content: 'Halo! Jelaskan apa itu variabel di Python dalam 2 kalimat.',
            },
        ],
        model: 'moonshotai/kimi-k2-instruct',
        temperature: 0.6,
        max_completion_tokens: 512,
        top_p: 1,
        stream: true,
        stop: null,
    });

    process.stdout.write('🤖 AI: ');
    for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) process.stdout.write(text);
    }

    console.log('\n' + '─'.repeat(50));
    console.log('✅ Test Groq BERHASIL! Streaming bekerja dengan baik.');
}

testGroq().catch((err) => {
    console.error('\n❌ Test GAGAL:', err.message);
    process.exit(1);
});
