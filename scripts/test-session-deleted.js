const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function test() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

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
    
    const token = signUpData.session.access_token;
    
    // Test getUser immediately
    const verify1 = await supabaseAdmin.auth.getUser(token);
    console.log("getUser 1 (immediate):", verify1.error ? verify1.error.message : verify1.data.user.id);

    // NOW DELETE THE SESSION via signOut
    console.log("Signing out (deleting session)...");
    await supabaseAdmin.auth.admin.signOut(token);

    // Test getUser again with the SAME token
    const verify2 = await supabaseAdmin.auth.getUser(token);
    console.log("getUser 2 (after signOut):", verify2.error ? verify2.error.message : verify2.data.user.id);
    
    // Clean up
    await supabaseAdmin.auth.admin.deleteUser(signUpData.user.id);
}

test();
