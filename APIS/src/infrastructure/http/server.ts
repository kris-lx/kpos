// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Express Server Setup
// ═══════════════════════════════════════════════════════════════════════════

import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer, type Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { appConfig } from '@/config/app.config';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { rateLimiter } from './middleware/rateLimit.middleware';
import { setupRoutes } from './routes';
import { setupSocketHandlers } from './socket';

export class AppServer {
    private app: Application;
    private httpServer: HttpServer;
    private io: SocketServer;

    constructor() {
        this.app = express();
        this.httpServer = createServer(this.app);
        this.io = new SocketServer(this.httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
            },
        });

        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        this.setupErrorHandling();
    }

    private setupMiddleware(): void {
        // Security
        this.app.use(helmet());
        this.app.use(cors({
            origin: appConfig.isProduction
                ? process.env.CORS_ORIGIN?.split(',')
                : '*',
            credentials: true,
        }));

        // Rate limiting
        this.app.use(rateLimiter);

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Logging
        this.app.use(requestLogger);

        // Health check
        this.app.get('/health', (_, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                environment: appConfig.env,
            });
        });
    }

    private setupRoutes(): void {
        setupRoutes(this.app);
    }

    private setupSocketHandlers(): void {
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
