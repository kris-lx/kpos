# KPOS Backend API

Enterprise-grade multi-tenant POS (Point of Sale) backend built with **Express.js**, **TypeScript**, **Drizzle ORM**, and **PostgreSQL**.

## Architecture

```
src/
├── config/              # App, database, Redis, RabbitMQ configuration
├── db/
│   └── schema/
│       ├── tables.ts    # All Drizzle table definitions (35+ tables)
│       ├── relations.ts # Drizzle relation definitions
│       └── index.ts     # Barrel export
├── infrastructure/
│   ├── http/
│   │   ├── middleware/  # Auth, RBAC, rate-limit, cache, error handling
│   │   ├── routes/      # Route mounting
│   │   └── server.ts    # Express server setup
│   ├── services/        # Upload (Cloudinary), notifications, cash
│   ├── helpers/         # Activity log helper
│   ├── workers/         # RabbitMQ queue workers
│   └── permissions.ts   # Permission constants
├── modules/             # Business domain modules
│   ├── auth/            # Login, register, JWT refresh, sessions
│   ├── admin/           # Super Admin: users, branches, stores, requests, audit
│   ├── products/        # Products, SKUs, price levels, barcode lookup
│   ├── categories/      # Category CRUD with hierarchy
│   ├── inventory/       # Stock, vendors, purchase orders, transfers, counts
│   ├── sales/           # Transactions, held sales, shifts, cash registers
│   ├── customers/       # Customer management, loyalty, membership tiers
│   ├── payments/        # Payment methods, settlements, transactions
│   ├── promotions/      # Promotions, coupons, discounts
│   ├── restaurant/      # Tables, orders, reservations, e-menu
│   ├── reports/         # Sales, inventory, financial, staff, customer, product
│   ├── documents/       # Invoices, tax invoices
│   ├── dashboard/       # Dashboard stats, charts, alerts
│   ├── settings/        # App settings, taxes, printers, integrations
│   ├── branches/        # Branch management
│   ├── stores/          # Store management, store requests
│   ├── staff/           # Staff CRUD
│   ├── users/           # User management
│   └── roles/           # Roles, rules, permission groups
└── shared/              # Base classes (Controller, UseCase, domain primitives)
```

## Multi-Tenant Design

- **Hierarchy:** Tenant → Branch → Store → POS Terminal
- All business tables have a `tenant_id` column for isolation
- **Super Admin** bypasses all tenant/branch/store filters
- **System Admin (Tenant Admin)** sees all branches/stores within their tenant
- **Store-scoped users** only see data tied to their assigned stores
- RBAC with rules/role-rules matrix and per-module CRUD flags

## Quick Start

### Prerequisites

- Node.js 18+ or [Bun](https://bun.sh) 1.0+
- PostgreSQL 15+
- Redis 7+ (optional, for caching)
- RabbitMQ 3.12+ (optional, for async workers)

### Setup

```bash
# 1. Install dependencies
bun install          # or: npm install

# 2. Start infrastructure (if using Docker)
docker compose up -d postgres redis rabbitmq

# 3. Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

# 4. Generate & push database schema
bun db:generate
bun db:push

# 5. Start dev server (hot-reload)
bun dev              # or: npm run dev
```

Server starts at `http://localhost:5000/api/v1/`

## API Modules

All routes are prefixed with `/api/v1/`.

| Module | Prefix | Description |
|--------|--------|-------------|
| Auth | `/auth` | Login, register, refresh, logout, me, sessions |
| Users | `/users` | User CRUD, profile, menu permissions |
| Roles | `/roles` | Role CRUD, rules matrix |
| Products | `/products` | Product CRUD, SKUs, price levels, barcode lookup |
| Categories | `/categories` | Category CRUD with parent/child hierarchy |
| Inventory | `/inventory` | Stock levels, movements, vendors, POs, transfers, counts |
| Sales | `/sales` | Transactions, held sales, shifts, cash registers, voids |
| Customers | `/customers` | Customer CRUD, loyalty points, membership tiers |
| Payments | `/payments` | Payment methods, settlements, transaction payments |
| Promotions | `/promotions` | Promotions, coupons, discounts |
| Restaurant | `/restaurant` | Tables, orders, reservations, e-menu |
| Reports | `/reports` | Sales, inventory, financial, staff, customer, product reports |
| Documents | `/documents` | Invoices, tax invoices |
| Dashboard | `/dashboard` | Stats, sales chart, low-stock alerts, top products |
| Settings | `/settings` | App config, taxes, printers, receipts, integrations |
| Branches | `/branches` | Branch CRUD |
| Stores | `/stores` | Store CRUD, store requests |
| Staff | `/staff` | Staff management |
| Admin | `/admin` | Super Admin panel: requests, audit, system management |
| Upload | `/upload` | File upload via Cloudinary |
| Notifications | `/notifications` | User notification CRUD |

## Authentication

JWT Bearer token required on all endpoints except `/auth/login`, `/auth/register`, and `/admin/register-and-apply`.

```bash
curl -H "Authorization: Bearer <token>" http://localhost:5000/api/v1/products
```

**Token flow:** Login → Access Token (15m) + Refresh Token (7d) → Auto-refresh

## Caching & Performance

- **Redis caching** on auth middleware (user data, store access, role rules — 5min TTL)
- **Query cache** on dashboard/stats and inventory/stats endpoints
- **Read replica** support via `DATABASE_READ_URL` for read-heavy queries (reports, dashboards)
- **RabbitMQ** workers for async stock movements, activity logs, and cross-instance cache invalidation

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start dev server with hot-reload (tsx watch) |
| `bun start` | Start production server |
| `bun build` | Compile TypeScript |
| `bun db:generate` | Generate Drizzle migration files |
| `bun db:push` | Push schema directly to database |
| `bun db:migrate` | Run pending migrations |
| `bun db:studio` | Open Drizzle Studio (DB browser) |
| `bun db:seed` | Seed database with defaults |
| `bun test` | Run tests (Vitest) |
| `bun typecheck` | TypeScript type check (`tsc --noEmit`) |

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DATABASE_READ_URL` | No | Read replica connection (falls back to primary) |
| `JWT_SECRET` | Yes | JWT signing key (min 32 chars) |
| `REDIS_URL` | No | Redis URL (default: `redis://localhost:6379`) |
| `RABBITMQ_URL` | No | RabbitMQ URL (graceful fallback to sync) |
| `CLOUDINARY_CLOUD_NAME` | No | Cloudinary cloud name for file uploads |
| `CLOUDINARY_API_KEY` | No | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | Cloudinary API secret |

## License

MIT
