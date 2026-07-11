-- ═══════════════════════════════════════════════════════════════════════════
-- Tenant isolation defense-in-depth — Phase 1
-- Creates a least-privilege application role, `kpos_app`, that the running API
-- process connects as (via DATABASE_URL). It is deliberately NOT a superuser
-- and does NOT have BYPASSRLS, so PostgreSQL Row-Level Security policies
-- (added in the next migration) actually apply to it.
--
-- The existing `kpos` role remains superuser and continues to be used only
-- for running migrations (DATABASE_MIGRATE_URL) and seed scripts — those
-- operations legitimately need to read/write across all tenants.
--
-- Must be run by a role with CREATEROLE (the current `kpos` superuser
-- qualifies). Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kpos_app') THEN
        -- Dev-container default password, same convention as POSTGRES_PASSWORD
        -- in docker-compose.yml — MUST be overridden via ALTER ROLE in any
        -- shared/production environment.
        CREATE ROLE kpos_app WITH LOGIN PASSWORD 'kpos_app_secret_change_me' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    END IF;
END;
$$;--> statement-breakpoint

GRANT CONNECT ON DATABASE kpos_db TO kpos_app;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO kpos_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kpos_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kpos_app;--> statement-breakpoint

-- Any table created by future migrations (run as `kpos`, the owner) is
-- automatically granted to kpos_app too — no per-migration grant upkeep needed.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kpos_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kpos_app;--> statement-breakpoint

-- Explicit paranoia check: fail loudly if kpos_app ever ends up privileged.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'kpos_app' AND (rolsuper OR rolbypassrls)
    ) THEN
        RAISE EXCEPTION 'kpos_app must not be SUPERUSER or BYPASSRLS — RLS policies would be silently bypassed';
    END IF;
END;
$$;
