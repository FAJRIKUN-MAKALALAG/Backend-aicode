const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { encrypt, decrypt } = require('./utils/crypto');
const { systemPrompt } = require('./prompts');

const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Rate limiting: 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Apply to all requests
app.use(limiter);

app.use(cors());
app.use(express.json());

// Initialize Supabase (if env vars match)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey && supabaseUrl.startsWith('http')) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (e) {
    console.warn('Failed to initialize Supabase client:', e.message);
  }
} else {
  console.warn('Supabase credentials not found or invalid in environment');
}

// Routes
app.get('/', (req, res) => {
  res.send('AI Code Backend Running');
});

// ========== AUTHENTICATION API ==========

// POST signup - Create new user
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password, username } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { 
                data: { username: username || email.split('@')[0] }
            }
        });

        if (error) throw error;

        // Manually create profile (in case trigger doesn't work)
        try {
            await supabase
                .from('profiles')
                .insert({
                    id: data.user.id,
                    username: username || email.split('@')[0]
                });
        } catch (profileError) {
            // Profile might already exist from trigger, ignore error
            console.log('Profile creation note:', profileError.message);
        }

        res.json({ 
            user: {
                id: data.user.id,
                email: data.user.email,
                username: data.user.user_metadata.username
            },
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at
            }
        });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(400).json({ error: error.message });
    }
});

// POST login - Sign in existing user
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        res.json({ 
            user: {
                id: data.user.id,
                email: data.user.email,
                username: data.user.user_metadata.username
            },
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at
            }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(401).json({ error: error.message });
    }
});

// POST logout - Sign out user
app.post('/api/auth/logout', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        // Set the auth token for this request
        const { error } = await supabase.auth.admin.signOut(token);
        
        if (error) throw error;

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout Error:', error);
        // Even if logout fails, return success (token will expire anyway)
        res.json({ success: true });
    }
});

// POST verify - Verify token and get user info
app.post('/api/auth/verify', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error) throw error;

        res.json({ 
            user: {
                id: user.id,
                email: user.email,
                username: user.user_metadata.username
            }
        });
    } catch (error) {
        console.error('Verify Error:', error);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
});

// POST refresh - Refresh access token
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refresh_token } = req.body;
        
        if (!refresh_token) {
            return res.status(400).json({ error: 'Refresh token required' });
        }

        const { data, error } = await supabase.auth.refreshSession({
            refresh_token
        });

        if (error) throw error;

        res.json({ 
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at
            }
        });
    } catch (error) {
        console.error('Refresh Error:', error);
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});


// Get User API Key (check if exists)
app.get('/api/keys/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const { data, error } = await supabase
            .from('user_secrets')
            .select('key_name, created_at')
            .eq('user_id', userId)
            .eq('key_name', 'GEMINI_API_KEY')
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
            throw error;
        }

        res.json({ 
            hasKey: !!data,
            keyName: data?.key_name,
            createdAt: data?.created_at
        });
    } catch (error) {
        console.error('Get Key Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Save User API Key
app.post('/api/keys', async (req, res) => {
    try {
        const { userId, apiKey } = req.body;
        if (!userId || !apiKey) {
            return res.status(400).json({ error: 'Missing userId or apiKey' });
        }

        // Encrypt the key
        const { encrypted_value, iv } = encrypt(apiKey);

        // Store in DB (upsert)
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

// ========== CONVERSATIONS API ==========

// GET all conversations for a user
app.get('/api/conversations/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
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

// POST create new conversation
app.post('/api/conversations', async (req, res) => {
    try {
        const { userId, title } = req.body;
        
        if (!userId || !title) {
            return res.status(400).json({ error: 'Missing userId or title' });
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

// PUT update conversation title
app.put('/api/conversations/:id', async (req, res) => {
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

// DELETE conversation
app.delete('/api/conversations/:id', async (req, res) => {
    try {
        const { id } = req.params;

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

// ========== MESSAGES API ==========

// GET all messages in a conversation
app.get('/api/messages/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        
        const { data, error } = await supabase
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

// POST add message to conversation
app.post('/api/messages', async (req, res) => {
    try {
        const { conversationId, role, content } = req.body;
        
        if (!conversationId || !role || !content) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const { data, error } = await supabase
            .from('messages')
            .insert({ conversation_id: conversationId, role, content })
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Create Message Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE message
app.delete('/api/messages/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
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

// ========== CODE SNIPPETS API ==========

// GET all code snippets for a user
app.get('/api/code/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
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

// GET code snippets for a specific conversation
app.get('/api/code/conversation/:conversationId', async (req, res) => {
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

// POST save new code snippet
app.post('/api/code', async (req, res) => {
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

// PUT update code snippet
app.put('/api/code/:id', async (req, res) => {
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

// DELETE code snippet
app.delete('/api/code/:id', async (req, res) => {
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

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, apiKey: providedKey, userId } = req.body;
        
        // 1. Determine which API Key to use
        let geminiKey = providedKey;

        // If no key provided in body, try to fetch from DB for the user
        if (!geminiKey && userId) {
            const { data, error } = await supabase
                .from('user_secrets')
                .select('encrypted_value, iv')
                .eq('user_id', userId)
                .eq('key_name', 'GEMINI_API_KEY')
                .single();

            if (data) {
                try {
                    geminiKey = decrypt(data.encrypted_value, data.iv);
                } catch (e) {
                    console.error('Decryption failed:', e);
                }
            }
        }

        // Fallback to server env var if still no key (optional, maybe remove if strictly user-only)
        if (!geminiKey) {
             geminiKey = process.env.GEMINI_API_KEY; 
        }

        if (!geminiKey || geminiKey === 'your_gemini_api_key') {
            return res.status(400).json({ error: 'API Key missing. Please set it in Settings.' });
        }
        
        // ... proceed with chat ...
        // Construct the full prompt context
        const contents = [
            {
                role: "user",
                parts: [{ text: systemPrompt }]
            },
            ...messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }))
        ];

        // Ensure we have an API key (either from request or env)
        // const geminiKey = apiKey || process.env.GEMINI_API_KEY; // REPLACED logic above
        if (!geminiKey) {
            return res.status(400).json({ error: 'API Key missing' });
        }

        // Call Google Gemini API
        // Using gemini-3-flash-preview (latest model)
        
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:streamGenerateContent?alt=sse&key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents })
            }
        );

        // Log response status for debugging
        console.log('Gemini Response Status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API Error:', errorText);
            return res.status(response.status).json({ 
                error: `Gemini API Error: ${response.status}`,
                details: errorText 
            });
        }


        // In Node 22, response.body is a web ReadableStream, not a node Readable.
        // We need to convert it or iterate over it.
        const { Readable } = require('stream');
        const { ReadableStream } = require('stream/web');
        

        // Check if response.body is iterable or a web stream
        console.log('Gemini Response Status:', response.status);
        if (response.body) {
             console.log('Starting to read stream...');
             const reader = response.body.getReader();
             while (true) {
                 const { done, value } = await reader.read();
                 if (done) {
                     console.log('Stream done.');
                     break;
                 }
                 res.write(value);
             }
             res.end();
        } else {
            console.error('No response body from Gemini');
            res.end();
        }

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
