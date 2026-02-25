-- ============================================
-- Fix: Add missing updated_at column to optimization_tasks
-- Run this in Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS pattern)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'optimization_tasks'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.optimization_tasks
    ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END
$$;
