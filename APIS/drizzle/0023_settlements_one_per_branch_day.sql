-- ═══════════════════════════════════════════════════════════════════════════
-- Prevent duplicate settlements for the same branch + day
--
-- POST /payments/settlements recomputed the day's totals and unconditionally
-- inserted a new settlement row with no check for an existing settlement
-- covering the same branchId + settlementDate, and no unique constraint
-- backstopped it either. A double-submit (network retry, double-click
-- "settle") created two settlement rows for the same day, double-counting
-- totalAmount/cashAmount/cardAmount in any downstream reconciliation that
-- sums settlements.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS "settlements_branch_date_idx" ON "settlements" ("tenant_id", "branch_id", "settlement_date");
