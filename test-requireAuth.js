const axios = require('axios');
require('dotenv').config();

async function runLocalLoginTest() {
    console.log("Starting test against local server directly to avoid frontend issues...");
    
    // We will simulate a login and then a protected route visit
    try {
        // 1. Signup a fake user
        const supabase = require('./config/supabase');
        const email = `test_${Date.now()}@example.com`;
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email, password: 'password123'
        });
        
        if (signUpError) {
            return console.error("Signup failed:", signUpError.message);
        }
        
        const token = signUpData.session.access_token;
        console.log("Signup success, got token:", token.substring(0, 15) + "...");
        
        // 2. Mock a request object
        const { requireAuth } = require('./middleware/auth');
        let nextCalled = false;
        const req = {
            method: 'GET',
            path: '/api/test',
            cookies: { access_token: token },
            headers: {}
        };
        const res = {
            status: function(code) { 
                this.statusCode = code; 
                return this; 
            },
            json: function(data) { 
                console.log("requireAuth responded with JSON:", this.statusCode, data);
            },
            clearCookie: function(name) {
                console.log("requireAuth clearCookie:", name);
            },
            cookie: function(name) {
                console.log("requireAuth setCookie:", name);
            }
        };
        
        const next = () => {
            nextCalled = true;
            console.log("requireAuth OK! req.user =", req.user.id);
        };
        
        // 3. Run requireAuth
        console.log("Running requireAuth...");
        await requireAuth(req, res, next);
        
        // Clean up
        await supabase.auth.admin.deleteUser(signUpData.user.id);
        
    } catch(err) {
        console.error("Test error:", err);
    }
}

runLocalLoginTest();
