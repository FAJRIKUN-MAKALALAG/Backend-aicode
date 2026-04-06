-- ============================================================
-- Migration: Tambah tabel challenge_questions
-- Jalankan di Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Tabel challenge_questions
CREATE TABLE IF NOT EXISTS public.challenge_questions (
    id                        uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    challenge_id              uuid REFERENCES public.challenges(id) ON DELETE CASCADE NOT NULL,
    nomor                     integer NOT NULL DEFAULT 1,
    description               text,
    description_image_url     text,
    expected_output           text,
    expected_output_image_url text,
    created_at                timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at                timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index untuk performa query per challenge
CREATE INDEX IF NOT EXISTS idx_challenge_questions_challenge_id
    ON public.challenge_questions(challenge_id);

-- --------------------------------------------------------
-- 2. RLS Policies untuk challenge_questions
-- --------------------------------------------------------
ALTER TABLE public.challenge_questions ENABLE ROW LEVEL SECURITY;

-- Siapapun yang sudah login boleh READ soal (student perlu baca soal saat ujian)
CREATE POLICY "Authenticated users can view questions"
    ON public.challenge_questions FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Hanya creator challenge yang boleh INSERT soal
CREATE POLICY "Creator can insert questions"
    ON public.challenge_questions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.challenges
            WHERE id = challenge_id
            AND creator_id = auth.uid()
        )
    );

-- Hanya creator challenge yang boleh UPDATE soal
CREATE POLICY "Creator can update questions"
    ON public.challenge_questions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.challenges
            WHERE id = challenge_id
            AND creator_id = auth.uid()
        )
    );

-- Hanya creator challenge yang boleh DELETE soal
CREATE POLICY "Creator can delete questions"
    ON public.challenge_questions FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.challenges
            WHERE id = challenge_id
            AND creator_id = auth.uid()
        )
    );

-- --------------------------------------------------------
-- 3. Tambah kolom graded_at di challenge_answers (jika belum ada)
-- --------------------------------------------------------
ALTER TABLE public.challenge_answers
    ADD COLUMN IF NOT EXISTS graded_at timestamp with time zone;

-- --------------------------------------------------------
-- 4. Buat Supabase Storage bucket 'challenge-images'
-- (Jalankan di SQL Editor Supabase)
-- --------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('challenge-images', 'challenge-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Semua user terautentikasi bisa upload ke bucket ini
CREATE POLICY "Authenticated users can upload challenge images"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'challenge-images'
        AND auth.uid() IS NOT NULL
    );

-- Policy: Semua orang bisa melihat gambar (public bucket)
CREATE POLICY "Public can view challenge images"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'challenge-images');
