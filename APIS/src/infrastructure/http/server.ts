// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Express Server Setup
// ═══════════════════════════════════════════════════════════════════════════

import express, { type Application } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { createServer, type Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { appConfig } from '@/config/app.config';
import { isDatabaseConnected } from '@/config/database.config';
import { isRedisAvailable } from '@/config/redis.config';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { rateLimiter } from './middleware/rateLimit.middleware';
import { inputSanitizer, noCacheHeaders } from './middleware/security.middleware';
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
            const dbOk    = isDatabaseConnected();
            const redisOk = isRedisAvailable();
            const allOk   = dbOk && redisOk;
            res.status(allOk ? 200 : 503).json({
                status:      allOk ? 'ok' : 'degraded',
                timestamp:   new Date().toISOString(),
                environment: appConfig.env,
                services: {
                    database: dbOk    ? 'connected' : 'disconnected',
                    redis:    redisOk ? 'connected' : 'disconnected',
                },
            });
        });
    }

    private setupRoutes(): void {
        setupRoutes(this.app);
    }

    private setupSocketHandlers(): void {
        SocketEventEmitter.setIO(this.io);
        setupSocketHandlers(this.io);
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
