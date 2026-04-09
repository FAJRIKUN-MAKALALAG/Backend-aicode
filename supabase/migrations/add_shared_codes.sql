-- Migration: Create shared_codes table
-- Table untuk menyimpan kode yang dibagikan via share link.
-- Data disini TIDAK dihapus ketika user hapus chat history atau code snippet aslinya.

CREATE TABLE IF NOT EXISTS public.shared_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_content TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'python',
    title TEXT,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.shared_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Izinkan SEMUA orang (termasuk anonymous/public) untuk membaca (untuk share link)
CREATE POLICY "Allow public read access to shared codes"
ON public.shared_codes FOR SELECT
TO public
USING (true);

-- Policy: Izinkan user yang sudah login untuk menyimpan share baru
CREATE POLICY "Allow authenticated users to insert shared codes"
ON public.shared_codes FOR INSERT
TO authenticated
WITH CHECK (true);

COMMENT ON TABLE public.shared_codes IS 'Permanent storage for publicly shared code snippets via share links.';
