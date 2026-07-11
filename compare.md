# KPOS — Document vs Codebase Comparison
# Generated: 2026-06-17
# Scope: prompt.md (not found), KPOS-AGENT-TASKS.md, rbac-1M-10M-full-isolation-fixed.md vs actual code

---

## ▌ SECTION 1 — RBAC DESIGN vs CODE: What's Done vs Missing

### rbac-1M-10M-full-isolation-fixed.md specifies 10 fixes (G1–G10)
### KPOS-AGENT-TASKS.md tracks their implementation status

| Fix | Design Says | KPOS-AGENT-TASKS Status | Actual Code Reality |
|-----|-------------|------------------------|---------------------|
| G1 — DB RLS | Every table needs `tenant_id NOT NULL` + PostgreSQL RLS policies | DB-11/DB-12 = `[ ]` (tenantId still nullable). DB-30/31/32 = `[ ]` (no RLS policies exist) | Schema has tenantId columns but all nullable. `setTenantContext()` helper created (DB-33=`[x]`) but **never called in any route handler**. Tenant filtering done via WHERE only. |
| G2 — JWT 15min, identity-only | JWT = `{sub, tid, bid, scope, jti, exp=15min}`. No role/perms in payload. Access token in memory only, refresh in HttpOnly cookie. | BE-01..BE-09 all `[ ]` | JWT still includes `{userId, email, role, branchId, tenantId}`. TTL = 12h (not 15min). Tokens + user + permissions stored in `localStorage`. |
| G3 — Store scope query enforcement | `store_ids` must be enforced at query layer | Partial — `ensureScopeAccess` + `branchFilter` exist | Implemented via `buildScopeCondition` / `ensureScopeAccess`. Partial coverage — not all routes apply it. |
| G4 — Shard routing | `TenantShardRouter` for business data | DEFERRED (DEF-1) | Single DB only. Correctly deferred. |
| G5 — Platform ≠ Tenant roles | Platform DAG and Tenant DAG must never cross | BE-60..BE-64 = `[ ]`. DB-80 = `[ ]` | `isSuperAdmin` boolean bypasses all checks. Roles table has `tenantId` column (added) but seed not updated (DB-80/81/82 = `[ ]`). Platform users can call tenant endpoints. |
| G6 — Resource ownership check | Every read/write must verify `resource.tenantId === user.tenantId` | BE-30..BE-56 = `[ ]` | Most routes added `eq(table.tenantId, tenantId)` WHERE clause. But: **credit sale product lookup (routes.ts:968) has NO tenant check** — critical gap. |
| G7 — Per-tenant rate limit | Redis sliding window `ratelimit:{tenantId}:{endpoint}` | BE-20/21 = `[ ]` | Only IP-based rate limiting via `express-rate-limit`. No tenant rate limiter. |
| G8 — 128-bit bitmask perms | `mask_low + mask_high` on roles, `user_role_assignments` table, `hasPerm()` O(1) check | DB-41/42/43 = `[x]` (schema done). BE-13..BE-16 = `[ ]` (service not built). FE-10..14 = `[ ]` | `mask_low`/`mask_high` columns added to roles table. `user_role_assignments` table created. But: `permission.service.ts` exists as file but uses old string-array model. `permissions.ts` exists but authorize() still compares string arrays at runtime. |
| G9 — Two-level audit log | Tenant audit (chained SHA-256 checksum) + platform audit table | DB-60=`[x]`, DB-61=`[ ]` (immutability trigger missing), DB-62=`[x]`. BE-80..82 = `[ ]` | `checksum` column added to `activityLogs`. `platformAuditLogs` table created. But: checksum is never computed in `activity-log.helper.ts`. Immutability trigger doesn't exist. Platform audit never written. |
| G10 — Merchant offboarding | `status` field, `delete_after`, suspend API, Redis cache invalidation | DB-70/71=`[x]`. BE-90/91 = `[ ]` | `tenants.status` column added. `deleteAfter` added. But: no suspend API. No merchant status check in `authenticate()` middleware (BE-11 = `[ ]`). Suspended merchant can still transact. |

---

## ▌ SECTION 2 — LOYALTY SYSTEM: Design vs Code

### What the schema/design has

