// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Prometheus Metrics
// Plain prom-client + direct Prometheus scrape — chosen over routing through
// the OTel Collector's OTLP metrics pipeline (instrumentation.ts) because
// Node's OTel auto-instrumentation only reliably emits traces, not metrics,
// in this SDK version (verified: traces flow to the collector immediately,
// metrics never appear even after several export cycles). This gives the
// monitoring stack real, guaranteed data instead of an empty panel.
// Traces still go through instrumentation.ts/the OTel Collector, untouched.
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

export const metricsRegistry = new client.Registry();
client.collectDefaultMetrics({ register: metricsRegistry }); // process CPU/memory/event-loop lag, etc.

const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [metricsRegistry],
});

const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [metricsRegistry],
});

// Route path with real IDs (not the express pattern) would blow up
// cardinality — e.g. /products/:id logged once per distinct product ID
// forever. req.route.path (set once express resolves the matching route)
// gives the pattern instead; unmatched requests (404s before routing)
// fall back to a fixed label so they're still counted without exploding
// cardinality on arbitrary attacker-supplied paths.
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (req.path === '/metrics') return next(); // don't measure scraping itself
    const stop = httpRequestDuration.startTimer();
    res.on('finish', () => {
        const route = (req.route?.path as string | undefined) || req.baseUrl || 'unmatched';
        const labels = { method: req.method, route, status_code: String(res.statusCode) };
        stop(labels);
        httpRequestsTotal.inc(labels);
    });
    next();
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
    res.set('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
}
