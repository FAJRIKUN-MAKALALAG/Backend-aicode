const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

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

module.exports = { supabase };
