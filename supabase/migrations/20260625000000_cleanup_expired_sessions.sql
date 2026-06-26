-- Migration: Add background cleanup job for expired/revoked sessions
-- Description: Creates a function to delete expired sessions and schedules it to run daily using pg_cron (if available).
-- Note for reviewers: The `token_family` and `revoked_at` columns were already added to the schema 
-- in the previous migration: `20260213003000_fix_sessions_refresh_token_hashing.sql`.

CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  -- Delete sessions that are past their expiration date (even if revoked)
  -- Since refresh tokens are valid for 7 days, any session older than 7 days is useless
  DELETE FROM public.sessions
  WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optionally, if pg_cron is enabled in the Supabase project, schedule it to run daily
-- We wrap it in a DO block to avoid errors if pg_cron is not enabled.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Try to schedule the job, ignore if it already exists
    BEGIN
      PERFORM cron.schedule('cleanup-expired-sessions', '0 0 * * *', 'SELECT cleanup_expired_sessions();');
    EXCEPTION WHEN OTHERS THEN
      -- Job might already exist
    END;
  END IF;
END $$;
