# 🏪 KPOS - Enterprise Point of Sale System API
## Production-Ready API with Domain-Driven Design (DDD) & Clean Architecture

> **Reference System:** POSPOS (https://go.pospos.co) - Thailand's Leading POS Solution
> **Architecture:** Modular Monolith ready for Microservices migration

═══════════════════════════════════════════════════════════════════════════════
## 📋 TABLE OF CONTENTS
═══════════════════════════════════════════════════════════════════════════════

1. [Technical Stack](#technical-stack)
2. [Architecture Principles](#architecture-principles)
3. [Project Structure](#project-structure)
4. [Domain Modules](#domain-modules)
5. [API Endpoints](#api-endpoints)
6. [Database Schema](#database-schema)
7. [Real-time Features](#real-time-features)
8. [Integration Points](#integration-points)
9. [Development Guidelines](#development-guidelines)
10. [Constraints & Non-Functional Requirements](#constraints--non-functional-requirements)
11. [Testing & Quality Assurance](#testing--quality-assurance)
12. [Deployment & DevOps](#deployment--devops)

═══════════════════════════════════════════════════════════════════════════════
## 🛠️ TECHNICAL STACK
═══════════════════════════════════════════════════════════════════════════════

### Runtime & Language
```
├── Bun (v1.x - latest stable)          # Ultra-fast JavaScript runtime
├── TypeScript 5.x                       # Strict mode enabled
├── Node.js compatibility layer          # For npm package compatibility
└── ESM Modules                          # Modern module system
```

### Core Framework & Libraries
```
├── Express.js 4.x                       # Web framework with middleware
├── Prisma ORM                           # Type-safe MongoDB ORM
├── MongoDB 7.x                          # Primary database (replica set)
├── Redis 7.x                            # Caching, sessions, rate limiting, pub/sub
├── RabbitMQ 3.x                         # Message queue for async operations
├── Socket.io 4.x                        # Real-time bidirectional communication
├── Bull/BullMQ                          # Job queue for background tasks
├── Zod                                  # Runtime schema validation
├── Winston + Pino                       # Structured logging
└── OpenAPI/Swagger                      # API documentation
```

### Security & Authentication
```
├── JWT (Access + Refresh tokens)        # Stateless authentication
├── RBAC (Role-Based Access Control)     # Permission management
├── bcrypt/argon2                        # Password hashing
├── Helmet.js                            # HTTP security headers
├── CORS                                 # Cross-origin configuration
├── Rate Limiting                        # API abuse prevention
└── Input Sanitization                   # XSS/Injection prevention
```

### Testing & Quality
```
├── Vitest                               # Unit & integration testing
├── Supertest                            # API testing
├── ESLint + Prettier                    # Code linting & formatting
├── Husky + lint-staged                  # Git hooks
└── SonarQube                            # Code quality analysis
```

═══════════════════════════════════════════════════════════════════════════════
## 🏛️ ARCHITECTURE PRINCIPLES
═══════════════════════════════════════════════════════════════════════════════

### Design Patterns & Principles
```
├── Domain-Driven Design (DDD)
│   ├── Bounded Contexts
│   ├── Aggregates & Entities
│   ├── Value Objects
│   ├── Domain Events
│   └── Domain Services
│
├── Clean Architecture (Hexagonal/Ports & Adapters)
│   ├── Domain Layer (Core Business Logic)
│   ├── Application Layer (Use Cases)
│   ├── Infrastructure Layer (External Services)
│   └── Presentation Layer (Controllers/API)
│
├── CQRS (Command Query Responsibility Segregation)
│   ├── Command Handlers (Write operations)
│   ├── Query Handlers (Read operations)
│   └── Event Sourcing (optional)
│
├── Event-Driven Architecture
│   ├── Domain Events
│   ├── Integration Events
│   └── Event Handlers
│
└── Design Patterns
    ├── Repository Pattern
    ├── Unit of Work Pattern
    ├── Factory Pattern
    ├── Strategy Pattern
    ├── Observer Pattern
    ├── Specification Pattern
    └── Decorator Pattern
```

### Code Quality Standards
```
├── SOLID Principles
│   ├── Single Responsibility
│   ├── Open/Closed
│   ├── Liskov Substitution
│   ├── Interface Segregation
│   └── Dependency Inversion
│
├── Object-Oriented Programming (OOP)
├── Design by Contract
├── Dependency Injection (IoC Container)
├── Interface-based Design
└── Immutable Domain Objects
```

═══════════════════════════════════════════════════════════════════════════════
## 📁 PROJECT STRUCTURE (DDD + CLEAN ARCHITECTURE)
═══════════════════════════════════════════════════════════════════════════════

```
src/
├── @types/                              # Global TypeScript declarations
├── config/                              # Configuration management
│   ├── database.config.ts
│   ├── redis.config.ts
│   ├── rabbitmq.config.ts
│   └── app.config.ts
│
├── shared/                              # Shared kernel
│   ├── domain/
│   │   ├── Entity.ts
│   │   ├── AggregateRoot.ts
│   │   ├── ValueObject.ts
│   │   ├── DomainEvent.ts
│   │   └── Result.ts
│   ├── infrastructure/
│   │   ├── persistence/
│   │   ├── messaging/
│   │   └── logging/
│   └── application/
│       ├── BaseUseCase.ts
│       └── BaseController.ts
│
├── modules/                             # Bounded Contexts
│   ├── auth/                            # Authentication Module
│   ├── sales/                           # Sales & POS Module
│   ├── inventory/                       # Inventory Module
│   ├── crm/                             # Customer Relationship Module
│   ├── restaurant/                      # Restaurant Module
│   ├── reporting/                       # Reports & Analytics Module
│   ├── settings/                        # System Settings Module
│   ├── branch/                          # Multi-Branch Module
│   ├── staff/                           # Staff Management Module
│   ├── promotion/                       # Promotions & Discounts Module
│   ├── payment/                         # Payment Processing Module
│   ├── document/                        # Document Management Module
│   ├── notification/                    # Notification Module
│   └── integration/                     # External Integrations Module
│
├── infrastructure/
│   ├── http/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── server.ts
│   ├── database/
│   │   ├── prisma/
│   │   └── repositories/
│   ├── cache/
│   ├── queue/
│   └── external/
│
└── main.ts                              # Application entry point
```

### Module Structure Template
```
modules/{module-name}/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── events/
│   ├── repositories/                    # Repository interfaces
│   └── services/                        # Domain services
├── application/
│   ├── commands/
│   ├── queries/
│   ├── handlers/
│   ├── dtos/
│   └── mappers/
├── infrastructure/
│   ├── persistence/                     # Repository implementations
│   ├── services/
│   └── adapters/
└── presentation/
    ├── controllers/
    ├── routes/
    └── validators/
```

═══════════════════════════════════════════════════════════════════════════════
## 📦 DOMAIN MODULES & FEATURES
═══════════════════════════════════════════════════════════════════════════════

### 0️⃣ DASHBOARD MODULE
```
Features:
├── Real-time sales overview
├── Daily/Weekly/Monthly statistics
├── Top selling products
├── Revenue charts & graphs
├── Low stock alerts
├── Pending orders count
├── Staff performance summary
└── Branch comparison (multi-branch)
```

### 1️⃣ SALES MODULE (Shop/POS)
```
Features:
├── Point of Sale Operations
│   ├── Quick sale
│   ├── Barcode scanning
│   ├── Product search
│   ├── Price modification
│   ├── Quantity adjustment
│   ├── Discount application
│   ├── VAT/Non-VAT items
│   ├── Hold/Park sale
│   ├── Recall held sale
│   └── Split payment
│
├── Credit Sales (Sell on Credit)
│   ├── Customer credit management
│   ├── Credit limit settings
│   ├── Installment payments
│   ├── Credit balance tracking
│   └── Payment reminders
│
├── E-Commerce Integration
│   ├── Shopee integration
│   ├── Lazada integration
│   ├── Online order sync
│   └── Inventory sync
│
├── Order Types
│   ├── Walk-in
│   ├── Take-away
│   ├── Delivery
│   ├── Pre-order
│   └── Reservation
│
└── Settings
    ├── Display Settings
    │   ├── Product display mode (Grid/List)
    │   ├── Font size
    │   ├── Theme colors
    │   └── Language
    ├── Purchase Settings
    ├── Contact Settings
    ├── Payment Methods
    │   ├── Cash
    │   ├── Credit/Debit Card
    │   ├── QR Code/PromptPay
    │   ├── Bank Transfer
    │   ├── E-Wallet
    │   └── Custom payment methods
    ├── Cost Settings
    ├── Shift Management
    ├── Tax Settings (VAT/e-Tax)
    ├── CRM Settings
    ├── e-Menu Settings
    ├── Queue Number Settings
    ├── Daily Report Settings
    ├── Customer Display Settings
    ├── Barcode/QR Settings
    ├── Shipping Label Settings
    ├── Receipt Customization
    ├── Document Templates
    ├── Notification Settings
    ├── Developer API Settings
    ├── Currency Settings
    ├── Exchange Rate Settings
    ├── E-Commerce Settings
    ├── Branch Connection Settings
    └── Advanced Settings
```

### 2️⃣ INVENTORY MODULE (Products & Stock)
```
Features:
├── Product Management
│   ├── Create/Edit/Delete products
│   ├── Product categories
│   ├── Product images
│   ├── Multiple units (piece, box, carton)
│   ├── Related products
│   ├── Product bundles/sets
│   └── Decimal quantity support
│
├── Stock Management
│   ├── Stock in/out
│   ├── Stock adjustment
│   ├── Stock count/audit
│   ├── Low stock alerts
│   ├── Stock history
│   └── Multi-location stock
│
├── Barcode Management
│   ├── Generate barcodes
│   ├── Print barcode labels
│   ├── Barcode import
│   └── Custom barcode formats
│
├── Topping/BOM (Bill of Materials)
│   ├── Ingredient management
│   ├── Recipe/BOM setup
│   ├── Auto stock deduction
│   └── Cost calculation
│
├── Purchase/Import Stock
│   ├── Purchase orders
│   ├── Goods receiving
│   ├── Supplier management
│   ├── Purchase history
│   └── Excel import
│
├── Stock Requisition
│   ├── Request stock
│   ├── Approve/Reject requests
│   ├── Return requisition
│   └── Transfer between branches
│
├── Creditor/PO Management
│   ├── Create purchase orders
│   ├── Approve PO
│   ├── Track PO status
│   └── Creditor payments
│
├── Transfer Orders
│   ├── Branch to branch transfer
│   ├── Transfer history
│   └── Transfer approval
│
├── Pricing
│   ├── Price levels (Retail/Wholesale)
│   ├── Member pricing
│   ├── Wholesale pricing
│   ├── Time-based pricing
│   └── Bulk pricing
│
├── SKU Management
│   ├── SKU variants (Size, Color)
│   ├── SKU attributes
│   └── SKU stock tracking
│
└── Expiration Date Management
    ├── Expiry tracking
    ├── Expiry alerts
    ├── FIFO/LIFO management
    └── Expiry reports
```

### 3️⃣ PROMOTION MODULE
```
Features:
├── Promotions
│   ├── Buy X Get Y Free
│   ├── Bundle discounts
│   ├── Time-based promotions
│   ├── Category promotions
│   ├── Member-only promotions
│   └── Promotion scheduling
│
└── Discounts
    ├── Percentage discount
    ├── Fixed amount discount
    ├── Item-level discount
    ├── Bill-level discount
    ├── Coupon codes
    └── Loyalty point redemption
```

### 4️⃣ CRM MODULE (Customer Relationship)
```
Features:
├── Member Management
│   ├── Member registration
│   ├── Member profiles
│   ├── Membership tiers
│   ├── Member cards
│   ├── Purchase history
│   └── Excel import/export
│
├── Point System
│   ├── Point earning rules
│   ├── Point redemption
│   ├── Point expiry
│   ├── Point history
│   └── Point transfer
│
├── Point Settings
│   ├── Earning rate configuration
│   ├── Redemption rules
│   ├── Tier benefits
│   └── Special event multipliers
│
└── Customer Engagement
    ├── Birthday rewards
    ├── Anniversary rewards
    ├── Push notifications
    └── SMS/Email marketing
```

### 5️⃣ MANAGEMENT MODULE
```
Features:
├── Branch Management
│   ├── Create/Edit branches
│   ├── Branch settings
│   ├── Branch comparison
│   └── Central management
│
├── Staff Management
│   ├── Staff profiles
│   ├── Roles & permissions
│   ├── Work schedules
│   ├── Shift management
│   ├── Clock in/out
│   ├── Commission settings
│   └── Performance tracking
│
├── Vendor/Supplier Management
│   ├── Vendor profiles
│   ├── Contact information
│   ├── Purchase history
│   └── Vendor ratings
│
├── Cash Register Management
│   ├── Register assignment
│   ├── Opening/Closing balance
│   ├── Cash float
│   ├── Cash drawer operations
│   └── Register reports
│
├── Activity Log
│   ├── User actions tracking
│   ├── System events
│   ├── Audit trail
│   └── Security logs
│
├── Table Monitor (Restaurant)
│   ├── Table status
│   ├── Order tracking
│   ├── Time elapsed
│   └── Merge/Split tables
│
└── Logged-in Devices
    ├── Active sessions
    ├── Device management
    ├── Remote logout
    └── Session history
```

### 6️⃣ RESTAURANT MODULE
```
Features:
├── Table Management
│   ├── Table layout
│   ├── Table status
│   ├── Table merge/split
│   └── Reservation
│
├── Order Management
│   ├── Dine-in orders
│   ├── Take-away orders
│   ├── Delivery orders
│   ├── Order modifications
│   └── Order status tracking
│
├── Kitchen Display System (KDS)
│   ├── Order queue
│   ├── Preparation status
│   ├── Ready notification
│   └── Kitchen printer integration
│
├── e-Menu
│   ├── Digital menu
│   ├── QR code ordering
│   ├── Customer self-ordering
│   └── Menu customization
│
└── Topping/Modifiers
    ├── Add-ons management
    ├── Modifier groups
    └── Pricing adjustments
```

### 7️⃣ REPORTING MODULE
```
Features:
├── Dashboard Reports
│   ├── Sales overview
│   ├── Revenue charts
│   ├── Growth indicators
│   └── KPI widgets
│
├── Sales Reports
│   ├── Daily sales summary
│   ├── Monthly sales report
│   ├── Yearly comparison
│   ├── Sales by product
│   ├── Sales by category
│   ├── Sales by staff
│   ├── Sales by payment method
│   ├── Sales by time period
│   └── Sales by branch
│
├── Financial Reports
│   ├── Expense tracking
│   ├── Currency exchange
│   ├── Payment reports
│   ├── Cash flow
│   └── Profit & Loss
│
├── Product Reports
│   ├── Product performance
│   ├── Stock movement
│   ├── Best sellers
│   ├── Slow moving items
│   └── Category analysis
│
├── Inventory Reports
│   ├── Stock levels
│   ├── Stock valuation
│   ├── Expiry reports
│   ├── Barcode reports
│   ├── Topping/BOM usage
│   ├── Import/Purchase history
│   ├── Stock requisition
│   ├── Creditor reports
│   ├── Transfer orders
│   ├── Price level reports
│   └── SKU reports
│
├── Staff Reports
│   ├── Sales by staff
│   ├── Staff commission
│   ├── Attendance
│   └── Performance metrics
│
├── Customer Reports
│   ├── Customer analysis
│   ├── Loyalty program
│   ├── Purchase patterns
│   └── Customer lifetime value
│
├── Document Reports
│   ├── Receipt history
│   ├── Invoice reports
│   ├── Tax reports
│   ├── e-Tax reports
│   └── Delivery reports
│
├── Cash Register Reports
│   ├── Register summary
│   ├── Cash drawer logs
│   ├── Shift reports
│   └── Discrepancy reports
│
└── Export Options
    ├── PDF export
    ├── Excel export
    ├── Email scheduling
    └── API access
```

### 8️⃣ DOCUMENT MODULE
```
Features:
├── Document Types
│   ├── Receipt
│   ├── Invoice
│   ├── Tax Invoice
│   ├── e-Tax Invoice
│   ├── Quotation
│   ├── Purchase Order
│   ├── Delivery Note
│   ├── Credit Note
│   └── Debit Note
│
├── Document Settings
│   ├── Template customization
│   ├── Number sequencing
│   ├── Header/Footer
│   └── Logo placement
│
└── Document Operations
    ├── Print
    ├── Email
    ├── Download
    └── Share
```

### 9️⃣ PAYMENT MODULE
```
Features:
├── Payment Methods
│   ├── Cash
│   ├── Credit/Debit Card
│   ├── QR Code Payment
│   ├── PromptPay
│   ├── Bank Transfer
│   ├── E-Wallet (TrueMoney, LINE Pay, etc.)
│   ├── Split payment
│   └── Foreign currency
│
├── EDC Integration
│   ├── Card terminal connection
│   ├── Transaction processing
│   └── Settlement
│
└── Payment Gateway
    ├── Online payment
    ├── Refund processing
    └── Transaction history
```

### 🔟 HELP & SUPPORT MODULE
```
Features:
├── Contact Us
├── Payment Confirmation
├── Package/Subscription
├── Partner Program
├── FAQ
├── Video Tutorials
└── API Documentation
```

═══════════════════════════════════════════════════════════════════════════════
## 🔌 API ENDPOINTS SPECIFICATION
═══════════════════════════════════════════════════════════════════════════════

### Base URL: `/api/v1`

### 🔐 Authentication Endpoints
```
POST   /auth/register                    # Register new user
POST   /auth/login                       # User login
POST   /auth/logout                      # User logout
POST   /auth/refresh-token               # Refresh access token
POST   /auth/forgot-password             # Request password reset
POST   /auth/reset-password              # Reset password
POST   /auth/change-password             # Change password
GET    /auth/me                          # Get current user profile
PUT    /auth/me                          # Update current user profile
POST   /auth/verify-email                # Verify email address
POST   /auth/2fa/enable                  # Enable 2FA
POST   /auth/2fa/verify                  # Verify 2FA code
DELETE /auth/2fa/disable                 # Disable 2FA
```

### 📊 Dashboard Endpoints
```
GET    /dashboard/overview               # Dashboard overview
GET    /dashboard/sales-summary          # Sales summary widgets
GET    /dashboard/charts                 # Chart data
GET    /dashboard/alerts                 # System alerts
GET    /dashboard/recent-transactions    # Recent transactions
GET    /dashboard/top-products           # Top selling products
GET    /dashboard/staff-performance      # Staff performance
```

### 🏪 Sales/POS Endpoints
```
# Sales Operations
POST   /sales/transactions               # Create new sale
GET    /sales/transactions               # List transactions
GET    /sales/transactions/:id           # Get transaction details
PUT    /sales/transactions/:id           # Update transaction
DELETE /sales/transactions/:id           # Cancel/void transaction
POST   /sales/transactions/:id/refund    # Process refund

# Hold/Park Sales
POST   /sales/hold                       # Hold current sale
GET    /sales/hold                       # List held sales
GET    /sales/hold/:id                   # Get held sale
DELETE /sales/hold/:id                   # Remove held sale
POST   /sales/hold/:id/recall            # Recall held sale

# Quick Sale
POST   /sales/quick-sale                 # Quick sale without customer

# Credit Sales
POST   /sales/credit                     # Credit sale
GET    /sales/credit                     # List credit sales
PUT    /sales/credit/:id/payment         # Record payment

# Shift Management
POST   /sales/shifts/open                # Open shift
POST   /sales/shifts/close               # Close shift
GET    /sales/shifts/current             # Get current shift
GET    /sales/shifts/:id                 # Get shift details

# Cash Drawer
POST   /sales/cash-drawer/open           # Open cash drawer
POST   /sales/cash-drawer/float          # Add float
POST   /sales/cash-drawer/pickup         # Cash pickup
GET    /sales/cash-drawer/balance        # Get balance
```

### 📦 Inventory/Product Endpoints
```
# Products
POST   /products                         # Create product
GET    /products                         # List products
GET    /products/:id                     # Get product
PUT    /products/:id                     # Update product
DELETE /products/:id                     # Delete product
POST   /products/bulk                    # Bulk create products
PUT    /products/bulk                    # Bulk update products
POST   /products/import                  # Import from Excel
GET    /products/export                  # Export to Excel

# Categories
POST   /products/categories              # Create category
GET    /products/categories              # List categories
PUT    /products/categories/:id          # Update category
DELETE /products/categories/:id          # Delete category

# Stock Management
GET    /stock                            # List stock
POST   /stock/adjust                     # Adjust stock
POST   /stock/in                         # Stock in
POST   /stock/out                        # Stock out
GET    /stock/history                    # Stock history
POST   /stock/count                      # Stock count/audit
GET    /stock/alerts                     # Low stock alerts

# Barcodes
POST   /barcodes/generate                # Generate barcode
POST   /barcodes/print                   # Print barcode labels
POST   /barcodes/import                  # Import barcodes
GET    /barcodes/search/:code            # Search by barcode

# Topping/BOM
POST   /toppings                         # Create topping
GET    /toppings                         # List toppings
PUT    /toppings/:id                     # Update topping
DELETE /toppings/:id                     # Delete topping
POST   /bom                              # Create BOM
GET    /bom/:productId                   # Get product BOM

# Purchase Orders
POST   /purchase-orders                  # Create PO
GET    /purchase-orders                  # List POs
GET    /purchase-orders/:id              # Get PO details
PUT    /purchase-orders/:id              # Update PO
POST   /purchase-orders/:id/receive      # Receive goods
POST   /purchase-orders/:id/approve      # Approve PO
POST   /purchase-orders/:id/cancel       # Cancel PO

# Stock Transfers
POST   /stock/transfers                  # Create transfer
GET    /stock/transfers                  # List transfers
PUT    /stock/transfers/:id              # Update transfer
POST   /stock/transfers/:id/approve      # Approve transfer
POST   /stock/transfers/:id/complete     # Complete transfer

# Price Levels
POST   /price-levels                     # Create price level
GET    /price-levels                     # List price levels
PUT    /price-levels/:id                 # Update price level
DELETE /price-levels/:id                 # Delete price level

# SKU Management
POST   /skus                             # Create SKU
GET    /skus                             # List SKUs
PUT    /skus/:id                         # Update SKU
DELETE /skus/:id                         # Delete SKU
GET    /skus/:productId/variants         # Get product variants

# Expiration Management
GET    /products/expiring                # List expiring products
POST   /products/:id/expiry              # Set expiry date
GET    /products/expired                 # List expired products
```

### 🎁 Promotion Endpoints
```
# Promotions
POST   /promotions                       # Create promotion
GET    /promotions                       # List promotions
GET    /promotions/:id                   # Get promotion
PUT    /promotions/:id                   # Update promotion
DELETE /promotions/:id                   # Delete promotion
POST   /promotions/:id/activate          # Activate promotion
POST   /promotions/:id/deactivate        # Deactivate promotion

# Discounts
POST   /discounts                        # Create discount
GET    /discounts                        # List discounts
PUT    /discounts/:id                    # Update discount
DELETE /discounts/:id                    # Delete discount

# Coupons
POST   /coupons                          # Create coupon
GET    /coupons                          # List coupons
POST   /coupons/validate                 # Validate coupon code
POST   /coupons/redeem                   # Redeem coupon
```

### 👥 CRM Endpoints
```
# Members
POST   /members                          # Create member
GET    /members                          # List members
GET    /members/:id                      # Get member
PUT    /members/:id                      # Update member
DELETE /members/:id                      # Delete member
GET    /members/:id/transactions         # Member purchase history
POST   /members/import                   # Import members
GET    /members/export                   # Export members

# Membership Tiers
POST   /membership-tiers                 # Create tier
GET    /membership-tiers                 # List tiers
PUT    /membership-tiers/:id             # Update tier
DELETE /membership-tiers/:id             # Delete tier

# Points
GET    /members/:id/points               # Get member points
POST   /members/:id/points/earn          # Earn points
POST   /members/:id/points/redeem        # Redeem points
GET    /members/:id/points/history       # Points history

# Point Settings
GET    /point-settings                   # Get point settings
PUT    /point-settings                   # Update point settings
```

### 🏢 Management Endpoints
```
# Branches
POST   /branches                         # Create branch
GET    /branches                         # List branches
GET    /branches/:id                     # Get branch
PUT    /branches/:id                     # Update branch
DELETE /branches/:id                     # Delete branch
GET    /branches/:id/stats               # Branch statistics

# Staff
POST   /staff                            # Create staff
GET    /staff                            # List staff
GET    /staff/:id                        # Get staff
PUT    /staff/:id                        # Update staff
DELETE /staff/:id                        # Delete staff
POST   /staff/:id/clock-in               # Clock in
POST   /staff/:id/clock-out              # Clock out
GET    /staff/:id/schedule               # Get schedule
PUT    /staff/:id/schedule               # Update schedule
GET    /staff/:id/performance            # Get performance

# Roles & Permissions
POST   /roles                            # Create role
GET    /roles                            # List roles
PUT    /roles/:id                        # Update role
DELETE /roles/:id                        # Delete role
GET    /permissions                      # List permissions
PUT    /roles/:id/permissions            # Update role permissions

# Vendors
POST   /vendors                          # Create vendor
GET    /vendors                          # List vendors
GET    /vendors/:id                      # Get vendor
PUT    /vendors/:id                      # Update vendor
DELETE /vendors/:id                      # Delete vendor

# Cash Registers
POST   /cash-registers                   # Create register
GET    /cash-registers                   # List registers
PUT    /cash-registers/:id               # Update register
DELETE /cash-registers/:id               # Delete register
GET    /cash-registers/:id/status        # Get register status

# Activity Logs
GET    /activity-logs                    # List activity logs
GET    /activity-logs/:id                # Get log details

# Devices
GET    /devices                          # List logged-in devices
DELETE /devices/:id                      # Logout device
```

### 🍽️ Restaurant Endpoints
```
# Tables
POST   /tables                           # Create table
GET    /tables                           # List tables
PUT    /tables/:id                       # Update table
DELETE /tables/:id                       # Delete table
GET    /tables/:id/status                # Get table status
POST   /tables/:id/open                  # Open table
POST   /tables/:id/close                 # Close table
POST   /tables/merge                     # Merge tables
POST   /tables/split                     # Split table
PUT    /tables/:id                       # move table
# Orders
POST   /orders                           # Create order
GET    /orders                           # List orders
GET    /orders/:id                       # Get order
PUT    /orders/:id                       # Update order
POST   /orders/:id/items                 # Add items
DELETE /orders/:id/items/:itemId         # Remove item
POST   /orders/:id/send-kitchen          # Send to kitchen
POST   /orders/:id/complete              # Complete order

# Kitchen Display
GET    /kitchen/orders                   # Get kitchen orders
PUT    /kitchen/orders/:id/status        # Update order status
POST   /kitchen/orders/:id/ready         # Mark as ready

# Reservations
POST   /reservations                     # Create reservation
GET    /reservations                     # List reservations
PUT    /reservations/:id                 # Update reservation
DELETE /reservations/:id                 # Cancel reservation
```

### 📈 Report Endpoints
```
# Sales Reports
GET    /reports/sales/daily              # Daily sales report
GET    /reports/sales/weekly             # Weekly sales report
GET    /reports/sales/monthly            # Monthly sales report
GET    /reports/sales/yearly             # Yearly sales report
GET    /reports/sales/by-product         # Sales by product
GET    /reports/sales/by-category        # Sales by category
GET    /reports/sales/by-staff           # Sales by staff
GET    /reports/sales/by-payment         # Sales by payment method
GET    /reports/sales/by-branch          # Sales by branch
GET    /reports/sales/comparison         # Period comparison

# Financial Reports
GET    /reports/financial/revenue        # Revenue report
GET    /reports/financial/expense        # Expense report
GET    /reports/financial/profit-loss    # P&L report
GET    /reports/financial/cash-flow      # Cash flow report

# Inventory Reports
GET    /reports/inventory/stock          # Stock report
GET    /reports/inventory/valuation      # Stock valuation
GET    /reports/inventory/movement       # Stock movement
GET    /reports/inventory/expiry         # Expiry report
GET    /reports/inventory/low-stock      # Low stock report

# Staff Reports
GET    /reports/staff/performance        # Staff performance
GET    /reports/staff/commission         # Commission report
GET    /reports/staff/attendance         # Attendance report

# Customer Reports
GET    /reports/customers/analysis       # Customer analysis
GET    /reports/customers/loyalty        # Loyalty report
GET    /reports/customers/top            # Top customers

# Export
POST   /reports/export/pdf               # Export as PDF
POST   /reports/export/excel             # Export as Excel
POST   /reports/schedule                 # Schedule report email
```

### 📄 Document Endpoints
```
POST   /documents                        # Create document
GET    /documents                        # List documents
GET    /documents/:id                    # Get document
PUT    /documents/:id                    # Update document
DELETE /documents/:id                    # Delete document
POST   /documents/:id/print              # Print document
POST   /documents/:id/email              # Email document
GET    /documents/:id/download           # Download document

# Document Templates
GET    /document-templates               # List templates
PUT    /document-templates/:type         # Update template
```

### 💳 Payment Endpoints
```
# Payment Methods
GET    /payment-methods                  # List payment methods
POST   /payment-methods                  # Add payment method
PUT    /payment-methods/:id              # Update payment method
DELETE /payment-methods/:id              # Remove payment method

# Transactions
POST   /payments                         # Process payment
GET    /payments/:id                     # Get payment details
POST   /payments/:id/refund              # Process refund

# QR Payment
POST   /payments/qr/generate             # Generate QR code
GET    /payments/qr/:id/status           # Check payment status
```

### ⚙️ Settings Endpoints
```
# General Settings
GET    /settings                         # Get all settings
PUT    /settings                         # Update settings
GET    /settings/:category               # Get category settings
PUT    /settings/:category               # Update category settings

# Display Settings
GET    /settings/display                 # Get display settings
PUT    /settings/display                 # Update display settings

# Tax Settings
GET    /settings/tax                     # Get tax settings
PUT    /settings/tax                     # Update tax settings

# Currency Settings
GET    /settings/currency                # Get currency settings
PUT    /settings/currency                # Update currency settings
GET    /settings/exchange-rates          # Get exchange rates
PUT    /settings/exchange-rates          # Update exchange rates
```

### 🔔 Notification Endpoints
```
GET    /notifications                    # List notifications
GET    /notifications/:id                # Get notification
PUT    /notifications/:id/read           # Mark as read
PUT    /notifications/read-all           # Mark all as read
DELETE /notifications/:id                # Delete notification

# Notification Settings
GET    /notifications/settings           # Get settings
PUT    /notifications/settings           # Update settings
```

### 🔗 Integration Endpoints
```
# E-Commerce
GET    /integrations/ecommerce           # List e-commerce integrations
POST   /integrations/ecommerce/connect   # Connect platform
DELETE /integrations/ecommerce/:id       # Disconnect platform
POST   /integrations/ecommerce/sync      # Sync data

# Hardware
GET    /integrations/hardware            # List hardware
POST   /integrations/hardware            # Add hardware
PUT    /integrations/hardware/:id        # Update hardware
DELETE /integrations/hardware/:id        # Remove hardware
POST   /integrations/hardware/:id/test   # Test connection
```

═══════════════════════════════════════════════════════════════════════════════
## 🔄 REAL-TIME FEATURES (WebSocket)
═══════════════════════════════════════════════════════════════════════════════

### Socket.io Events
```
# Sales Events
sales:new                                # New sale created
sales:updated                            # Sale updated
sales:voided                             # Sale voided
sales:refunded                           # Refund processed

# Inventory Events
stock:updated                            # Stock level changed
stock:low-alert                          # Low stock alert
stock:expired-alert                      # Product expiring

# Order Events (Restaurant)
order:new                                # New order
order:updated                            # Order updated
order:ready                              # Order ready
order:completed                          # Order completed
kitchen:order                            # Kitchen order received

# Table Events
table:opened                             # Table opened
table:closed                             # Table closed
table:updated                            # Table status changed

# Notification Events
notification:new                         # New notification
notification:alert                       # System alert

# Sync Events
sync:products                            # Products synced
sync:orders                              # Orders synced
```

═══════════════════════════════════════════════════════════════════════════════
## 🔗 EXTERNAL INTEGRATIONS
═══════════════════════════════════════════════════════════════════════════════

### E-Commerce Platforms
```
├── Shopee API
├── Lazada API
├── Custom E-Commerce
└── WooCommerce (optional)
```

### Payment Gateways
```
├── PromptPay QR
├── 2C2P
├── Omise
├── Stripe
└── PayPal
```

### Messaging & Notifications
```
├── LINE Notify
├── LINE OA
├── SMS Gateway
├── Email (SendGrid, Mailgun)
└── Push Notifications (socket.io)
```

### Hardware
```
├── Receipt Printers (Epson, Star, Custom)
├── Barcode Scanners
├── Cash Drawers
├── Digital Scales
├── Customer Displays
├── Kitchen Display Systems
└── EDC Terminals
```

### Tax & Compliance
```
├── e-Tax Invoice (Thailand Revenue Department)
├── Tax reports export
└── Audit compliance
```

═══════════════════════════════════════════════════════════════════════════════
## 🗄️ DATABASE SCHEMA OVERVIEW
═══════════════════════════════════════════════════════════════════════════════

### Core Collections (MongoDB)
```
├── users                                # User accounts
├── branches                             # Business branches
├── staff                                # Staff members
├── roles                                # Roles & permissions
├── products                             # Products catalog
├── categories                           # Product categories
├── inventory                            # Stock levels
├── transactions                         # Sales transactions
├── orders                               # Restaurant orders
├── tables                               # Restaurant tables
├── members                              # CRM members
├── promotions                           # Promotions
├── discounts                            # Discounts
├── vendors                              # Suppliers
├── purchase_orders                      # Purchase orders
├── stock_transfers                      # Stock transfers
├── documents                            # Generated documents
├── payments                             # Payment records
├── shifts                               # Work shifts
├── activity_logs                        # Audit logs
├── settings                             # System settings
└── notifications                        # Notifications
```

═══════════════════════════════════════════════════════════════════════════════
## 🚀 GETTING STARTED
═══════════════════════════════════════════════════════════════════════════════

### Prerequisites
```bash
# Required
- Bun >= 1.0.0
- MongoDB >= 7.0
- Redis >= 7.0
- RabbitMQ >= 3.12

# Optional
- Docker & Docker Compose
```

### Environment Variables
```env
# Application
NODE_ENV=development
PORT=5000
API_VERSION=v1

# Database
MONGODB_URI=mongodb://localhost:27017/db_pos
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# External Services
LINE_NOTIFY_TOKEN=xxx
SHOPEE_API_KEY=xxx
LAZADA_API_KEY=xxx
```

═══════════════════════════════════════════════════════════════════════════════
## 📝 DEVELOPMENT GUIDELINES
═══════════════════════════════════════════════════════════════════════════════

### Coding Standards
- Use TypeScript strict mode
- Follow ESLint + Prettier configuration
- Write unit tests for all business logic
- Document all public APIs with JSDoc
- Use conventional commits

### API Response Format
```typescript
// Success Response
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}

// Error Response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [ ... ]
  }
}
```

### Error Codes
```
AUTH_001 - Invalid credentials
AUTH_002 - Token expired
AUTH_003 - Insufficient permissions
VAL_001  - Validation error
RES_001  - Resource not found
BUS_001  - Business rule violation
SYS_001  - System error
```

═══════════════════════════════════════════════════════════════════════════════
## 📜 LICENSE & CREDITS
═══════════════════════════════════════════════════════════════════════════════

**KAILO POS** - Enterprise Point of Sale System
Reference: POSPOS (https://pospos.co) by CodeMobiles Co., Ltd.

---

═══════════════════════════════════════════════════════════════════════════════
## 🔒 CONSTRAINTS & NON-FUNCTIONAL REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

### 1. Performance Requirements
```
├── API Response Time
│   ├── P95 latency < 200ms for read endpoints (with Redis cache hit)
│   ├── P95 latency < 500ms for write endpoints
│   ├── POS sale submission < 1000ms end-to-end
│   └── Dashboard stats < 300ms (Redis cached, 30s TTL)
│
├── Caching Strategy (Redis)
│   ├── Auth data: kpos:auth:{userId} — 5min TTL
│   ├── Store access: kpos:stores:{userId} — 5min TTL
│   ├── Role rules: kpos:rules:{roleId} — 5min TTL
│   ├── Dashboard stats: queryCache 30s TTL
│   ├── Sales chart: queryCache 60s TTL
│   └── Top products: queryCache 60s TTL
│
├── Throughput
│   ├── Minimum 100 concurrent users per branch
│   ├── Minimum 500 transactions/hour per store
│   └── Supports up to 50 branches per deployment
│
└── Database
    ├── MongoDB replica set (minimum 3 nodes for production)
    ├── Indexes on: branchId, storeId, createdAt, userId, productId
    └── Pagination enforced on all list endpoints (default limit: 20)
```

### 2. Security Requirements
```
├── Authentication & Authorization
│   ├── JWT access tokens (15min TTL) + refresh tokens (7d TTL)
│   ├── argon2 password hashing (no MD5/SHA1/bcrypt)
│   ├── RBAC: role → rules → CRUD flags per module
│   ├── Multi-store scoping: branchFilter middleware on all data routes
│   └── Super-admin bypass: isSuperAdmin flag skips all filters
│
├── HTTP Security (Helmet.js)
│   ├── Content-Security-Policy
│   ├── X-Frame-Options: DENY
│   ├── X-Content-Type-Options: nosniff
│   ├── Strict-Transport-Security (HSTS)
│   └── Referrer-Policy
│
├── Rate Limiting
│   ├── Global: 1000 requests / 15min per IP
│   ├── Auth endpoints: 20 requests / 15min per IP
│   └── Health check: exempt from rate limiting
│
├── CORS
│   ├── Development: origin '*'
│   ├── Production: CORS_ORIGIN env var (comma-separated whitelist)
│   └── credentials: true
│
├── Input Validation
│   ├── Zod schema validation on all mutation endpoints
│   ├── validate()/validateBody()/validateQuery() middleware available
│   └── ZodError forwarded to global error handler → 400 VAL_001
│
└── Error Handling (Production Safety)
    ├── 5xx errors: message sanitized ("Internal server error") in production
    ├── Stack traces: only returned in NODE_ENV !== 'production'
    ├── unhandledRejection: logged, no crash in production
    └── uncaughtException: logged, process exits (let supervisor restart)
```

### 3. Availability & Reliability Requirements
```
├── Uptime Target: 99.5% (excluding planned maintenance)
│
├── Graceful Shutdown
│   ├── SIGINT/SIGTERM → drain in-flight requests
│   ├── Close HTTP server → disconnect RabbitMQ → disconnect DB → disconnect Redis
│   └── Max shutdown wait: 10 seconds
│
├── Health Check
│   ├── GET /health — no auth required
│   ├── Returns: { status: 'ok'|'degraded', services: { database } }
│   └── HTTP 200 = healthy, 503 = degraded (MongoDB disconnected)
│
├── Async Queue (RabbitMQ)
│   ├── Stock movements processed async (fire-and-forget from sale route)
│   ├── Activity logs written async (non-blocking)
│   ├── Cache invalidation fanout exchange (multi-instance safe)
│   └── Fallback: sync processing if RabbitMQ unavailable
│
└── Database Resilience
    ├── isPrismaConnectionError() detected → 503 response
    ├── DatabaseConnectionError caught in global error handler
    └── MongoDB connection retried on startup
```

### 4. Scalability Constraints
```
├── Horizontal Scaling
│   ├── Stateless API (JWT, no server-side sessions)
│   ├── Redis shared cache across instances
│   ├── RabbitMQ fanout for cross-instance cache invalidation
│   └── Socket.io: requires Redis adapter for multi-instance (future)
│
├── Multi-Tenant Architecture
│   ├── Data isolation via branchId / storeId on all collections
│   ├── UserStore junction table controls per-user store access
│   ├── branchFilter middleware enforces scope on every GET route
│   └── Super-admin sees all data (no filter applied)
│
└── Body Size Limits
    ├── JSON body: 10mb max
    └── URL-encoded: 10mb max
```

### 5. Maintainability Constraints
```
├── Code Standards
│   ├── TypeScript strict mode — tsc --noEmit must exit 0
│   ├── svelte-check must exit 0 on frontend
│   ├── No any casts except at Prisma boundary (typed as any for flexibility)
│   └── Conventional commits enforced
│
├── Module Structure
│   ├── DDD: domain / application / infrastructure / presentation layers
│   ├── Each module self-contained under src/modules/{name}/
│   └── Shared kernel in src/shared/ (Entity, AggregateRoot, Result)
│
├── API Contract
│   ├── All responses follow: { success: boolean, data?, error?, meta? }
│   ├── Error codes: AUTH_001, AUTH_003, VAL_001, RES_001, BUS_001, SYS_001, DB_001
│   └── Pagination meta: { page, limit, total, totalPages }
│
└── Observability
    ├── requestLogger middleware logs all incoming requests
    ├── Console error logging on all caught exceptions
    └── Activity logs queued via RabbitMQ for async persistence
```

### 6. Operational Constraints
```
├── Environment Variables (required for production)
│   ├── DATABASE_URL          — MongoDB connection string
│   ├── REDIS_URL             — Redis connection string
│   ├── RABBITMQ_URL          — RabbitMQ AMQP URL (optional, graceful fallback)
│   ├── JWT_SECRET            — Minimum 32 characters
│   ├── JWT_EXPIRES_IN        — e.g. 15m
│   ├── JWT_REFRESH_EXPIRES_IN — e.g. 7d
│   ├── CORS_ORIGIN           — Comma-separated allowed origins
│   └── NODE_ENV              — 'production' | 'development' | 'test'
│
├── Deployment
│   ├── Docker + docker-compose (recommended)
│   ├── Nginx reverse proxy for SSL termination
│   ├── MongoDB replica set (required for Prisma transactions)
│   └── Bun runtime v1.x (not Node.js)
│
└── Not Supported (out of scope v1.0)
    ├── Multi-currency real-time exchange rates (static config only)
    ├── 2FA (architecture supports it, not implemented)
    ├── E-commerce platform sync (Shopee/Lazada — endpoint stubs only)
    └── EDC terminal integration (stub endpoints only)
```

═══════════════════════════════════════════════════════════════════════════════
## 🧪 TESTING & QUALITY ASSURANCE
═══════════════════════════════════════════════════════════════════════════════

### 1. Testing Stack
```
├── Backend (APIS/)
│   ├── Vitest           — unit + integration test runner
│   ├── supertest        — HTTP integration tests (future)
│   └── vitest.config.ts — alias resolution mirrors tsconfig.json paths
│
└── Frontend (kpos/)
    ├── svelte-check     — TypeScript + Svelte type checking
    └── vitest           — unit tests (future)
```

### 2. Test File Locations
```
APIS/src/
├── shared/domain/
│   ├── Result.test.ts          # Result<T,E> ok/fail/combine
│   └── errors.test.ts          # DatabaseConnectionError, isPrismaConnectionError
│
└── infrastructure/http/middleware/
    ├── error.middleware.test.ts  # ApiError, notFoundHandler, errorHandler
    └── rateLimit.middleware.test.ts  # rateLimiter, authRateLimiter
```

### 3. Running Tests
```bash
# Backend — run all tests once
npx vitest run

# Backend — watch mode
npx vitest --watch

# Backend — type check only (no test execution)
npx tsc --noEmit

# Frontend — type + svelte check
npx svelte-check
```

### 4. Test Coverage Targets
```
├── Shared Domain (Result, errors, Entity, ValueObject)  → 100%
├── Error middleware (ApiError variants, prod sanitize)  → 100%
├── Auth middleware (JWT verify, branchFilter scoping)   → 80%+
├── Business logic (pagination, price calc, discount)    → 80%+
└── API routes (integration via supertest)               → key flows only
```

### 5. What is Tested
```
├── Result<T,E>
│   ├── ok() — isSuccess, value accessor, throws on error access
│   ├── fail() — isFailure, error accessor, throws on value access
│   └── combine() — all-ok → ok, any-fail → first failure, empty → ok
│
├── Domain Errors
│   ├── DatabaseConnectionError — name, default/custom message, instanceof
│   └── isPrismaConnectionError — 6 Prisma connection message patterns,
│                                  non-matching errors, non-Error types
│
├── ApiError class
│   ├── Default statusCode 400, code BAD_REQUEST
│   ├── Static helpers: unauthorized(401), forbidden(403), notFound(404),
│   │   conflict(409), internal(500)
│   └── badRequest carries details payload
│
├── notFoundHandler
│   └── Returns HTTP 404 with { success:false, error:{ code:'RES_001' } }
│
└── errorHandler
    ├── ZodError → 400 VAL_001 with details array
    ├── ApiError → correct statusCode + code
    ├── Generic Error → 500
    ├── Production: 5xx messages sanitized ("Internal server error")
    └── Production: 4xx messages pass through unchanged
```

### 6. CI Quality Gates
```
# These must ALL pass before merge/deploy:
npx tsc --noEmit        # Backend TypeScript — exit 0
npx vitest run          # Backend unit tests — exit 0
npx svelte-check        # Frontend types    — exit 0
```

### 7. Conventions
```
├── Test files: *.test.ts co-located with source (same directory)
├── Test structure: describe → nested describe → it
├── Mocks: vi.fn() for Express req/res, vi.stubEnv() for NODE_ENV
├── No database connections in unit tests (mock at boundary)
└── Integration tests (future): use test DB, isolated per test suite
```

═══════════════════════════════════════════════════════════════════════════════
## 🚢 DEPLOYMENT & DEVOPS
═══════════════════════════════════════════════════════════════════════════════

### 1. Service Architecture
```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network: kpos-network           │
│                                                           │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐             │
│  │  Nginx   │──▶│  API     │──▶│ MongoDB  │             │
│  │ :80/:443 │   │  :5000   │   │  :27017  │             │
│  └────┬─────┘   └──────────┘   └──────────┘             │
│       │              │                                    │
│       ▼         ┌────┴─────┐   ┌──────────┐             │
│  ┌──────────┐   │  Redis   │   │ RabbitMQ │             │
│  │ Frontend │   │  :6379   │   │  :5672   │             │
│  │  :3000   │   └──────────┘   └──────────┘             │
│  └──────────┘                                            │
└─────────────────────────────────────────────────────────┘
```

### 2. Docker Multi-Stage Builds
```
APIS/Dockerfile (oven/bun:1-alpine base)
├── base    — install curl for healthcheck
├── deps    — bun install --frozen-lockfile
├── dev     — copy deps + source, bun --watch src/index.ts
├── builder — bunx prisma generate + bun build → dist/
└── production
    ├── NODE_ENV=production
    ├── copies: dist/, node_modules/, prisma/, package.json
    ├── bunx prisma generate
    └── CMD bun dist/index.js

kpos/Dockerfile (oven/bun:1-alpine base)
├── base    — install curl
├── deps    — bun install --frozen-lockfile
├── dev     — bun run dev --host 0.0.0.0  (port 3000)
├── builder — bun run build → build/
└── production
    ├── NODE_ENV=production
    ├── copies: build/, node_modules/, package.json
    └── CMD node build  (SvelteKit node adapter)
```

### 3. Docker Compose Services
```
Service      Image                    Port(s)          Health Check
─────────────────────────────────────────────────────────────────────
api          ./APIS (Dockerfile:dev)  5000             GET /health
frontend     ./kpos (Dockerfile:dev)  3000             —
mongo        mongo:7.0               27017            rs.status().ok
redis        redis:7.2-alpine         6379             redis-cli ping
rabbitmq     rabbitmq:3.12-mgmt      5672, 15672      rabbitmq-diag ping
postgres     postgres:18-alpine       5432             pg_isready
mysql        mysql:8.4               3306             mysqladmin ping
nginx        nginx:alpine             80, 443          profile=production
```

**Service dependencies (startup order):**
```
mongo (healthy) ──┐
redis (healthy) ──┼──▶ api (healthy) ──▶ frontend
rabbitmq (healthy)┘         │
                            └──▶ nginx  [profile: production]
```

### 4. Nginx Reverse Proxy
```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

# Upstreams (keepalive 32 connections)
upstream api_backend     { server api:5000; }
upstream frontend_backend { server frontend:3000; }

# Gzip: text/css, application/json, application/javascript, image/svg+xml
# Compression level: 6

# Route rules (conf.d/*.conf):
# /api/*  → proxy_pass api_backend
# /*      → proxy_pass frontend_backend
# /health → proxy_pass api_backend (no auth)
```

### 5. Environment Variables
```bash
# ── Required for ALL environments ───────────────────────────────
NODE_ENV=production
JWT_SECRET=<min 32 chars, random>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── Database ─────────────────────────────────────────────────────
DATABASE_URL=mongodb://<host>:27017/kpos_db?replicaSet=rs0

# ── Cache & Queue ────────────────────────────────────────────────
REDIS_URL=redis://<host>:6379
RABBITMQ_URL=amqp://<user>:<pass>@<host>:5672   # optional

# ── Network ──────────────────────────────────────────────────────
CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com

# ── Port overrides (docker-compose) ─────────────────────────────
API_PORT=5000
FRONTEND_PORT=3000
MONGO_PORT=27017
REDIS_PORT=6379
RABBITMQ_PORT=5672
RABBITMQ_MANAGEMENT_PORT=15672
NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443

# ── Database credentials (docker-compose) ────────────────────────
POSTGRES_DB=kpos_db
POSTGRES_USER=kpos
POSTGRES_PASSWORD=<secret>
MYSQL_DB=kpos_db
MYSQL_USER=kpos
MYSQL_PASSWORD=<secret>
RABBITMQ_USER=kpos
RABBITMQ_PASS=<secret>
```

### 6. Production Deployment Runbook
```bash
# 1. Clone and configure
git clone <repo> && cd POS
cp .env.example .env
# Edit .env — set JWT_SECRET, DATABASE_URL, CORS_ORIGIN at minimum

# 2. Start infrastructure services first
docker-compose up -d mongo redis rabbitmq

# 3. Wait for MongoDB replica set to initialise (~30s)
docker-compose logs mongo --follow
# Look for: "rs0 is now the primary"

# 4. Run database migrations
docker-compose run --rm api bunx prisma db push

# 5. Seed default roles, rules, and menu
docker-compose run --rm api bun run db:seed

# 6. Start application services
docker-compose up -d api frontend

# 7. Start Nginx (production profile only)
docker-compose --profile production up -d nginx

# 8. Verify health
curl http://localhost:5000/health
# Expected: { "status": "ok", "services": { "database": "connected" } }

# 9. Seed RBAC rules via API (once)
curl -X POST http://localhost:5000/api/v1/admin/rules/seed \
  -H "Authorization: Bearer <superadmin-token>"
```

### 7. Redis Configuration
```
# docker-compose redis command:
redis-server \
  --appendonly yes          # AOF persistence
  --maxmemory 256mb         # Memory cap
  --maxmemory-policy allkeys-lru  # Evict LRU keys when full

# Key namespaces:
kpos:auth:{userId}          TTL 300s
kpos:stores:{userId}        TTL 300s
kpos:rules:{roleId}         TTL 300s
kpos:query:{path}:{params}  TTL 30-60s  (queryCache middleware)
```

### 8. MongoDB Replica Set
```bash
# Auto-initialised by docker-compose healthcheck:
mongosh --eval "rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] })"

# Required by Prisma for multi-document transactions
# Connection string must include: ?replicaSet=rs0&directConnection=true

# Prisma migrations:
bunx prisma db push      # apply schema (development/staging)
bunx prisma generate     # regenerate Prisma client after schema change
```

### 9. Volumes & Persistence
```
Volume Name           Mounts To              Purpose
────────────────────────────────────────────────────────
kpos-mongo-data       mongo:/data/db         Document storage
kpos-mongo-config     mongo:/data/configdb   Replica set config
kpos-redis-data       redis:/data            AOF persistence
kpos-rabbitmq-data    rabbitmq:/var/lib/...  Queue durability
kpos-postgres-data    postgres:/var/lib/...  PostgreSQL data
kpos-mysql-data       mysql:/var/lib/mysql   MySQL data
```

### 10. Local Development (without Docker)
```bash
# Prerequisites: Bun >= 1.0, MongoDB running locally with replica set

# Backend
cd APIS
bun install
bun run db:push          # apply schema
bun run db:seed          # seed roles/rules
bun run dev              # tsx watch src/index.ts  → :5000

# Frontend
cd kpos
bun install
bun run dev              # → :5173

# Quality checks
npx tsc --noEmit         # type check backend
npx vitest run           # unit tests
npx svelte-check         # type check frontend
```

---
*Last Updated: February 2026*
*Version: 1.1.0*

