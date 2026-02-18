const GEMINI_API_KEY = "AIzaSyBrkGtJNxMNHsm33F22il9Bb_F3Q-gDIxI"; 
const BACKEND_URL = "http://localhost:3000/api/chat";

/**
 * Script ini mengetes DUA mode secara berurutan:
 * 1. FAST (untuk jawaban singkat)
 * 2. REASONING (untuk jawaban mendalam)
 */

async function testChat(mode) {
    console.log(`\n🚀 Memulai Test Chat [MODE: ${mode.toUpperCase()}] ke ${BACKEND_URL}...`);
    
    const payload = {
        messages: [{ role: 'user', content: 'Jelaskan variabel Python dalam 1 kalimat.' }],
        userId: 'test-user-local',
        mode: mode,
        apiKey: GEMINI_API_KEY
    };

    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log(`📡 Status HTTP: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            const err = await response.text();
            console.error(`❌ Backend Error: ${err}`);
            return;
        }

        console.log('✨ Data mulai masuk (Streaming)...');
        console.log('----------------------------');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const rawChunk = decoder.decode(value, { stream: true });
            const lines = rawChunk.split('\n');
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ')) {
                    const dataStr = trimmed.replace('data: ', '');
                    if (dataStr === '[DONE]') {
                        console.log('\n----------------------------');
                        console.log(`✅ Aliran Data ${mode} Selesai.`);
                        return;
                    }
                    try {
                        const json = JSON.parse(dataStr);
                        if (json.text) {
                            process.stdout.write(json.text);
                        }
                        if (json.error) {
                            console.error(`\n❌ AI ERROR: ${json.error}`);
                        }
                    } catch (e) {}
                }
            }
        }

    } catch (err) {
        console.error('🔴 KONEKSI GAGAL:', err.message);
    }
}

async function runAllTests() {
    // 1. Tes Fast Mode
    await testChat('fast');
    
    console.log('\n--- Jeda 3 detik sebelum tes berikutnya ---');
    
    // 2. Tes Reasoning Mode
    setTimeout(async () => {
        await testChat('reasoning');
        process.exit();
    }, 3000);
}

runAllTests();
