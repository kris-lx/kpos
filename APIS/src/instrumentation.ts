// ═══════════════════════════════════════════════════════════════════════════
// OpenTelemetry SDK bootstrap.
//
// MUST be the first thing imported in index.ts (after ./env, which just
// loads process.env).
//
// Vendor-agnostic by design: the exporter target is controlled entirely by
// the standard OTEL_EXPORTER_OTLP_ENDPOINT env var. Point that at any
// OTLP-compatible backend later (Grafana Cloud, Datadog, Honeycomb,
// self-hosted collector, ...) with zero code changes here. With no endpoint
// configured, spans/metrics print to the console instead — inspectable
// today without waiting on a vendor decision.
//
// VERIFIED WORKING (2026-07-11), under the normal `npm run dev` (tsx, no
// extra flags): HTTP + Express request spans, with route, method, status,
// duration — confirmed against real requests, spans genuinely appear.
//
// KNOWN GAP, not silently broken: full package-level auto-instrumentation
// (ioredis command spans, pino log-trace correlation, socket.io event spans)
// needs Node's ESM instrumentation loader
// (--experimental-loader=@opentelemetry/instrumentation/hook.mjs or the
// newer --import+register() form) active, because this is an ESM project
// ("type": "module") and only core-module patching (http) works without it —
// third-party ESM package imports (ioredis, etc.) need the loader hook to be
// intercepted at all. Tried wiring that loader into the tsx-based dev
// workflow directly: it breaks tsx's own TypeScript module resolution
// entirely (conflicting loader chains). Tried the compiled dist/ + plain
// `node` path instead: hit a *separate*, pre-existing bug — tsc's output
// (moduleResolution: "bundler") doesn't add the .js extensions plain Node
// ESM needs to resolve relative imports, so `node dist/index.js` doesn't run
// at all today regardless of OpenTelemetry. Fixing that build gap is a
// separate, unrelated task from observability — not done here. Until one of
// these is resolved, DB query-level spans (no official postgres.js
// instrumentation exists either way — see below) and Redis/socket.io
// command-level spans are not available; HTTP-level spans still show overall
// request latency including that time, just not broken down further.
//
// Does NOT cover, independent of the above: DB query-level spans. This app
// uses `postgres` (porsager's postgres.js), which has no official
// OpenTelemetry instrumentation package (only `pg` does, via
// @opentelemetry/instrumentation-pg — a different driver).
// ═══════════════════════════════════════════════════════════════════════════

import { NodeSDK, resources, tracing } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName = process.env.OTEL_SERVICE_NAME || 'kpos-api';

const traceExporter = otlpEndpoint ? new OTLPTraceExporter() : new tracing.ConsoleSpanExporter();

const metricReader = new PeriodicExportingMetricReader({
    exporter: otlpEndpoint ? new OTLPMetricExporter() : new ConsoleMetricExporter(),
    exportIntervalMillis: 60_000,
});

const sdk = new NodeSDK({
    resource: resources.resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: process.env.npm_package_version || 'unknown',
    }),
    traceExporter,
    metricReaders: [metricReader],
    instrumentations: [
        getNodeAutoInstrumentations({
            // Fires a span for every fs.readFile/writeFile/etc — overwhelmingly
            // noisy (module loading, template reads, upload temp files) and not
            // useful signal for this app. Every other default instrumentation
            // (http, express, ioredis, socket.io, pino, ...) stays on.
            '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
    ],
});

try {
    sdk.start();
    console.log(
        `📊 OpenTelemetry started (service: ${serviceName}, exporter: ${otlpEndpoint ? otlpEndpoint : 'console'})`
    );
} catch (err) {
    // Telemetry must never be able to take the app down — log and continue
    // with no instrumentation rather than fail server startup over it.
    console.warn('⚠️  OpenTelemetry failed to start:', err);
}

process.on('SIGTERM', () => {
    sdk.shutdown().catch(() => {});
});
