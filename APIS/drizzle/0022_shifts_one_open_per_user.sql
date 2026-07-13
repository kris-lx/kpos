-- ═══════════════════════════════════════════════════════════════════════════
-- Prevent duplicate open shifts per user
--
-- POST /sales/shifts/open did a plain check-then-insert (SELECT for an
-- existing OPEN shift, then INSERT if none found) with no lock and no DB
-- constraint backstop. Two concurrent open requests for the same user (a
-- double-tap, or a POS front-end retry after a slow response) could both
-- pass the check before either INSERT committed, producing two simultaneous
-- OPEN shifts — subsequent sales/cash-movements attach to whichever shift
-- the client references, and close-shift's expectedBalance calculation goes
-- wrong for whichever shift never received them, silently corrupting
-- cash-drawer reconciliation.
--
-- A partial unique index makes "one OPEN shift per user" a real DB
-- guarantee — the second concurrent INSERT now fails with a unique
-- violation instead of silently succeeding twice.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS "shifts_one_open_per_user_idx" ON "shifts" ("user_id") WHERE status = 'OPEN';