| Component | Schema Definition | Used in Sales? |
|-----------|------------------|----------------|
| `pointSettings` table | `pointsPerCurrency`, `minSpendToEarn`, `redemptionRate`, `minPointsToRedeem`, `expiryMonths` | **NO** — never read during sale creation |
| `membershipTiers` table | `pointMultiplier`, `discountPercent`, `minPoints` | **NO** — tier discount never applied at checkout |
| `transactions.pointsEarned` | Column exists, default 0 | **NO** — always stays 0. No calculation in POST /sales |
| `transactions.pointsRedeemed` | Column exists, default 0 | **NO** — always stays 0 |
| `pointsHistory` table | `customerId`, `points`, `type`, `reason`, `referenceId` | **NO** — never written by sales routes |
| `pointHistory` table (members) | `memberId`, `type`, `points`, `balance`, `referenceType` | **NO** — never written by sales routes |
| `members.points` | Tracks member point balance | **NO** — never updated when sale completes |
| `customers.points` | Tracks customer point balance | **NO** — never updated when sale completes |
| `members.totalSpent` / `visitCount` | Track spending & visits | **NO** — never updated when sale completes |
| Loyalty settings (`GET /customers/loyalty/settings`) | `earnRate`, `redeemRate`, `pointsExpiry`, etc. | **NO** — settings endpoint exists but values never consumed in sales |

### Critical gap: loyalty is a standalone CRUD module, not integrated with sales

The POS flow (`POST /sales`) currently:
1. Looks up products (with tenant check for regular sale, **without** for credit sale)
2. Calculates discount from `discountType`/`discountValue` in request body only
3. Inserts transaction record (has `pointsEarned=0`, `pointsRedeemed=0` hardcoded by default)
4. Inserts transaction items
5. Deducts inventory
6. Returns receipt

**What is MISSING from sale creation:**
- Load `pointSettings` for tenant → calculate `pointsEarned = Math.floor(total * pointsPerCurrency * tierMultiplier)`
- If `memberId` passed → load member tier → apply `tier.discountPercent` automatically
- Write `pointsEarned` to `transactions.pointsEarned`
- Update `customers.points += pointsEarned`
- Update `members.points += pointsEarned` (if memberId given)
- Update `members.totalSpent += transaction.total`
- Update `members.visitCount += 1`
- Insert `pointsHistory` record (type='EARN', referenceId=transactionId)
- Insert `pointHistory` record for member
- Support `pointsRedeemed` input → deduct from `customers.points`/`members.points`, reduce sale total
- On void/refund → reverse points

---

## ▌ SECTION 3 — PROMOTIONS: Design vs Code

### What the schema/design has

| Component | Schema Definition | Used in Sales? |
|-----------|------------------|----------------|
| `promotions` table | `type` (PERCENTAGE/FIXED/BOGO), `value`, `conditions` JSONB, `applicableTo` JSONB, `memberOnly`, `priority`, `usageLimit`, `startDate`/`endDate` | **NO** — never auto-applied in POST /sales |
| `coupons` table | `code`, `type`, `value`, `minPurchase`, `maxDiscount`, `usageLimit`, `usageCount` | **NO** — `POST /promotions/coupons/validate` exists but is never called from within sale creation |
| `coupons.usageCount` | Tracks how many times coupon was used | **NEVER INCREMENTED** — even if `validate` is called externally, counter is never updated |
| `discounts` table | `discountType`, `discountValue`, `applyTo` (all/product/category), `productIds[]`, `categoryIds[]` | **NO** — never fetched or applied during sale |

### POS frontend (`/pos/+page.svelte`) only sends:
```js
{
  discountType: cart.discountType,   // 'PERCENTAGE' | 'FIXED' | null — manual only
  discountValue: cart.discountValue, // number — manually entered
  // NO couponCode, NO promotionId, NO memberTierDiscount
}
```

### What is MISSING from sale creation for promotions:

1. **Coupon application**: Accept `couponCode` in sale body → validate → apply discount → increment `coupons.usageCount` inside the sale transaction
2. **Auto-promotion engine**: After subtotal calculated → query active promotions for tenant → evaluate `conditions` → apply highest-priority matching promotion
3. **Discount rules**: Fetch active `discounts` → match by `applyTo=product` with `productIds` or `applyTo=category` with `categoryIds` → apply per-item discounts
4. **Member tier discount**: If `memberId` provided → load `member.tierId` → load `membershipTiers.discountPercent` → auto-apply on top
5. **BOGO logic**: No buy-one-get-one implementation anywhere
6. **Promotion usage tracking**: No `promotions.usageCount` column or increment logic

