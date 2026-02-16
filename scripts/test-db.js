require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your_supabase_url')) {
  console.error('❌ Error: .env file is not configured.');
  console.error('Please open .env and replace "your_supabase_url" and "your_supabase_key" with your actual Supabase credentials.');
  process.exit(1);
}

if (!supabaseUrl.startsWith('http')) {
  console.error(`❌ Error: Invalid SUPABASE_URL: "${supabaseUrl}"`);
  console.error('It must start with http:// or https://');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('Testing Supabase connection...');

  // 1. Test basic connection by selecting from profiles (publicly viewable)
  // Even if empty, it should not throw an error if the table exists.
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Connection Failed:', error.message);
    console.error('Details:', error);
  } else {
    console.log('✅ Connection successful!');
    console.log('✅ "profiles" table is accessible.');
    console.log('Data returned:', data);
  }
  
  // 2. Check if we can see other tables (might return error or empty depending on RLS/Key)
  // Just checking if we can talk to the DB is usually enough for "it works"
}

testConnection();
