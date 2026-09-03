// Postgres caps a single query at 65,534 bound parameters. `inArray(col,
// ids)` binds one parameter per id, so any endpoint that first fetches a
// row set unscoped by tenant (chiefly super_admin, who sees every tenant)
// and then does a second `inArray()` lookup keyed off those ids can build a
// list well past that cap — this repo's biggest tenant alone has 100k+
// branches from prior scale testing, and hit exactly this ceiling in
// GET /branches, GET /admin/stores-overview, and GET /reports/branch-compare
// (MAX_PARAMETERS_EXCEEDED, thrown from postgres.js's connection layer).
//
// Splits the id list into batches under the limit and runs `queryFn` once
// per batch, concatenating results. Safe to use even when `ids.length` is
// small — a single batch is just one query, same as calling queryFn directly.
const MAX_IN_CLAUSE_SIZE = 20_000; // comfortably under the 65,534 hard cap, leaving room for the query's other bound params

export async function queryInChunks<TId, TRow>(
    ids: TId[],
    queryFn: (batch: TId[]) => Promise<TRow[]>,
): Promise<TRow[]> {
    if (ids.length === 0) return [];
    if (ids.length <= MAX_IN_CLAUSE_SIZE) return queryFn(ids);

    const results: TRow[] = [];
    for (let i = 0; i < ids.length; i += MAX_IN_CLAUSE_SIZE) {
        const batch = ids.slice(i, i + MAX_IN_CLAUSE_SIZE);
        results.push(...await queryFn(batch));
    }
    return results;
}