---

## ▌ SECTION 4 — CODE BUGS FOUND (not in any doc)

| # | File | Line | Bug |
|---|------|------|-----|
| BUG-1 | `sales/routes.ts` | ~968 | Credit sale product loop: `where eq(products.id, item.productId)` — **no tenantId check**. Cross-tenant product purchase possible via credit sale. Regular sale at line 50 is protected but credit sale is not. |
| BUG-2 | `sales/routes.ts` | ~154 | `transactionPayments` insert does not include `tenantId`. Column was added to schema (DB-22=`[x]`) but insert still omits it → `tenantId = NULL` on all payment records. |
| BUG-3 | `customers/routes.ts` | ~256 | `GET /loyalty/settings` has no tenantId filter: `where and(eq(settings.category,'loyalty'), eq(settings.key,'program_settings'))` — returns first tenant's settings to all tenants. |
| BUG-4 | `customers/routes.ts` | ~280 | `PUT /loyalty/settings` upserts without `tenantId` → one global settings row shared across all tenants. |
| BUG-5 | `sales/routes.ts` | ~106 | Transaction counter uses `gte(transactions.createdAt, startOfDay)` but then calls `now.setHours()` which **mutates** `now` before the query — race condition in transaction number generation. |
| BUG-6 | `customers/routes.ts` | ~511 | `POST /:id/points` — no `pointsHistory` record created. Points are updated but no audit trail written. |

---

## ▌ SECTION 5 — PLAN: HOW TO FIX LOYALTY + PROMOTIONS IN SALES

### Priority order (do DB first, then backend, then frontend)

#### Step 1 — Database (no migration needed — schema already has columns)
- [ ] Verify `pointsEarned`, `pointsRedeemed` columns exist on `transactions` (they do — lines 539-540 of tables.ts)
- [ ] Verify `pointSettings` table exists (it does — line 820 of tables.ts)
- [ ] Add `tenantId` to `transactionPayments` insert (BUG-2 fix — 1 line)
- [ ] Add `usageCount` increment to coupons (schema already has `usageCount` column)

#### Step 2 — Backend: Loyalty integration in POST /sales

**Location:** `APIS/src/modules/sales/presentation/routes.ts` — inside the `db.transaction()` block

Add after step 2 (insert transaction), before returning:

```typescript
// A. Load loyalty settings for tenant
const loyaltySettings = await tx.query.pointSettings.findFirst({
  where: eq(pointSettings.tenantId, saleTenantId)
});

// B. Load member tier if memberId provided
let tierDiscount = 0;
if (memberId) {
  const member = await tx.query.members.findFirst({ where: eq(members.id, memberId) });
  if (member?.tierId) {
    const tier = await tx.query.membershipTiers.findFirst({ where: eq(membershipTiers.id, member.tierId) });
    tierDiscount = tier?.discountPercent || 0;
    // Apply tier discount to totalAmount (if not already discounted)
  }
}

// C. Calculate points earned
let pointsEarned = 0;
if (loyaltySettings?.isActive) {
  const multiplier = member?.tierId ? (tier?.pointMultiplier || 1) : 1;
  pointsEarned = Math.floor(totalAmount * loyaltySettings.pointsPerCurrency * multiplier);
  
  // Update transaction with pointsEarned
  await tx.update(transactions)
    .set({ pointsEarned })
    .where(eq(transactions.id, newTransaction.id));

  // Update customer points
  if (customerId) {
    await tx.update(customers)
      .set({ points: sql`${customers.points} + ${pointsEarned}` })
      .where(eq(customers.id, customerId));
    
    await tx.insert(pointsHistory).values({
      tenantId: saleTenantId, customerId,
      points: pointsEarned, type: 'EARN',
      reason: `Sale ${transactionNo}`, referenceId: newTransaction.id,
    });
  }

  // Update member points + totalSpent + visitCount
  if (memberId) {
    await tx.update(members).set({
      points: sql`${members.points} + ${pointsEarned}`,
      totalSpent: sql`${members.totalSpent} + ${totalAmount}`,
      visitCount: sql`${members.visitCount} + 1`,
    }).where(eq(members.id, memberId));

    await tx.insert(pointHistory).values({
      tenantId: saleTenantId, memberId,
      type: 'EARN', points: pointsEarned,
      balance: member.points + pointsEarned,
      reference: newTransaction.id, referenceType: 'SALE',
    });
  }
}
```

