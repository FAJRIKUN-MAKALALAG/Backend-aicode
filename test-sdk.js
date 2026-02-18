const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

async function test() {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        console.error('No GEMINI_API_KEY found in .env');
        return;
    }

    const client = new GoogleGenAI({ apiKey: geminiKey });

    try {
        console.log('Testing generateContentStream...');
        const stream = await client.models.generateContentStream({
            model: 'gemini-1.5-flash', // Use a simple model for test
            contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
            config: {
                maxOutputTokens: 10
            }
        });

        console.log('Iterator started...');
        for await (const chunk of stream) {
            console.log('Chunk received:', chunk.text());
        }
        console.log('Done.');
    } catch (err) {
        console.error('Test Failed:', err);
    }
}

test();
