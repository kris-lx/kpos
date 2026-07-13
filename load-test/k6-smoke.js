// ═══════════════════════════════════════════════════════════════════════════
// KPOS - k6 load test (API-level, no browser)
//
// Run with the official k6 Docker image (no local install needed):
//   docker run --rm -i --network kpos-network -e BASE_URL=http://api:5000/api/v1 \
//     -e LOAD_TEST_EMAIL=owner@kpos.la -e LOAD_TEST_PASSWORD=Demo@123456 \
//     grafana/k6 run - < load-test/k6-smoke.js
//
// Or against a locally-running (non-dockerized) `npm run dev` API:
//   docker run --rm -i -e BASE_URL=http://host.docker.internal:5000/api/v1 \
//     -e LOAD_TEST_EMAIL=owner@kpos.la -e LOAD_TEST_PASSWORD=Demo@123456 \
//     grafana/k6 run - < load-test/k6-smoke.js
//
// Or with a native k6 install: k6 run load-test/k6-smoke.js
//
// Exercises the flows this session's live testing already validated by
// hand: login, list products/inventory/customers/reports (the same routes
// covered by the Playwright E2E suite), plus a real POS sale end-to-end
// (stock pre-check + row locking under concurrency is exactly what this
// session's HIGH-severity /inventory/adjust and /sales fixes protect —
// load is the natural way to prove those hold up under real concurrency,
// not just the two-request race tests done manually earlier).
// ═══════════════════════════════════════════════════════════════════════════

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000/api/v1';
const EMAIL = __ENV.LOAD_TEST_EMAIL || 'owner@kpos.la';
const PASSWORD = __ENV.LOAD_TEST_PASSWORD || 'Demo@123456';

const errorRate = new Rate('kpos_errors');
const loginDuration = new Trend('kpos_login_duration', true);
const saleDuration = new Trend('kpos_sale_duration', true);

export const options = {
    scenarios: {
        // Ramps to a modest concurrent user count and holds — enough to
        // surface pool-exhaustion/lock-contention issues (the exact class of
        // bug found and fixed in this session: dev DB pool sizing,
        // row-locking on inventory writes) without needing production-scale
        // infrastructure to run against.
        smoke: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '20s', target: 10 },
                { duration: '40s', target: 10 },
                { duration: '10s', target: 0 },
            ],
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'], // <1% of requests may fail
        http_req_duration: ['p(95)<1000'], // 95% of requests under 1s
        kpos_errors: ['rate<0.01'],
    },
};

function authHeaders(token) {
    return { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

function login() {
    const res = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({ email: EMAIL, password: PASSWORD }),
        { headers: { 'Content-Type': 'application/json' } },
    );
    loginDuration.add(res.timings.duration);
    // A connection failure (target down/unreachable) returns a response with
    // a null body — calling res.json() on that throws inside k6's JS runtime
    // rather than returning a falsy value, which previously crashed every
    // iteration instantly (aborting before the retry `sleep(1)` below ever
    // ran) instead of being reported as a normal failed check.
    const statusOk = check(res, { 'login succeeded': (r) => r.status === 200 });
    errorRate.add(!statusOk);
    if (!statusOk) return null;

    const token = res.json('data.accessToken');
    const tokenOk = check(token, { 'login returned a token': (t) => !!t });
    errorRate.add(!tokenOk);
    return tokenOk ? token : null;
}

export default function () {
    const token = login();
    if (!token) {
        sleep(1);
        return;
    }
    const opts = authHeaders(token);

    group('browse — the read-heavy pages every real session hits', () => {
        const responses = http.batch([
            ['GET', `${BASE_URL}/products?limit=20`, null, opts],
            ['GET', `${BASE_URL}/inventory?limit=20`, null, opts],
            ['GET', `${BASE_URL}/customers?limit=20`, null, opts],
            ['GET', `${BASE_URL}/stores/my-stores`, null, opts],
        ]);
        for (const res of responses) {
            const ok = check(res, { 'browse request succeeded': (r) => r.status === 200 });
            errorRate.add(!ok);
        }
    });

    group('POS sale — the concurrency-sensitive write path', () => {
        const productsRes = http.get(`${BASE_URL}/products?limit=1`, opts);
        const product = productsRes.json('data.0');
        if (!product) return; // seed data not present against this target — browse-only run

        const branchId = productsRes.json('data.0.branchId');
        const saleStart = Date.now();
        const saleRes = http.post(
            `${BASE_URL}/sales`,
            JSON.stringify({
                items: [{ productId: product.id, quantity: 1 }],
                branchId,
                paymentMethod: 'cash',
                payments: [{ method: 'cash', amount: product.price || 1 }],
            }),
            opts,
        );
        saleDuration.add(Date.now() - saleStart);
        const ok = check(saleRes, {
            // 201 = sold; 400 INSUFFICIENT_STOCK is an expected, correct
            // outcome once concurrent VUs exhaust seed stock — not a bug.
            'sale accepted or correctly rejected for stock': (r) =>
                r.status === 201 || (r.status === 400 && r.json('error.code') === 'INSUFFICIENT_STOCK'),
        });
        errorRate.add(!ok);
    });

    sleep(1);
}
