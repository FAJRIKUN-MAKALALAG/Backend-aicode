const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function test() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
    });

    const fakeToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    console.log("Calling getUser with fake token...");
    const verify = await supabase.auth.getUser(fakeToken);
    
    if (verify.error) {
        console.error("getUser error:", verify.error.message, "status:", verify.error.status);
    } else {
        console.log("getUser success:", verify.data);
    }

    console.log("Calling getUser with undefined...");
    const verifyUndef = await supabase.auth.getUser();
    if (verifyUndef.error) {
        console.error("getUser(undef) error:", verifyUndef.error.message);
    }
}

test();
