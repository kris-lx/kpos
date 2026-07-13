// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Express Server Setup
// ═══════════════════════════════════════════════════════════════════════════

import express, { type Application } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { createServer, type Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { appConfig } from '@/config/app.config';
import { isDatabaseConnected } from '@/config/database.config';
import { isRedisAvailable, getRedisClient } from '@/config/redis.config';
import { isRabbitMQConnected } from '@/config/rabbitmq.config';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { rateLimiter } from './middleware/rateLimit.middleware';
import { inputSanitizer, noCacheHeaders } from './middleware/security.middleware';
import { metricsMiddleware, metricsHandler } from './middleware/metrics.middleware';
import { setupRoutes } from './routes';
import { setupSocketHandlers, SocketEventEmitter } from './socket';

export class AppServer {
    private app: Application;
    private httpServer: HttpServer;
    private io: SocketServer;
    private corsOrigins: string | string[] | boolean;

    constructor() {
        this.app = express();
        this.httpServer = createServer(this.app);

        // Guard: CORS_ORIGIN must be set to an explicit allow-list in production
        if (appConfig.isProduction && !process.env.CORS_ORIGIN) {
            throw new Error('CORS_ORIGIN env var must be set in production');
        }
        // Development: reflect the request Origin (required for credentials: true + cookies).
        // Wildcard '*' with credentials is rejected by browsers.
        this.corsOrigins = appConfig.isProduction
            ? process.env.CORS_ORIGIN!.split(',').map(o => o.trim())
            : process.env.CORS_ORIGIN
                ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
                : true;

        this.io = new SocketServer(this.httpServer, {
            cors: {
                origin: this.corsOrigins,
                methods: ['GET', 'POST'],
                credentials: true,
            },
        });

        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        this.setupErrorHandling();
    }

    private setupMiddleware(): void {
        // BigInt → string so JSON.stringify never throws on bitmask fields
        this.app.set('json replacer', (_key: string, value: unknown) =>
            typeof value === 'bigint' ? value.toString() : value
        );

        // Security
        this.app.use(helmet());
        this.app.use(cors({
            origin: this.corsOrigins,
            credentials: true,
        }));

        // Rate limiting
        this.app.use(rateLimiter);

        // Prometheus scrape target — see metrics.middleware.ts for why this
        // exists alongside the OTel Collector (traces only) rather than
        // going through OTLP for metrics too.
        this.app.use(metricsMiddleware);

        // Body parsing + cookies — tight global limit; upload routes override per-route
        this.app.use(express.json({ limit: '2mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '2mb' }));
        this.app.use(cookieParser());

        // Security: input sanitization + no-cache API headers
        this.app.use(inputSanitizer);
        this.app.use(noCacheHeaders);

        // Logging
        this.app.use(requestLogger);

        // Health check — includes Redis; load balancers use this
        this.app.get('/health', (_, res) => {
            const dbOk      = isDatabaseConnected();
            const redisOk   = isRedisAvailable();
            const rabbitOk  = isRabbitMQConnected();
            const allOk     = dbOk && redisOk;
            res.status(allOk ? 200 : 503).json({
                status:      allOk ? 'ok' : 'degraded',
                timestamp:   new Date().toISOString(),
                environment: appConfig.env,
                services: {
                    database: dbOk    ? 'connected' : 'disconnected',
                    redis:    redisOk ? 'connected' : 'disconnected',
                    // Informational only — not folded into `allOk`. RabbitMQ
                    // has a documented sync-fallback (see rabbitmq.config.ts)
                    // the app tolerates losing; failing health checks over it
                    // would flag an outage the app is designed to survive.
                    rabbitmq: rabbitOk ? 'connected' : 'disconnected (sync fallback active)',
                },
            });
        });

        // Prometheus scrape endpoint — unauthenticated, matching /health
        // (same trust boundary: infra-internal, not customer-facing data).
        this.app.get('/metrics', metricsHandler);
    }

    private setupRoutes(): void {
        setupRoutes(this.app);
    }

    private setupSocketHandlers(): void {
        SocketEventEmitter.setIO(this.io);
        setupSocketHandlers(this.io);
        this.attachRedisAdapter();
    }

    // Scaling audit (2026-07-11): Socket.IO's default adapter only broadcasts
    // to sockets connected to the SAME process. Without this, `sale:new`,
    // `inventory:change`, `order:update`, `table:update`, and notification
    // events emitted on one horizontally-scaled instance would never reach
    // clients connected to a different instance — kitchen displays, live
    // inventory, etc. would silently miss most updates in a multi-instance
    // deployment. Falls back to the default (single-instance-only) adapter
    // when Redis isn't configured, same as today — not worse, just not fixed.
    private attachRedisAdapter(): void {
        const base = getRedisClient();
        if (!base) return;
        try {
            const pubClient = base.duplicate();
            const subClient = base.duplicate();
            // ioredis clients throw (EventEmitter default behavior for an
            // unhandled 'error' event) if nothing is listening — without
            // these, a connection error on either duplicated client would
            // crash the process instead of just leaving events single-instance.
            pubClient.on('error', (err) => console.warn('⚠️  Socket.IO Redis adapter pub client error:', err.message));
            subClient.on('error', (err) => console.warn('⚠️  Socket.IO Redis adapter sub client error:', err.message));
            this.io.adapter(createAdapter(pubClient, subClient));
            console.log('✅ Socket.IO Redis adapter attached — events now broadcast across instances');
        } catch (err) {
            console.warn('⚠️  Failed to attach Socket.IO Redis adapter — falling back to single-instance broadcasting:', err);
        }
    }

    private setupErrorHandling(): void {
        this.app.use(notFoundHandler);
        this.app.use(errorHandler);
    }

    public getApp(): Application {
        return this.app;
    }

    public getIO(): SocketServer {
        return this.io;
    }

    public async start(): Promise<void> {
        return new Promise((resolve) => {
            this.httpServer.listen(appConfig.port, () => {
                console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                         KPOS API Server                                   ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  🚀 Server running on port ${appConfig.port}                                       ║
║  📝 Environment: ${appConfig.env.padEnd(20)}                            ║
║  🔗 API: http://localhost:${appConfig.port}/api/${appConfig.apiVersion}                          ║
║  📚 Docs: http://localhost:${appConfig.port}/api-docs                             ║
╚═══════════════════════════════════════════════════════════════════════════╝
        `);
                resolve();
            });
        });
    }

    public async stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.httpServer.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}

export const appServer = new AppServer();
