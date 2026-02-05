# KPOS - Enterprise Point of Sale System

ระบบ Point of Sale (POS) ระดับองค์กร สร้างด้วย **Bun + Express + Prisma** สำหรับ Backend และ **SvelteKit + Svelte 5** สำหรับ Frontend พร้อมรองรับการ Deploy ด้วย Docker

## 🏗️ Architecture

```
POS/
├── APIS/                    # Backend API (Bun + Express + Prisma)
├── kpos/                    # Frontend (SvelteKit + Svelte 5)
├── docker-compose.yml       # Docker orchestration
├── docker-compose.dev.yml   # Development overrides
├── .env                     # Environment variables
└── nginx/                   # Nginx reverse proxy config
```

## 🚀 Quick Start

### Prerequisites

- [Docker](https://www.docker.com/) & Docker Compose
- [Bun](https://bun.sh/) (optional for local development)
- [Node.js](https://nodejs.org/) 20+ (optional for local development)

### 🐳 Start with Docker (Recommended)

```bash
# Clone and navigate to project
cd POS

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

Services will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **API via Nginx**: http://localhost/api
- **RabbitMQ Management**: http://localhost:15672

### 🔧 Local Development

#### Backend

```bash
cd APIS

# Install dependencies
bun install

# Generate Prisma client
bun run db:generate

# Push database schema
bun run db:push

# Seed database
bun run db:seed

# Start development server
bun run dev
```

#### Frontend

```bash
cd kpos

# Install dependencies
bun install

# Start development server
bun run dev
```

## 📦 Tech Stack

### Backend (APIS/)

| Technology | Version | Purpose |
|------------|---------|---------|
| Bun | Latest | Runtime |
| Express.js | 4.18.x | Web Framework |
| Prisma | 5.9.x | ORM |
| MongoDB | 7.x | Database |
| Redis | 7.x | Caching & Sessions |
| Socket.IO | 4.7.x | Real-time Communication |
| Zod | 3.22.x | Validation |
| JWT | - | Authentication |

### Frontend (kpos/)

| Technology | Version | Purpose |
|------------|---------|---------|
| SvelteKit | 2.x | Meta Framework |
| Svelte | 5.x | UI Framework (Runes) |
| Tailwind CSS | 4.x | Styling |
| TanStack Query | 5.x | Server State |
| Ky | Latest | HTTP Client |
| Socket.IO Client | 4.7.x | Real-time |
| Chart.js | 4.x | Charts & Graphs |
| Lucide | Latest | Icons |

## 🗂️ Project Structure

### Backend Architecture (DDD + Clean Architecture)

```
APIS/src/
├── config/                  # Configuration files
│   ├── app.config.ts       # Main app configuration
│   ├── database.config.ts  # Database configuration
│   └── redis.config.ts     # Redis configuration
├── shared/                  # Shared across modules
│   ├── domain/             # Domain building blocks
│   │   ├── Entity.ts
│   │   ├── AggregateRoot.ts
│   │   ├── ValueObject.ts
│   │   └── Result.ts
│   └── application/        # Application layer base
│       ├── BaseUseCase.ts
│       └── BaseController.ts
├── infrastructure/          # Infrastructure layer
│   └── http/
│       ├── server.ts       # Express server setup
│       ├── middleware/     # Express middleware
│       ├── routes/         # Route definitions
│       └── socket/         # Socket.IO handlers
├── modules/                 # Feature modules
│   ├── auth/               # Authentication module
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── presentation/
│   ├── users/
│   ├── products/
│   ├── categories/
│   ├── inventory/
│   ├── sales/
│   ├── customers/
│   ├── branches/
│   ├── reports/
│   └── settings/
└── index.ts                # Application entry point
```

### Frontend Structure

```
kpos/src/
├── lib/
│   ├── api/                # API client (Ky)
│   ├── stores/             # Svelte 5 Runes stores
│   │   ├── auth.svelte.ts
│   │   └── cart.svelte.ts
│   ├── utils/              # Utility functions
│   ├── types/              # TypeScript types
│   └── components/         # Reusable components
├── routes/
│   ├── +layout.svelte      # Root layout
│   ├── +page.svelte        # Home page
│   ├── login/              # Login page
│   └── (app)/              # Authenticated routes
│       ├── +layout.svelte  # App layout with sidebar
│       ├── pos/            # Main POS screen
│       ├── products/       # Product management
│       ├── categories/     # Category management
│       ├── inventory/      # Inventory management
│       ├── customers/      # Customer management
│       ├── branches/       # Branch management
│       ├── reports/        # Reports & analytics
│       └── settings/       # System settings
├── app.css                 # Global styles (Tailwind v4)
├── app.html                # HTML template
└── app.d.ts                # Type declarations
```

## 🔐 API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | User login |
| POST | `/api/v1/auth/register` | User registration |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | User logout |
| GET | `/api/v1/auth/me` | Get current user |

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/products` | List products |
| GET | `/api/v1/products/:id` | Get product |
| POST | `/api/v1/products` | Create product |
| PUT | `/api/v1/products/:id` | Update product |
| DELETE | `/api/v1/products/:id` | Delete product |

### Sales

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/sales` | List sales |
| GET | `/api/v1/sales/:id` | Get sale |
| POST | `/api/v1/sales` | Create sale |
| POST | `/api/v1/sales/:id/void` | Void sale |

### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/reports/summary` | Get summary stats |
| GET | `/api/v1/reports/sales` | Sales report |
| GET | `/api/v1/reports/top-products` | Top selling products |

## 🔑 Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@kpos.com | password123 |
| Cashier | cashier@kpos.com | password123 |

## 📝 Environment Variables

### Backend (.env)

```env
# Database
DATABASE_URL=mongodb://mongodb:27017/kpos

# Redis
REDIS_URL=redis://redis:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key

# Server
PORT=5000
NODE_ENV=development
```

### Frontend

```env
PUBLIC_API_URL=http://localhost:5000/api/v1
PUBLIC_WS_URL=ws://localhost:5000
```

## 🛡️ Features

### Core POS Features
- ✅ Product catalog with categories
- ✅ Quick product search (name, SKU, barcode)
- ✅ Shopping cart management
- ✅ Multiple payment methods (Cash, Card, QR)
- ✅ Customer management & loyalty
- ✅ Discount & promotions
- ✅ Receipt printing
- ✅ Multi-branch support

### Inventory Management
- ✅ Real-time stock tracking
- ✅ Low stock alerts
- ✅ Stock adjustments with reasons
- ✅ Inventory valuation

### Reports & Analytics
- ✅ Sales summary dashboard
- ✅ Top selling products
- ✅ Revenue analytics
- ✅ Export to Excel/PDF

### Security
- ✅ JWT authentication
- ✅ Role-based access control (RBAC)
- ✅ Permission-based authorization
- ✅ Audit logging
- ✅ Rate limiting

## 🧪 Testing

```bash
# Backend tests
cd APIS
bun test

# Frontend tests
cd kpos
bun run test
```

## 📦 Building for Production

```bash
# Build all services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

Made with ❤️ by Kailo