#### Step 3 — Backend: Points Redemption

Accept `pointsToRedeem` in POST /sales body:
- Validate `pointsToRedeem <= customer.points` and `pointsToRedeem >= loyaltySettings.minPointsToRedeem`
- `redeemAmount = pointsToRedeem / loyaltySettings.redemptionRate`  
- Subtract from `totalAmount`
- Write `transactions.pointsRedeemed = pointsToRedeem`
- Deduct from `customers.points` and `members.points`
- Insert REDEEM type into `pointsHistory` / `pointHistory`

#### Step 4 — Backend: Coupon application in POST /sales

Accept `couponCode` in POST /sales body:
- Call coupon validate logic inside the transaction
- Apply discount amount from coupon
- Increment `coupons.usageCount += 1` inside the same DB transaction

#### Step 5 — Backend: Auto-promotion engine

Before calculating totals in POST /sales:
1. Query active promotions: `where tenantId = saleTenantId AND isActive = true AND startDate <= now AND (endDate IS NULL OR endDate >= now)`
2. Sort by `priority DESC`
3. Evaluate `conditions` JSONB against cart (minPurchase, memberOnly, productIds, etc.)
4. Apply highest-priority matching promotion discount
5. Track `promotionId` on the transaction (need to add column)

#### Step 6 — Backend: Fix BUG-3/4 (loyalty settings per tenant)

`GET /loyalty/settings` and `PUT /loyalty/settings` must scope to `req.authUser.tenantId`.

#### Step 7 — Frontend (POS page)

Add to payment payload:
- `couponCode` (from coupon input field — needs UI)
- `pointsToRedeem` (from points redemption UI — needs UI)
- `memberId` is already sent (line 30: `memberId: cart.customer?.id`)

Add to POS cart summary:
- Points earned preview: `Math.floor(cart.total * earnRate)` pts
- Coupon code input field
- Points redeem input field (if customer has points)
- Applied tier discount indicator (if customer's tier has `discountPercent > 0`)

---

## ▌ SECTION 6 — SUMMARY TABLE

| Area | Docs Say | Code Does | Status |
|------|----------|-----------|--------|
| JWT TTL | 15 min | 12 hours | ❌ WRONG |
| JWT payload | identity-only | includes role, email | ❌ WRONG |
| Tokens in localStorage | None | access + refresh + user + rules | ❌ WRONG |
| JTI revocation | Redis blacklist | Not implemented | ❌ MISSING |
| RLS policies | PostgreSQL USING clause | Not created | ❌ MISSING |
| setTenantContext() | Called in every handler | Created but never called | ❌ MISSING |
| Per-tenant rate limit | Redis sliding window | Not implemented | ❌ MISSING |
| Bitmask permissions | 128-bit, O(1) check | String array, O(n) | ❌ WRONG |
| user_role_assignments | Table created | Never written/read | ❌ SCHEMA ONLY |
| Merchant status check | After JWT verify | Not implemented | ❌ MISSING |
| Audit checksum | SHA-256 chained | Column added, never computed | ❌ SCHEMA ONLY |
| Audit immutability trigger | DB trigger | Not created | ❌ MISSING |
| **Points earned on sale** | **Automatic calculation** | **Always 0, never updated** | **❌ NOT WIRED** |
| **Points redeemed on sale** | **Deduct from total** | **Not implemented** | **❌ MISSING** |
| **Tier discount on sale** | **Auto-applied by tier** | **Not implemented** | **❌ MISSING** |
| **Coupon redemption in sale** | **Apply + increment count** | **Validate endpoint only** | **❌ NOT WIRED** |
| **Auto-promotion engine** | **Priority-based matching** | **Not implemented** | **❌ MISSING** |
| Credit sale tenant check | Required | Missing (BUG-1) | ❌ BUG |
| transactionPayments tenantId | Required | Never injected (BUG-2) | ❌ BUG |
| Loyalty settings per-tenant | Required | Global (BUG-3/4) | ❌ BUG |
