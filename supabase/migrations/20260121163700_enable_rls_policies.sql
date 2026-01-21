-- Migration: Enable Row Level Security (RLS) & Security Policies
-- Issue: https://github.com/TrustUp-app/TrustUp-API/issues/10
-- Description: Enable RLS on all tables and define policies for secure data access

BEGIN;

-- =============================================================================
-- USERS TABLE
-- Users can SELECT and UPDATE their own records only
-- =============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own record
CREATE POLICY "users_select_own" ON users
    FOR SELECT
    USING (auth.uid() = id);

-- Policy: Users can update their own record
CREATE POLICY "users_update_own" ON users
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- =============================================================================
-- SESSIONS TABLE
-- Users can only SELECT their own sessions
-- =============================================================================
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own sessions
CREATE POLICY "sessions_select_own" ON sessions
    FOR SELECT
    USING (auth.uid() = user_id);

-- =============================================================================
-- USER_PREFERENCES TABLE
-- Users can SELECT and UPDATE their own preferences
-- =============================================================================
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own preferences
CREATE POLICY "user_preferences_select_own" ON user_preferences
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can update their own preferences
CREATE POLICY "user_preferences_update_own" ON user_preferences
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can insert their own preferences
CREATE POLICY "user_preferences_insert_own" ON user_preferences
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- NOTIFICATIONS TABLE
-- Users can SELECT and UPDATE their own notifications
-- =============================================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications
CREATE POLICY "notifications_select_own" ON notifications
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can update their own notifications (e.g., mark as read)
CREATE POLICY "notifications_update_own" ON notifications
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- KYC_VERIFICATIONS TABLE
-- Users can only SELECT their own KYC records (read-only for users)
-- =============================================================================
ALTER TABLE kyc_verifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own KYC verifications
CREATE POLICY "kyc_verifications_select_own" ON kyc_verifications
    FOR SELECT
    USING (auth.uid() = user_id);

-- =============================================================================
-- REPUTATION_CACHE TABLE (Indexed Data)
-- Read-only access for authenticated users
-- =============================================================================
ALTER TABLE reputation_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view all reputation data (public on-chain data)
CREATE POLICY "reputation_cache_select_authenticated" ON reputation_cache
    FOR SELECT
    TO authenticated
    USING (true);

-- =============================================================================
-- LOAN_INDEX TABLE (Indexed Data)
-- Read-only access for authenticated users
-- =============================================================================
ALTER TABLE loan_index ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view all loan index data (public on-chain data)
CREATE POLICY "loan_index_select_authenticated" ON loan_index
    FOR SELECT
    TO authenticated
    USING (true);

-- =============================================================================
-- PAYMENT_INDEX TABLE (Indexed Data)
-- Read-only access for authenticated users
-- =============================================================================
ALTER TABLE payment_index ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view all payment index data (public on-chain data)
CREATE POLICY "payment_index_select_authenticated" ON payment_index
    FOR SELECT
    TO authenticated
    USING (true);

-- =============================================================================
-- INVESTMENTS_INDEX TABLE (Indexed Data)
-- Read-only access for authenticated users
-- =============================================================================
ALTER TABLE investments_index ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view all investments index data (public on-chain data)
CREATE POLICY "investments_index_select_authenticated" ON investments_index
    FOR SELECT
    TO authenticated
    USING (true);

-- =============================================================================
-- NOTES:
-- - Service role (SUPABASE_SERVICE_ROLE_KEY) automatically bypasses RLS
-- - Service role is used for indexer jobs and admin operations
-- - Index tables (reputation_cache, loan_index, payment_index, investments_index)
--   are updated only by service role jobs, not by users
-- - auth.uid() returns the authenticated user's ID from the JWT token
-- =============================================================================

COMMIT;
