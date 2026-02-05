# KPOS Backend API

Enterprise-grade POS (Point of Sale) Backend built with Bun, Express.js, TypeScript, Prisma, and MongoDB.

## 🏗️ Architecture

This project follows **Clean Architecture / Domain-Driven Design (DDD)** principles:

```
src/
├── config/           # Configuration files
├── infrastructure/   # HTTP server, middleware, external services
├── modules/          # Domain modules (auth, products, sales, etc.)
│   └── [module]/
│       ├── domain/        # Entities, Value Objects, Domain Events
│       ├── application/   # Use Cases, DTOs
│       ├── infrastructure/# Repositories, External Services
│       └── presentation/  # Controllers, Routes
└── shared/           # Shared domain and application components
```

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- Docker & Docker Compose
- MongoDB 7.x (via Docker)
- Redis 7.x (via Docker)

### Development Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Start infrastructure:**
   ```bash
   docker compose up -d mongodb redis rabbitmq
   ```

3. **Generate Prisma client:**
   ```bash
   bun prisma generate
   ```

4. **Push schema to database:**
   ```bash
   bun prisma db push
   ```

5. **Seed the database:**
   ```bash
   bun prisma db seed
   ```

6. **Start development server:**
   ```bash
   bun dev
   ```

### Docker Deployment

```bash
docker compose up -d
```

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | User login |
| POST | `/api/v1/auth/register` | User registration |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/auth/me` | Current user info |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/products` | List products |
| GET | `/api/v1/products/:id` | Get product |
| POST | `/api/v1/products` | Create product |
| PUT | `/api/v1/products/:id` | Update product |
| DELETE | `/api/v1/products/:id` | Delete product |
| GET | `/api/v1/products/lookup/:code` | Lookup by barcode/SKU |

### Sales
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/sales` | List sales |
| GET | `/api/v1/sales/:id` | Get sale details |
| POST | `/api/v1/sales` | Create sale |
| POST | `/api/v1/sales/:id/void` | Void sale |
| GET | `/api/v1/sales/summary/daily` | Daily summary |

### Inventory
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/inventory` | Get inventory status |
| GET | `/api/v1/inventory/movements` | List movements |
| POST | `/api/v1/inventory/adjust` | Adjust stock |
| POST | `/api/v1/inventory/transfer` | Transfer between branches |
| GET | `/api/v1/inventory/alerts` | Low stock alerts |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/reports/sales` | Sales report |
| GET | `/api/v1/reports/products/top` | Top products |
| GET | `/api/v1/reports/inventory` | Inventory report |
| GET | `/api/v1/reports/staff` | Staff performance |

## 🔐 Authentication

All API endpoints (except login/register) require JWT authentication:

```bash
curl -H "Authorization: Bearer <access_token>" http://localhost:5000/api/v1/products
```

## 📦 Default Credentials

After seeding the database:

- **Email:** admin@kpos.local
- **Password:** admin123

## 🛠️ Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start development server |
| `bun start` | Start production server |
| `bun build` | Build for production |
| `bun test` | Run tests |
| `bun prisma generate` | Generate Prisma client |
| `bun prisma db push` | Push schema to database |
| `bun prisma db seed` | Seed database |
| `bun prisma studio` | Open Prisma Studio |

## 🔧 Environment Variables

See `.env.example` for all available configuration options.

## 📄 License

MIT
