// ═══════════════════════════════════════════════════════════════════════════
// KPOS API - ESLint config (legacy format, matching installed eslint@8 /
// @typescript-eslint@6 — no config existed before this).
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
    },
    plugins: ['@typescript-eslint'],
    // Deliberately NOT extending eslint:recommended / @typescript-eslint/recommended:
    // turning those on surfaces ~200 pre-existing issues across this long-lived
    // codebase unrelated to tenant scoping — a separate cleanup, not something to
    // silently bundle into a security regression guard. This config's only job
    // right now is the rule below; broaden it deliberately later if wanted.
    env: {
        node: true,
        es2022: true,
    },
    rules: {
        // Full RLS-bypass incident (2026-07-11): a route handler that queries
        // through the unscoped `globalDb` instead of the tenant-scoped `db`
        // (= req.tx ?? globalDb) bypasses withTenantTx() entirely — with RLS
        // enforcement on, that's silent empty results; with RLS off, it's a
        // silent cross-tenant read. `db.transaction(...)` (globalDb.transaction
        // is the sanctioned scopedTransaction()/SET LOCAL escape hatch) and
        // `dbRead` are allowed — everything else on globalDb needs either a
        // rewrite to use the shadowed `db`, or an explicit disable comment
        // explaining why the query is intentionally tenant-agnostic (matches
        // the pattern already used by loadActiveConfig, upsertSetting, etc).
        'no-restricted-syntax': [
            'error',
            {
                selector: "MemberExpression[object.name='globalDb'][property.name!='transaction']",
                message:
                    "Route handlers should query through 'db' (= req.tx ?? globalDb), not 'globalDb' directly — globalDb bypasses the tenant-scoped connection RLS relies on. If this call is genuinely tenant-agnostic (a global catalog table, or already explicitly filtered by tenantId), add a disable comment explaining why.",
            },
        ],
    },
    ignorePatterns: ['dist/', 'node_modules/', 'drizzle/', '*.cjs', '*.js'],
};
