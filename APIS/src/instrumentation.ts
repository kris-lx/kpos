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
// VERIFIED WORKING (2026-07-11): HTTP + Express request spans, with route,
// method, status, duration — confirmed against real requests, both under
// `npm run dev` (tsx, no extra flags) AND under the compiled dist/ build run
// with plain `node dist/index.js` (see below) — no experimental loader
// needed for these.
//
// The dist/ build ESM gap (tsc's `moduleResolution: "bundler"` output doesn't
// add the .js extensions or rewrite path-alias imports plain Node ESM needs
// to resolve modules — `node dist/index.js` used to fail immediately with
// ERR_MODULE_NOT_FOUND) is FIXED: `npm run build` now runs `tsc-alias`
// (rewrites @/... alias imports to relative paths) followed by
// `scripts/fix-esm-extensions.mjs` (adds .js to the remaining plain relative
// imports) as post-build steps. `node dist/index.js` now boots end-to-end
// against the real DB/Redis/RabbitMQ and serves real HTTP requests.
//
// KNOWN GAP, verified NOT fixed by the above: package-level auto-
// instrumentation for ioredis and socket.io still produces zero spans, even
// against the fixed dist/ build, even with Node's ESM instrumentation loader
// (--experimental-loader=@opentelemetry/instrumentation/hook.mjs) wired in.
// Tested in isolation (bare script: import instrumentation, then `new
// Redis().set/get()`) under the loader — still zero ioredis spans. This is a
// genuine incompatibility between this instrumentation package and this
// ESM/Node version combination, not something the dist/ build gap was
// blocking. Since the loader gives no benefit here (HTTP/Express spans work
// fine without it, on both tsx and dist/) and does carry cost (an
// experimental Node flag, a Node deprecation warning, and it broke tsx's own
// module resolution when tried in dev), it is deliberately NOT wired into
// `start:prod`. DB query-level spans remain unavailable either way (no
// official postgres.js OpenTelemetry instrumentation exists — see below).
// HTTP-level spans still show overall request latency including
// Redis/socket.io time, just not broken down further.
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
