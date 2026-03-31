const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function test() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    // Supabase client with SERVICE ROLE
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    // Let's create a test user
    const email = `test_${Date.now()}@example.com`;
    console.log(`Signing up ${email}...`);
    const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.signUp({
        email,
        password: 'password123',
    });

    if (signUpError) {
        console.error("SignUp Error:", signUpError.message);
        return;
    }
    
    console.log("Session from signUp:", signUpData.session ? "YES" : "NO");
    if (!signUpData.session) return;

    const token = signUpData.session.access_token;
    
    // Test getUser
    console.log("Testing getUser...");
    const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.getUser(token);
    
    if (verifyError) {
        console.error("getUser Error:", verifyError.message, verifyError.status);
    } else {
        console.log("getUser success!", verifyData.user.id);
    }
    
    console.log("Cleaning up...");
    await supabaseAdmin.auth.admin.deleteUser(signUpData.user.id);
}

test();
