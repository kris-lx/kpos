# 🖥️ KPOS - Frontend Application
## Production-Ready POS UI with SvelteKit, Tailwind CSS v4 & Modern State Management

> **Reference System:** POSPOS (https://go.pospos.co) - Thailand's Leading POS Solution
> **Framework:** SvelteKit 2.x with Svelte 5 Runes
> **Styling:** Tailwind CSS v4 with Vite

═══════════════════════════════════════════════════════════════════════════════
## 📋 TABLE OF CONTENTS
═══════════════════════════════════════════════════════════════════════════════

1. [Technical Stack](#technical-stack)
2. [Project Structure](#project-structure)
3. [State Management](#state-management)
4. [UI/UX Design System](#design-system)
5. [Page Routes & Layouts](#page-routes)
6. [Components Library](#components)
7. [Real-time Integration](#real-time)
8. [Offline Support](#offline-support)

═══════════════════════════════════════════════════════════════════════════════
## 🛠️ TECHNICAL STACK
═══════════════════════════════════════════════════════════════════════════════

### Core Framework
```
├── SvelteKit 2.x                        # Full-stack framework
├── Svelte 5                             # UI framework with Runes
├── Vite 6.x                             # Build tool & dev server
├── TypeScript 5.x                       # Type safety (strict mode)
└── Node.js 20+ / Bun                    # Runtime
```

### Styling & UI
```
├── Tailwind CSS v4                      # Utility-first CSS
├── @tailwindcss/vite                    # Vite plugin for Tailwind v4
├── tailwind-variants                    # Component variants
├── clsx + tailwind-merge                # Class utilities
├── Lucide Svelte                        # Icon library
├── Svelte Motion                        # Animations
└── bits-ui                              # Headless components
```

### State Management (Svelte 5 Runes)
```
├── $state                               # Reactive state
├── $derived                             # Computed values
├── $effect                              # Side effects
├── $props                               # Component props
├── $bindable                            # Two-way binding
├── Svelte Stores                        # Global state
├── Context API                          # Component tree state
└── TanStack Query (Svelte)              # Server state & caching
```

### Data & API
```
├── TanStack Query v5                    # Data fetching & caching
├── Zod                                  # Schema validation
├── SuperForms                           # Form handling
├── ky / ofetch                          # HTTP client
└── Socket.io Client                     # Real-time communication
```

### Development Tools
```
├── ESLint + Prettier                    # Code quality
├── Vitest                               # Unit testing
├── Playwright                           # E2E testing
├── Storybook                            # Component documentation
├── svelte-check                         # Type checking
└── Husky + lint-staged                  # Git hooks
```

### Additional Libraries
```
├── date-fns                             # Date utilities
├── chart.js / Apache ECharts            # Charts & graphs
├── html5-qrcode                         # QR/Barcode scanning
├── jspdf + html2canvas                  # PDF generation
├── idb-keyval                           # IndexedDB wrapper
├── workbox                              # PWA & offline
└── svelte-sonner                        # Toast notifications
```

═══════════════════════════════════════════════════════════════════════════════
## ⚙️ PROJECT CONFIGURATION
═══════════════════════════════════════════════════════════════════════════════

### vite.config.ts
```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit()
  ],
  server: {
    port: 5173,
    host: true
  },
  build: {
    target: 'esnext',
    sourcemap: true
  }
});
```

### Tailwind CSS v4 Configuration (app.css)
```css
@import "tailwindcss";

/* ═══════════════════════════════════════════════════════════════════════════
   KAILO POS - Design System Tokens
   ═══════════════════════════════════════════════════════════════════════════ */

@theme {
  /* ─────────────────────────────────────────────────────────────────────────
     Color Palette
     ───────────────────────────────────────────────────────────────────────── */
  
  /* Primary Brand Colors */
  --color-primary-50: oklch(0.97 0.02 250);
  --color-primary-100: oklch(0.93 0.04 250);
  --color-primary-200: oklch(0.86 0.08 250);
  --color-primary-300: oklch(0.76 0.12 250);
  --color-primary-400: oklch(0.66 0.16 250);
  --color-primary-500: oklch(0.55 0.18 250);
  --color-primary-600: oklch(0.48 0.16 250);
  --color-primary-700: oklch(0.40 0.14 250);
  --color-primary-800: oklch(0.33 0.11 250);
  --color-primary-900: oklch(0.27 0.08 250);
  --color-primary-950: oklch(0.20 0.06 250);

  /* Secondary Colors */
  --color-secondary-50: oklch(0.97 0.01 280);
  --color-secondary-500: oklch(0.60 0.15 280);
  --color-secondary-900: oklch(0.25 0.08 280);

  /* Accent Colors */
  --color-accent-50: oklch(0.97 0.02 180);
  --color-accent-500: oklch(0.65 0.15 180);
  --color-accent-900: oklch(0.30 0.08 180);

  /* Semantic Colors */
  --color-success-50: oklch(0.97 0.02 145);
  --color-success-500: oklch(0.60 0.18 145);
  --color-success-600: oklch(0.52 0.16 145);
  --color-success-900: oklch(0.28 0.08 145);

  --color-warning-50: oklch(0.98 0.02 85);
  --color-warning-500: oklch(0.75 0.18 85);
  --color-warning-600: oklch(0.68 0.16 85);
  --color-warning-900: oklch(0.35 0.08 85);

  --color-error-50: oklch(0.97 0.02 25);
  --color-error-500: oklch(0.60 0.20 25);
  --color-error-600: oklch(0.52 0.18 25);
  --color-error-900: oklch(0.28 0.10 25);

  --color-info-50: oklch(0.97 0.02 220);
  --color-info-500: oklch(0.60 0.15 220);
  --color-info-900: oklch(0.28 0.08 220);

  /* Neutral/Gray Scale */
  --color-gray-50: oklch(0.98 0.00 0);
  --color-gray-100: oklch(0.96 0.00 0);
  --color-gray-200: oklch(0.92 0.00 0);
  --color-gray-300: oklch(0.87 0.00 0);
  --color-gray-400: oklch(0.70 0.00 0);
  --color-gray-500: oklch(0.55 0.00 0);
  --color-gray-600: oklch(0.45 0.00 0);
  --color-gray-700: oklch(0.37 0.00 0);
  --color-gray-800: oklch(0.27 0.00 0);
  --color-gray-900: oklch(0.20 0.00 0);
  --color-gray-950: oklch(0.13 0.00 0);

  /* Surface Colors */
  --color-surface: oklch(1 0 0);
  --color-surface-dim: oklch(0.98 0.00 0);
  --color-surface-bright: oklch(1 0 0);
  --color-surface-container: oklch(0.97 0.00 0);
  --color-surface-container-low: oklch(0.98 0.00 0);
  --color-surface-container-high: oklch(0.95 0.00 0);

  /* ─────────────────────────────────────────────────────────────────────────
     Typography
     ───────────────────────────────────────────────────────────────────────── */
  
  --font-sans: 'Inter Variable', 'Noto Sans Thai Variable', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono Variable', 'Fira Code', monospace;
  
  /* Font Sizes (POS-optimized) */
  --font-size-2xs: 0.625rem;     /* 10px - tiny labels */
  --font-size-xs: 0.75rem;       /* 12px - small text */
  --font-size-sm: 0.875rem;      /* 14px - body small */
  --font-size-base: 1rem;        /* 16px - body */
  --font-size-lg: 1.125rem;      /* 18px - large body */
  --font-size-xl: 1.25rem;       /* 20px - heading 6 */
  --font-size-2xl: 1.5rem;       /* 24px - heading 5 */
  --font-size-3xl: 1.875rem;     /* 30px - heading 4 */
  --font-size-4xl: 2.25rem;      /* 36px - heading 3 */
  --font-size-5xl: 3rem;         /* 48px - heading 2 */
  --font-size-6xl: 3.75rem;      /* 60px - heading 1 */
  --font-size-price: 2rem;       /* 32px - price display */
  --font-size-total: 2.5rem;     /* 40px - total amount */

  /* ─────────────────────────────────────────────────────────────────────────
     Spacing (8px base grid)
     ───────────────────────────────────────────────────────────────────────── */
  
  --spacing-0: 0;
  --spacing-px: 1px;
  --spacing-0-5: 0.125rem;       /* 2px */
  --spacing-1: 0.25rem;          /* 4px */
  --spacing-1-5: 0.375rem;       /* 6px */
  --spacing-2: 0.5rem;           /* 8px */
  --spacing-2-5: 0.625rem;       /* 10px */
  --spacing-3: 0.75rem;          /* 12px */
  --spacing-3-5: 0.875rem;       /* 14px */
  --spacing-4: 1rem;             /* 16px */
  --spacing-5: 1.25rem;          /* 20px */
  --spacing-6: 1.5rem;           /* 24px */
  --spacing-7: 1.75rem;          /* 28px */
  --spacing-8: 2rem;             /* 32px */
  --spacing-9: 2.25rem;          /* 36px */
  --spacing-10: 2.5rem;          /* 40px */
  --spacing-12: 3rem;            /* 48px */
  --spacing-14: 3.5rem;          /* 56px */
  --spacing-16: 4rem;            /* 64px */
  --spacing-20: 5rem;            /* 80px */
  --spacing-24: 6rem;            /* 96px */

  /* ─────────────────────────────────────────────────────────────────────────
     Border Radius
     ───────────────────────────────────────────────────────────────────────── */
  
  --radius-none: 0;
  --radius-sm: 0.25rem;          /* 4px */
  --radius-md: 0.375rem;         /* 6px */
  --radius-lg: 0.5rem;           /* 8px */
  --radius-xl: 0.75rem;          /* 12px */
  --radius-2xl: 1rem;            /* 16px */
  --radius-3xl: 1.5rem;          /* 24px */
  --radius-full: 9999px;

  /* ─────────────────────────────────────────────────────────────────────────
     Shadows
     ───────────────────────────────────────────────────────────────────────── */
  
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
  --shadow-inner: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);
  --shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-dropdown: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);

  /* ─────────────────────────────────────────────────────────────────────────
     Transitions
     ───────────────────────────────────────────────────────────────────────── */
  
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-spring: 500ms cubic-bezier(0.34, 1.56, 0.64, 1);

  /* ─────────────────────────────────────────────────────────────────────────
     Z-Index Scale
     ───────────────────────────────────────────────────────────────────────── */
  
  --z-dropdown: 1000;
  --z-sticky: 1020;
  --z-fixed: 1030;
  --z-modal-backdrop: 1040;
  --z-modal: 1050;
  --z-popover: 1060;
  --z-tooltip: 1070;
  --z-toast: 1080;

  /* ─────────────────────────────────────────────────────────────────────────
     POS-Specific Sizes
     ───────────────────────────────────────────────────────────────────────── */
  
  --size-sidebar: 280px;
  --size-sidebar-collapsed: 72px;
  --size-header: 64px;
  --size-product-card: 140px;
  --size-product-card-lg: 180px;
  --size-cart-width: 380px;
  --size-numpad-btn: 64px;
  --size-action-btn: 56px;
  --size-touch-target: 44px;     /* Minimum touch target */
}

/* ═══════════════════════════════════════════════════════════════════════════
   Dark Mode Theme
   ═══════════════════════════════════════════════════════════════════════════ */

@theme dark {
  --color-surface: oklch(0.15 0.00 0);
  --color-surface-dim: oklch(0.12 0.00 0);
  --color-surface-bright: oklch(0.20 0.00 0);
  --color-surface-container: oklch(0.18 0.00 0);
  --color-surface-container-low: oklch(0.15 0.00 0);
  --color-surface-container-high: oklch(0.22 0.00 0);
  
  --shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.3), 0 1px 2px -1px rgb(0 0 0 / 0.3);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Base Styles
   ═══════════════════════════════════════════════════════════════════════════ */

@layer base {
  html {
    @apply antialiased;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  body {
    @apply bg-surface text-gray-900 dark:text-gray-100;
    @apply font-sans;
  }

  /* Custom scrollbar */
  ::-webkit-scrollbar {
    @apply w-2 h-2;
  }

  ::-webkit-scrollbar-track {
    @apply bg-gray-100 dark:bg-gray-800;
  }

  ::-webkit-scrollbar-thumb {
    @apply bg-gray-300 dark:bg-gray-600 rounded-full;
  }

  ::-webkit-scrollbar-thumb:hover {
    @apply bg-gray-400 dark:bg-gray-500;
  }

  /* Focus styles */
  *:focus-visible {
    @apply outline-none ring-2 ring-primary-500 ring-offset-2;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Component Utilities
   ═══════════════════════════════════════════════════════════════════════════ */

@layer utilities {
  /* POS-specific utilities */
  .pos-card {
    @apply bg-white dark:bg-gray-800 rounded-xl shadow-card;
  }

  .pos-button {
    @apply inline-flex items-center justify-center font-medium;
    @apply transition-all duration-150;
    @apply focus-visible:ring-2 focus-visible:ring-offset-2;
    @apply disabled:opacity-50 disabled:cursor-not-allowed;
    @apply active:scale-[0.98];
  }

  .pos-input {
    @apply w-full px-4 py-3 rounded-lg border border-gray-200;
    @apply bg-white dark:bg-gray-800 dark:border-gray-700;
    @apply focus:ring-2 focus:ring-primary-500 focus:border-transparent;
    @apply placeholder:text-gray-400;
    @apply transition-colors duration-150;
  }

  .pos-numpad-btn {
    @apply w-16 h-16 rounded-xl text-2xl font-semibold;
    @apply bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600;
    @apply active:scale-95 transition-all duration-100;
  }

  .pos-product-grid {
    @apply grid gap-3;
    grid-template-columns: repeat(auto-fill, minmax(var(--size-product-card), 1fr));
  }

  .touch-target {
    @apply min-w-[44px] min-h-[44px];
  }

  /* Price display */
  .price-display {
    @apply font-mono text-3xl font-bold text-right;
    font-variant-numeric: tabular-nums;
  }

  /* Animation utilities */
  .animate-slide-in {
    animation: slideIn var(--transition-normal) ease-out;
  }

  .animate-fade-in {
    animation: fadeIn var(--transition-fast) ease-out;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}
```

### svelte.config.js
```javascript
import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    alias: {
      '$components': 'src/lib/components',
      '$stores': 'src/lib/stores',
      '$utils': 'src/lib/utils',
      '$api': 'src/lib/api',
      '$types': 'src/lib/types',
      '$hooks': 'src/lib/hooks',
      '$constants': 'src/lib/constants'
    }
  }
};

export default config;
```

═══════════════════════════════════════════════════════════════════════════════
## 📁 PROJECT STRUCTURE
═══════════════════════════════════════════════════════════════════════════════

```
src/
├── app.html                             # HTML template
├── app.css                              # Global styles + Tailwind v4
├── app.d.ts                             # App type declarations
├── hooks.server.ts                      # Server hooks (auth, etc.)
├── hooks.client.ts                      # Client hooks
│
├── lib/
│   ├── components/                      # UI Components
│   │   ├── ui/                          # Base UI components
│   │   │   ├── button/
│   │   │   │   ├── Button.svelte
│   │   │   │   ├── ButtonGroup.svelte
│   │   │   │   └── index.ts
│   │   │   ├── input/
│   │   │   ├── select/
│   │   │   ├── modal/
│   │   │   ├── dropdown/
│   │   │   ├── table/
│   │   │   ├── card/
│   │   │   ├── badge/
│   │   │   ├── avatar/
│   │   │   ├── tabs/
│   │   │   ├── tooltip/
│   │   │   ├── toast/
│   │   │   ├── skeleton/
│   │   │   ├── spinner/
│   │   │   └── index.ts
│   │   │
│   │   ├── layout/                      # Layout components
│   │   │   ├── Sidebar.svelte
│   │   │   ├── Header.svelte
│   │   │   ├── Footer.svelte
│   │   │   ├── PageHeader.svelte
│   │   │   └── Container.svelte
│   │   │
│   │   ├── pos/                         # POS-specific components
│   │   │   ├── ProductGrid.svelte
│   │   │   ├── ProductCard.svelte
│   │   │   ├── CartPanel.svelte
│   │   │   ├── CartItem.svelte
│   │   │   ├── NumPad.svelte
│   │   │   ├── PaymentPanel.svelte
│   │   │   ├── CustomerDisplay.svelte
│   │   │   ├── BarcodeScanner.svelte
│   │   │   ├── QuickSearch.svelte
│   │   │   ├── CategoryTabs.svelte
│   │   │   ├── PriceDisplay.svelte
│   │   │   ├── DiscountModal.svelte
│   │   │   ├── HoldSaleModal.svelte
│   │   │   ├── RefundModal.svelte
│   │   │   ├── ReceiptPreview.svelte
│   │   │   └── ShiftSummary.svelte
│   │   │
│   │   ├── restaurant/                  # Restaurant components
│   │   │   ├── TableLayout.svelte
│   │   │   ├── TableCard.svelte
│   │   │   ├── OrderPanel.svelte
│   │   │   ├── KitchenDisplay.svelte
│   │   │   ├── QueueDisplay.svelte
│   │   │   ├── ReservationCalendar.svelte
│   │   │   └── MenuBuilder.svelte
│   │   │
│   │   ├── inventory/                   # Inventory components
│   │   │   ├── ProductForm.svelte
│   │   │   ├── StockAdjustment.svelte
│   │   │   ├── BarcodeGenerator.svelte
│   │   │   ├── StockTransfer.svelte
│   │   │   ├── ExpiryAlert.svelte
│   │   │   └── PurchaseOrderForm.svelte
│   │   │
│   │   ├── reports/                     # Report components
│   │   │   ├── SalesChart.svelte
│   │   │   ├── RevenueChart.svelte
│   │   │   ├── TopProducts.svelte
│   │   │   ├── StaffPerformance.svelte
│   │   │   ├── DateRangePicker.svelte
│   │   │   └── ExportOptions.svelte
│   │   │
│   │   ├── crm/                         # CRM components
│   │   │   ├── MemberCard.svelte
│   │   │   ├── PointsDisplay.svelte
│   │   │   ├── MemberSearch.svelte
│   │   │   └── LoyaltyTierBadge.svelte
│   │   │
│   │   └── forms/                       # Form components
│   │       ├── FormField.svelte
│   │       ├── FormSection.svelte
│   │       ├── ImageUpload.svelte
│   │       └── RichTextEditor.svelte
│   │
│   ├── stores/                          # State management
│   │   ├── auth.svelte.ts               # Auth state (Svelte 5 runes)
│   │   ├── cart.svelte.ts               # Cart/POS state
│   │   ├── pos.svelte.ts                # POS settings & session
│   │   ├── products.svelte.ts           # Products state
│   │   ├── ui.svelte.ts                 # UI state (sidebar, theme)
│   │   ├── notifications.svelte.ts      # Notifications
│   │   ├── restaurant.svelte.ts         # Restaurant state
│   │   ├── offline.svelte.ts            # Offline queue
│   │   └── index.ts
│   │
│   ├── api/                             # API layer
│   │   ├── client.ts                    # HTTP client setup
│   │   ├── auth.ts
│   │   ├── products.ts
│   │   ├── sales.ts
│   │   ├── members.ts
│   │   ├── reports.ts
│   │   ├── settings.ts
│   │   └── index.ts
│   │
│   ├── hooks/                           # Custom hooks
│   │   ├── useAuth.svelte.ts
│   │   ├── useCart.svelte.ts
│   │   ├── useProducts.svelte.ts
│   │   ├── useBarcodeScanner.svelte.ts
│   │   ├── useKeyboard.svelte.ts
│   │   ├── useOffline.svelte.ts
│   │   ├── usePrint.svelte.ts
│   │   └── useSocket.svelte.ts
│   │
│   ├── utils/                           # Utilities
│   │   ├── format.ts                    # Number, currency, date formatting
│   │   ├── validation.ts                # Zod schemas
│   │   ├── storage.ts                   # localStorage/IndexedDB
│   │   ├── print.ts                     # Receipt printing
│   │   ├── barcode.ts                   # Barcode utilities
│   │   ├── cn.ts                        # Class name utilities
│   │   └── index.ts
│   │
│   ├── types/                           # TypeScript types
│   │   ├── product.ts
│   │   ├── cart.ts
│   │   ├── transaction.ts
│   │   ├── member.ts
│   │   ├── user.ts
│   │   ├── settings.ts
│   │   └── index.ts
│   │
│   ├── constants/                       # Constants
│   │   ├── routes.ts
│   │   ├── keys.ts
│   │   ├── permissions.ts
│   │   └── index.ts
│   │
│   └── server/                          # Server-only code
│       ├── auth.ts
│       └── db.ts
│
├── routes/                              # SvelteKit routes
│   ├── +layout.svelte                   # Root layout
│   ├── +layout.server.ts                # Root server load
│   ├── +page.svelte                     # Landing/redirect
│   ├── +error.svelte                    # Error page
│   │
│   ├── (auth)/                          # Auth group (no sidebar)
│   │   ├── +layout.svelte
│   │   ├── login/
│   │   │   └── +page.svelte
│   │   ├── forgot-password/
│   │   │   └── +page.svelte
│   │   └── reset-password/
│   │       └── +page.svelte
│   │
│   ├── (app)/                           # Main app group
│   │   ├── +layout.svelte               # App layout with sidebar
│   │   ├── +layout.server.ts            # Auth guard
│   │   │
│   │   ├── dashboard/
│   │   │   ├── +page.svelte
│   │   │   └── +page.server.ts
│   │   │
│   │   ├── pos/                         # Point of Sale
│   │   │   ├── +page.svelte             # Main POS screen
│   │   │   ├── +page.server.ts
│   │   │   ├── hold/
│   │   │   │   └── +page.svelte         # Held sales
│   │   │   ├── history/
│   │   │   │   ├── +page.svelte         # Transaction history
│   │   │   │   └── [id]/
│   │   │   │       └── +page.svelte     # Transaction details
│   │   │   └── refund/
│   │   │       └── +page.svelte         # Refund processing
│   │   │
│   │   ├── products/                    # Product management
│   │   │   ├── +page.svelte             # Product list
│   │   │   ├── +page.server.ts
│   │   │   ├── new/
│   │   │   │   └── +page.svelte
│   │   │   ├── [id]/
│   │   │   │   ├── +page.svelte         # View/Edit product
│   │   │   │   └── +page.server.ts
│   │   │   ├── categories/
│   │   │   │   └── +page.svelte
│   │   │   ├── import/
│   │   │   │   └── +page.svelte
│   │   │   └── barcodes/
│   │   │       └── +page.svelte
│   │   │
│   │   ├── inventory/                   # Stock management
│   │   │   ├── +page.svelte             # Stock overview
│   │   │   ├── adjust/
│   │   │   │   └── +page.svelte
│   │   │   ├── transfer/
│   │   │   │   └── +page.svelte
│   │   │   ├── count/
│   │   │   │   └── +page.svelte
│   │   │   ├── purchase-orders/
│   │   │   │   ├── +page.svelte
│   │   │   │   ├── new/
│   │   │   │   │   └── +page.svelte
│   │   │   │   └── [id]/
│   │   │   │       └── +page.svelte
│   │   │   └── expiring/
│   │   │       └── +page.svelte
│   │   │
│   │   ├── restaurant/                  # Restaurant module
│   │   │   ├── +page.svelte             # Table view
│   │   │   ├── tables/
│   │   │   │   └── +page.svelte
│   │   │   ├── orders/
│   │   │   │   ├── +page.svelte
│   │   │   │   └── [id]/
│   │   │   │       └── +page.svelte
│   │   │   ├── kitchen/
│   │   │   │   └── +page.svelte         # Kitchen display
│   │   │   └── reservations/
│   │   │       └── +page.svelte
│   │   │
│   │   ├── members/                     # CRM
│   │   │   ├── +page.svelte
│   │   │   ├── new/
│   │   │   │   └── +page.svelte
│   │   │   ├── [id]/
│   │   │   │   └── +page.svelte
│   │   │   ├── tiers/
│   │   │   │   └── +page.svelte
│   │   │   └── points/
│   │   │       └── +page.svelte
│   │   │
│   │   ├── promotions/
│   │   │   ├── +page.svelte
│   │   │   ├── new/
│   │   │   │   └── +page.svelte
│   │   │   ├── [id]/
│   │   │   │   └── +page.svelte
│   │   │   └── coupons/
│   │   │       └── +page.svelte
│   │   │
│   │   ├── reports/
│   │   │   ├── +page.svelte             # Reports dashboard
│   │   │   ├── sales/
│   │   │   │   └── +page.svelte
│   │   │   ├── products/
│   │   │   │   └── +page.svelte
│   │   │   ├── inventory/
│   │   │   │   └── +page.svelte
│   │   │   ├── staff/
│   │   │   │   └── +page.svelte
│   │   │   ├── customers/
│   │   │   │   └── +page.svelte
│   │   │   └── financial/
│   │   │       └── +page.svelte
│   │   │
│   │   ├── staff/
│   │   │   ├── +page.svelte
│   │   │   ├── new/
│   │   │   │   └── +page.svelte
│   │   │   ├── [id]/
│   │   │   │   └── +page.svelte
│   │   │   ├── roles/
│   │   │   │   └── +page.svelte
│   │   │   └── schedule/
│   │   │       └── +page.svelte
│   │   │
│   │   ├── vendors/
│   │   │   ├── +page.svelte
│   │   │   └── [id]/
│   │   │       └── +page.svelte
│   │   │
│   │   ├── branches/
│   │   │   ├── +page.svelte
│   │   │   └── [id]/
│   │   │       └── +page.svelte
│   │   │
│   │   └── settings/
│   │       ├── +page.svelte
│   │       ├── +layout.svelte           # Settings sidebar
│   │       ├── general/
│   │       │   └── +page.svelte
│   │       ├── display/
│   │       │   └── +page.svelte
│   │       ├── payment/
│   │       │   └── +page.svelte
│   │       ├── tax/
│   │       │   └── +page.svelte
│   │       ├── receipt/
│   │       │   └── +page.svelte
│   │       ├── printers/
│   │       │   └── +page.svelte
│   │       ├── integrations/
│   │       │   └── +page.svelte
│   │       └── developer/
│   │           └── +page.svelte
│   │
│   └── api/                             # API routes (if needed)
│       └── [...]/
│
├── static/
│   ├── fonts/
│   ├── images/
│   │   ├── logo.svg
│   │   ├── placeholder-product.png
│   │   └── empty-states/
│   └── sounds/
│       ├── beep.mp3
│       └── notification.mp3
│
└── tests/
    ├── unit/
    └── e2e/
```

═══════════════════════════════════════════════════════════════════════════════
## 🔄 STATE MANAGEMENT (Svelte 5 Runes)
═══════════════════════════════════════════════════════════════════════════════

### Cart Store (src/lib/stores/cart.svelte.ts)
```typescript
import { getContext, setContext } from 'svelte';

// Types
export interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  discount: number;
  discountType: 'percentage' | 'fixed';
  note?: string;
  modifiers?: Modifier[];
  sku?: string;
  barcode?: string;
  image?: string;
}

export interface CartState {
  items: CartItem[];
  customerId?: string;
  customerName?: string;
  discount: number;
  discountType: 'percentage' | 'fixed';
  note?: string;
  tableId?: string;
  orderType: 'walkin' | 'takeaway' | 'delivery' | 'dine-in';
}

// Cart Store Class using Svelte 5 Runes
class CartStore {
  // Reactive state using $state rune
  items = $state<CartItem[]>([]);
  customerId = $state<string | undefined>(undefined);
  customerName = $state<string | undefined>(undefined);
  discount = $state(0);
  discountType = $state<'percentage' | 'fixed'>('percentage');
  note = $state<string | undefined>(undefined);
  tableId = $state<string | undefined>(undefined);
  orderType = $state<'walkin' | 'takeaway' | 'delivery' | 'dine-in'>('walkin');

  // Derived values using $derived rune
  itemCount = $derived(this.items.reduce((sum, item) => sum + item.quantity, 0));
  
  subtotal = $derived(
    this.items.reduce((sum, item) => {
      const itemTotal = item.price * item.quantity;
      const itemDiscount = item.discountType === 'percentage' 
        ? itemTotal * (item.discount / 100)
        : item.discount;
      return sum + (itemTotal - itemDiscount);
    }, 0)
  );

  discountAmount = $derived(
    this.discountType === 'percentage'
      ? this.subtotal * (this.discount / 100)
      : this.discount
  );

  total = $derived(this.subtotal - this.discountAmount);

  isEmpty = $derived(this.items.length === 0);

  // Methods
  addItem(product: Product, quantity = 1, modifiers?: Modifier[]) {
    const existingIndex = this.items.findIndex(
      item => item.productId === product.id && 
              JSON.stringify(item.modifiers) === JSON.stringify(modifiers)
    );

    if (existingIndex >= 0) {
      this.items[existingIndex].quantity += quantity;
    } else {
      this.items.push({
        id: crypto.randomUUID(),
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity,
        discount: 0,
        discountType: 'percentage',
        modifiers,
        sku: product.sku,
        barcode: product.barcode,
        image: product.image
      });
    }
  }

  updateQuantity(itemId: string, quantity: number) {
    const index = this.items.findIndex(item => item.id === itemId);
    if (index >= 0) {
      if (quantity <= 0) {
        this.removeItem(itemId);
      } else {
        this.items[index].quantity = quantity;
      }
    }
  }

  removeItem(itemId: string) {
    this.items = this.items.filter(item => item.id !== itemId);
  }

  applyItemDiscount(itemId: string, discount: number, type: 'percentage' | 'fixed') {
    const index = this.items.findIndex(item => item.id === itemId);
    if (index >= 0) {
      this.items[index].discount = discount;
      this.items[index].discountType = type;
    }
  }

  applyDiscount(discount: number, type: 'percentage' | 'fixed') {
    this.discount = discount;
    this.discountType = type;
  }

  setCustomer(id: string, name: string) {
    this.customerId = id;
    this.customerName = name;
  }

  clearCustomer() {
    this.customerId = undefined;
    this.customerName = undefined;
  }

  setTable(tableId: string) {
    this.tableId = tableId;
    this.orderType = 'dine-in';
  }

  setOrderType(type: 'walkin' | 'takeaway' | 'delivery' | 'dine-in') {
    this.orderType = type;
    if (type !== 'dine-in') {
      this.tableId = undefined;
    }
  }

  setNote(note: string) {
    this.note = note;
  }

  clear() {
    this.items = [];
    this.customerId = undefined;
    this.customerName = undefined;
    this.discount = 0;
    this.discountType = 'percentage';
    this.note = undefined;
    this.tableId = undefined;
    this.orderType = 'walkin';
  }

  toJSON(): CartState {
    return {
      items: this.items,
      customerId: this.customerId,
      customerName: this.customerName,
      discount: this.discount,
      discountType: this.discountType,
      note: this.note,
      tableId: this.tableId,
      orderType: this.orderType
    };
  }

  fromJSON(data: CartState) {
    this.items = data.items;
    this.customerId = data.customerId;
    this.customerName = data.customerName;
    this.discount = data.discount;
    this.discountType = data.discountType;
    this.note = data.note;
    this.tableId = data.tableId;
    this.orderType = data.orderType;
  }
}

// Context key
const CART_KEY = Symbol('cart');

// Create and provide cart store
export function createCartStore() {
  const cart = new CartStore();
  setContext(CART_KEY, cart);
  return cart;
}

// Get cart store from context
export function getCartStore() {
  return getContext<CartStore>(CART_KEY);
}

// Singleton for use outside components
export const cartStore = new CartStore();
```

### Auth Store (src/lib/stores/auth.svelte.ts)
```typescript
import { goto } from '$app/navigation';
import { api } from '$api';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  branchId: string;
  avatar?: string;
}

class AuthStore {
  user = $state<User | null>(null);
  token = $state<string | null>(null);
  isLoading = $state(true);

  isAuthenticated = $derived(!!this.user && !!this.token);

  async login(email: string, password: string) {
    const response = await api.auth.login({ email, password });
    this.user = response.user;
    this.token = response.token;
    localStorage.setItem('token', response.token);
    localStorage.setItem('refreshToken', response.refreshToken);
  }

  async logout() {
    try {
      await api.auth.logout();
    } finally {
      this.user = null;
      this.token = null;
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      goto('/login');
    }
  }

  async checkAuth() {
    this.isLoading = true;
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        this.isLoading = false;
        return false;
      }
      this.token = token;
      const user = await api.auth.me();
      this.user = user;
      return true;
    } catch {
      this.token = null;
      this.user = null;
      localStorage.removeItem('token');
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  hasPermission(permission: string): boolean {
    return this.user?.permissions.includes(permission) ?? false;
  }

  hasAnyPermission(permissions: string[]): boolean {
    return permissions.some(p => this.hasPermission(p));
  }

  hasAllPermissions(permissions: string[]): boolean {
    return permissions.every(p => this.hasPermission(p));
  }
}

export const authStore = new AuthStore();
```

### POS Session Store (src/lib/stores/pos.svelte.ts)
```typescript
class POSStore {
  // Shift management
  currentShift = $state<Shift | null>(null);
  isShiftOpen = $derived(!!this.currentShift);

  // Cash drawer
  drawerBalance = $state(0);
  expectedBalance = $state(0);

  // Settings
  displayMode = $state<'grid' | 'list'>('grid');
  fontSize = $state<'small' | 'medium' | 'large'>('medium');
  soundEnabled = $state(true);
  quickSaleEnabled = $state(true);

  // Active category filter
  activeCategory = $state<string | null>(null);

  // Search
  searchQuery = $state('');

  // Held sales
  heldSales = $state<HeldSale[]>([]);

  async openShift(openingBalance: number) {
    const shift = await api.sales.openShift({ openingBalance });
    this.currentShift = shift;
    this.drawerBalance = openingBalance;
    this.expectedBalance = openingBalance;
  }

  async closeShift(closingBalance: number) {
    if (!this.currentShift) return;
    await api.sales.closeShift({
      shiftId: this.currentShift.id,
      closingBalance
    });
    this.currentShift = null;
    this.drawerBalance = 0;
    this.expectedBalance = 0;
  }

  updateDrawerBalance(amount: number) {
    this.drawerBalance += amount;
  }

  holdSale(cart: CartState, name?: string) {
    const held: HeldSale = {
      id: crypto.randomUUID(),
      name: name || `Sale ${this.heldSales.length + 1}`,
      cart,
      createdAt: new Date().toISOString()
    };
    this.heldSales.push(held);
    return held;
  }

  recallSale(heldId: string): CartState | null {
    const index = this.heldSales.findIndex(h => h.id === heldId);
    if (index >= 0) {
      const [held] = this.heldSales.splice(index, 1);
      return held.cart;
    }
    return null;
  }

  removeHeldSale(heldId: string) {
    this.heldSales = this.heldSales.filter(h => h.id !== heldId);
  }
}

export const posStore = new POSStore();
```

### UI Store (src/lib/stores/ui.svelte.ts)
```typescript
class UIStore {
  // Sidebar
  sidebarOpen = $state(true);
  sidebarCollapsed = $state(false);

  // Theme
  theme = $state<'light' | 'dark' | 'system'>('system');
  resolvedTheme = $derived.by(() => {
    if (this.theme === 'system') {
      return typeof window !== 'undefined' && 
        window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return this.theme;
  });

  // Modals
  activeModal = $state<string | null>(null);
  modalData = $state<unknown>(null);

  // Loading states
  globalLoading = $state(false);
  loadingMessage = $state<string | null>(null);

  // Toasts are handled by svelte-sonner

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  collapseSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  setTheme(theme: 'light' | 'dark' | 'system') {
    this.theme = theme;
    localStorage.setItem('theme', theme);
    this.applyTheme();
  }

  applyTheme() {
    if (typeof document === 'undefined') return;
    
    if (this.resolvedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  openModal(id: string, data?: unknown) {
    this.activeModal = id;
    this.modalData = data;
  }

  closeModal() {
    this.activeModal = null;
    this.modalData = null;
  }

  setLoading(loading: boolean, message?: string) {
    this.globalLoading = loading;
    this.loadingMessage = message ?? null;
  }
}

export const uiStore = new UIStore();
```

### Products Store with TanStack Query (src/lib/stores/products.svelte.ts)
```typescript
import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
import { api } from '$api';

// Query keys
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (filters: ProductFilters) => [...productKeys.lists(), filters] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
  categories: ['categories'] as const,
};

// Products list query
export function useProducts(filters: ProductFilters = {}) {
  return createQuery({
    queryKey: productKeys.list(filters),
    queryFn: () => api.products.list(filters),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Single product query
export function useProduct(id: string) {
  return createQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => api.products.get(id),
    enabled: !!id,
  });
}

// Categories query
export function useCategories() {
  return createQuery({
    queryKey: productKeys.categories,
    queryFn: () => api.products.getCategories(),
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

// Create product mutation
export function useCreateProduct() {
  const queryClient = useQueryClient();
  
  return createMutation({
    mutationFn: (data: CreateProductInput) => api.products.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

// Update product mutation
export function useUpdateProduct() {
  const queryClient = useQueryClient();
  
  return createMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductInput }) => 
      api.products.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

// Delete product mutation
export function useDeleteProduct() {
  const queryClient = useQueryClient();
  
  return createMutation({
    mutationFn: (id: string) => api.products.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}
```

═══════════════════════════════════════════════════════════════════════════════
## 🧩 COMPONENT EXAMPLES
═══════════════════════════════════════════════════════════════════════════════

### Button Component (src/lib/components/ui/button/Button.svelte)
```svelte
<script lang="ts">
  import { tv, type VariantProps } from 'tailwind-variants';
  import { cn } from '$utils/cn';

  const buttonVariants = tv({
    base: `
      inline-flex items-center justify-center gap-2
      font-medium transition-all duration-150
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
      disabled:pointer-events-none disabled:opacity-50
      active:scale-[0.98]
    `,
    variants: {
      variant: {
        primary: 'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500',
        secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-500 dark:bg-gray-700 dark:text-gray-100',
        outline: 'border-2 border-gray-200 bg-transparent hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800',
        ghost: 'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800',
        danger: 'bg-error-600 text-white hover:bg-error-700 focus-visible:ring-error-500',
        success: 'bg-success-600 text-white hover:bg-success-700 focus-visible:ring-success-500',
      },
      size: {
        xs: 'h-7 px-2 text-xs rounded-md',
        sm: 'h-9 px-3 text-sm rounded-lg',
        md: 'h-11 px-4 text-sm rounded-lg',
        lg: 'h-12 px-6 text-base rounded-xl',
        xl: 'h-14 px-8 text-lg rounded-xl',
        icon: 'h-10 w-10 rounded-lg',
        'icon-sm': 'h-8 w-8 rounded-md',
        'icon-lg': 'h-12 w-12 rounded-xl',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  });

  type ButtonVariants = VariantProps<typeof buttonVariants>;

  interface Props {
    variant?: ButtonVariants['variant'];
    size?: ButtonVariants['size'];
    fullWidth?: boolean;
    loading?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children?: import('svelte').Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    disabled = false,
    type = 'button',
    class: className,
    onclick,
    children,
  }: Props = $props();
</script>

<button
  {type}
  disabled={disabled || loading}
  class={cn(buttonVariants({ variant, size, fullWidth }), className)}
  {onclick}
>
  {#if loading}
    <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  {/if}
  {@render children?.()}
</button>
```

### Product Card (src/lib/components/pos/ProductCard.svelte)
```svelte
<script lang="ts">
  import type { Product } from '$types';
  import { getCartStore } from '$stores/cart.svelte';
  import { formatCurrency } from '$utils/format';

  interface Props {
    product: Product;
    size?: 'sm' | 'md' | 'lg';
  }

  let { product, size = 'md' }: Props = $props();

  const cart = getCartStore();

  function handleClick() {
    cart.addItem(product);
    
    // Play sound if enabled
    if (posStore.soundEnabled) {
      new Audio('/sounds/beep.mp3').play().catch(() => {});
    }
  }

  const sizeClasses = {
    sm: 'h-28 p-2',
    md: 'h-36 p-3',
    lg: 'h-44 p-4',
  };
</script>

<button
  type="button"
  onclick={handleClick}
  class={`
    relative flex flex-col rounded-xl bg-white dark:bg-gray-800
    border border-gray-100 dark:border-gray-700
    shadow-card hover:shadow-lg
    transition-all duration-150
    active:scale-[0.98]
    overflow-hidden
    ${sizeClasses[size]}
    ${product.stock <= 0 ? 'opacity-50' : ''}
  `}
  disabled={product.stock <= 0}
>
  <!-- Product Image -->
  {#if product.image}
    <div class="relative flex-1 w-full overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-900">
      <img
        src={product.image}
        alt={product.name}
        class="h-full w-full object-cover"
        loading="lazy"
      />
    </div>
  {:else}
    <div class="flex-1 w-full rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
      <span class="text-2xl text-gray-400">📦</span>
    </div>
  {/if}

  <!-- Product Info -->
  <div class="mt-2 text-left">
    <p class="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
      {product.name}
    </p>
    <p class="text-sm font-bold text-primary-600 dark:text-primary-400">
      {formatCurrency(product.price)}
    </p>
  </div>

  <!-- Stock Badge -->
  {#if product.stock <= product.lowStockThreshold}
    <span class="absolute top-1 right-1 px-1.5 py-0.5 text-2xs font-medium rounded-full bg-warning-100 text-warning-700">
      {product.stock <= 0 ? 'หมด' : `เหลือ ${product.stock}`}
    </span>
  {/if}
</button>
```

### Cart Panel (src/lib/components/pos/CartPanel.svelte)
```svelte
<script lang="ts">
  import { getCartStore } from '$stores/cart.svelte';
  import { formatCurrency } from '$utils/format';
  import { Button } from '$components/ui/button';
  import CartItem from './CartItem.svelte';
  import NumPad from './NumPad.svelte';
  import { Trash2, User, Tag, StickyNote, CreditCard } from 'lucide-svelte';

  const cart = getCartStore();

  let showNumpad = $state(false);
  let selectedItemId = $state<string | null>(null);

  function handlePay() {
    // Open payment modal
    uiStore.openModal('payment', { cart: cart.toJSON() });
  }

  function handleClear() {
    if (confirm('ต้องการล้างรายการทั้งหมด?')) {
      cart.clear();
    }
  }
</script>

<div class="flex flex-col h-full bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
  <!-- Header -->
  <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
    <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
      รายการสั่งซื้อ
      {#if cart.itemCount > 0}
        <span class="ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 text-primary-700">
          {cart.itemCount}
        </span>
      {/if}
    </h2>
    <Button variant="ghost" size="icon-sm" onclick={handleClear} disabled={cart.isEmpty}>
      <Trash2 class="h-4 w-4" />
    </Button>
  </div>

  <!-- Customer Info -->
  {#if cart.customerName}
    <div class="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center gap-2 text-sm">
        <User class="h-4 w-4 text-primary-600" />
        <span class="font-medium">{cart.customerName}</span>
      </div>
    </div>
  {/if}

  <!-- Cart Items -->
  <div class="flex-1 overflow-y-auto p-4 space-y-2">
    {#if cart.isEmpty}
      <div class="flex flex-col items-center justify-center h-full text-gray-400">
        <div class="text-4xl mb-2">🛒</div>
        <p class="text-sm">ยังไม่มีสินค้าในรายการ</p>
        <p class="text-xs mt-1">สแกนบาร์โค้ดหรือเลือกสินค้า</p>
      </div>
    {:else}
      {#each cart.items as item (item.id)}
        <CartItem
          {item}
          selected={selectedItemId === item.id}
          onclick={() => selectedItemId = item.id}
          onQuantityChange={(qty) => cart.updateQuantity(item.id, qty)}
          onRemove={() => cart.removeItem(item.id)}
        />
      {/each}
    {/if}
  </div>

  <!-- Summary -->
  <div class="border-t border-gray-200 dark:border-gray-700 p-4 space-y-2">
    <!-- Subtotal -->
    <div class="flex justify-between text-sm">
      <span class="text-gray-500">รวม</span>
      <span class="font-medium">{formatCurrency(cart.subtotal)}</span>
    </div>

    <!-- Discount -->
    {#if cart.discountAmount > 0}
      <div class="flex justify-between text-sm text-success-600">
        <span>ส่วนลด</span>
        <span>-{formatCurrency(cart.discountAmount)}</span>
      </div>
    {/if}

    <!-- Total -->
    <div class="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
      <span class="text-lg font-semibold">ยอดรวม</span>
      <span class="text-2xl font-bold text-primary-600">
        {formatCurrency(cart.total)}
      </span>
    </div>
  </div>

  <!-- Actions -->
  <div class="p-4 pt-0 grid grid-cols-3 gap-2">
    <Button variant="outline" size="md" class="col-span-1">
      <Tag class="h-4 w-4" />
      ส่วนลด
    </Button>
    <Button variant="outline" size="md" class="col-span-1">
      <StickyNote class="h-4 w-4" />
      โน้ต
    </Button>
    <Button variant="outline" size="md" class="col-span-1">
      <User class="h-4 w-4" />
      ลูกค้า
    </Button>
  </div>

  <!-- Pay Button -->
  <div class="p-4 pt-0">
    <Button
      size="xl"
      fullWidth
      onclick={handlePay}
      disabled={cart.isEmpty}
      class="text-lg"
    >
      <CreditCard class="h-5 w-5" />
      ชำระเงิน
    </Button>
  </div>
</div>
```

### NumPad Component (src/lib/components/pos/NumPad.svelte)
```svelte
<script lang="ts">
  import { Button } from '$components/ui/button';
  import { Delete, Check, X } from 'lucide-svelte';

  interface Props {
    value?: string;
    onSubmit?: (value: number) => void;
    onCancel?: () => void;
  }

  let { value = $bindable(''), onSubmit, onCancel }: Props = $props();

  function handleKey(key: string) {
    if (key === 'backspace') {
      value = value.slice(0, -1);
    } else if (key === 'clear') {
      value = '';
    } else if (key === '.') {
      if (!value.includes('.')) {
        value = value + key;
      }
    } else {
      value = value + key;
    }
  }

  function handleSubmit() {
    const num = parseFloat(value || '0');
    onSubmit?.(num);
    value = '';
  }

  const keys = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['.', '0', 'backspace'],
  ];
</script>

<div class="bg-gray-50 dark:bg-gray-900 rounded-2xl p-4">
  <!-- Display -->
  <div class="mb-4 p-4 bg-white dark:bg-gray-800 rounded-xl text-right">
    <span class="text-3xl font-mono font-bold">
      {value || '0'}
    </span>
  </div>

  <!-- Keypad -->
  <div class="grid grid-cols-3 gap-2">
    {#each keys as row}
      {#each row as key}
        <button
          type="button"
          onclick={() => handleKey(key)}
          class="pos-numpad-btn"
        >
          {#if key === 'backspace'}
            <Delete class="h-6 w-6" />
          {:else}
            {key}
          {/if}
        </button>
      {/each}
    {/each}
  </div>

  <!-- Actions -->
  <div class="mt-4 grid grid-cols-2 gap-2">
    <Button variant="outline" size="lg" onclick={onCancel}>
      <X class="h-5 w-5 mr-2" />
      ยกเลิก
    </Button>
    <Button variant="primary" size="lg" onclick={handleSubmit}>
      <Check class="h-5 w-5 mr-2" />
      ตกลง
    </Button>
  </div>
</div>
```

═══════════════════════════════════════════════════════════════════════════════
## 📄 PAGE LAYOUTS
═══════════════════════════════════════════════════════════════════════════════

### Root Layout (src/routes/+layout.svelte)
```svelte
<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { Toaster } from 'svelte-sonner';
  import '../app.css';

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60, // 1 minute
        gcTime: 1000 * 60 * 10, // 10 minutes
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  let { children } = $props();
</script>

<QueryClientProvider client={queryClient}>
  {@render children()}
  <Toaster position="top-right" richColors />
</QueryClientProvider>
```

### App Layout (src/routes/(app)/+layout.svelte)
```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { uiStore } from '$stores/ui.svelte';
  import Sidebar from '$components/layout/Sidebar.svelte';
  import Header from '$components/layout/Header.svelte';

  let { children } = $props();
</script>

<div class="flex h-screen bg-gray-50 dark:bg-gray-900">
  <!-- Sidebar -->
  <Sidebar />

  <!-- Main Content -->
  <div class="flex flex-1 flex-col overflow-hidden">
    <!-- Header -->
    <Header />

    <!-- Page Content -->
    <main class="flex-1 overflow-auto">
      {@render children()}
    </main>
  </div>
</div>
```

### POS Page (src/routes/(app)/pos/+page.svelte)
```svelte
<script lang="ts">
  import { createCartStore } from '$stores/cart.svelte';
  import { useProducts, useCategories } from '$stores/products.svelte';
  import { posStore } from '$stores/pos.svelte';
  import ProductGrid from '$components/pos/ProductGrid.svelte';
  import CartPanel from '$components/pos/CartPanel.svelte';
  import CategoryTabs from '$components/pos/CategoryTabs.svelte';
  import QuickSearch from '$components/pos/QuickSearch.svelte';
  import BarcodeScanner from '$components/pos/BarcodeScanner.svelte';

  // Create cart store for this page
  const cart = createCartStore();

  // Queries
  const products = useProducts({ 
    category: posStore.activeCategory,
    search: posStore.searchQuery 
  });
  const categories = useCategories();

  function handleBarcodeScanned(barcode: string) {
    const product = $products.data?.find(p => p.barcode === barcode);
    if (product) {
      cart.addItem(product);
    } else {
      toast.error('ไม่พบสินค้า', { description: `บาร์โค้ด: ${barcode}` });
    }
  }
</script>

<svelte:head>
  <title>ขายสินค้า | KAILO POS</title>
</svelte:head>

<!-- Barcode Scanner (hidden, listens for input) -->
<BarcodeScanner onScan={handleBarcodeScanned} />

<div class="flex h-full">
  <!-- Products Panel -->
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Search & Categories -->
    <div class="p-4 space-y-4 border-b border-gray-200 dark:border-gray-700">
      <QuickSearch
        value={posStore.searchQuery}
        onInput={(e) => posStore.searchQuery = e.currentTarget.value}
        placeholder="ค้นหาสินค้า หรือสแกนบาร์โค้ด..."
      />
      
      {#if $categories.data}
        <CategoryTabs
          categories={$categories.data}
          activeId={posStore.activeCategory}
          onChange={(id) => posStore.activeCategory = id}
        />
      {/if}
    </div>

    <!-- Product Grid -->
    <div class="flex-1 overflow-auto p-4">
      {#if $products.isLoading}
        <div class="pos-product-grid">
          {#each Array(12) as _}
            <div class="h-36 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          {/each}
        </div>
      {:else if $products.data}
        <ProductGrid products={$products.data} />
      {/if}
    </div>
  </div>

  <!-- Cart Panel -->
  <div class="w-[380px] flex-shrink-0">
    <CartPanel />
  </div>
</div>
```

═══════════════════════════════════════════════════════════════════════════════
## 🔌 REAL-TIME INTEGRATION
═══════════════════════════════════════════════════════════════════════════════

### Socket.io Client (src/lib/hooks/useSocket.svelte.ts)
```typescript
import { io, Socket } from 'socket.io-client';
import { onMount, onDestroy } from 'svelte';
import { authStore } from '$stores/auth.svelte';

let socket: Socket | null = null;

export function useSocket() {
  let connected = $state(false);

  onMount(() => {
    socket = io(import.meta.env.VITE_WS_URL || 'ws://localhost:5000', {
      auth: {
        token: authStore.token,
      },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      connected = true;
      console.log('Socket connected');
    });

    socket.on('disconnect', () => {
      connected = false;
      console.log('Socket disconnected');
    });

    // Join branch room
    if (authStore.user?.branchId) {
      socket.emit('join:branch', authStore.user.branchId);
    }
  });

  onDestroy(() => {
    socket?.disconnect();
  });

  function emit(event: string, data?: unknown) {
    socket?.emit(event, data);
  }

  function on(event: string, callback: (data: unknown) => void) {
    socket?.on(event, callback);
    return () => socket?.off(event, callback);
  }

  return {
    get connected() { return connected; },
    emit,
    on,
  };
}

// Event handlers for POS updates
export function usePOSEvents() {
  const socket = useSocket();
  const queryClient = useQueryClient();

  $effect(() => {
    if (!socket.connected) return;

    // Stock updates
    const unsubStock = socket.on('stock:updated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    });

    // New order (for kitchen display)
    const unsubOrder = socket.on('order:new', (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    });

    // Table updates
    const unsubTable = socket.on('table:updated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
    });

    return () => {
      unsubStock();
      unsubOrder();
      unsubTable();
    };
  });
}
```

═══════════════════════════════════════════════════════════════════════════════
## 📴 OFFLINE SUPPORT (PWA)
═══════════════════════════════════════════════════════════════════════════════

### Offline Store (src/lib/stores/offline.svelte.ts)
```typescript
import { get, set, del, entries } from 'idb-keyval';

interface OfflineTransaction {
  id: string;
  type: 'sale' | 'refund' | 'adjustment';
  data: unknown;
  createdAt: string;
  synced: boolean;
}

class OfflineStore {
  isOnline = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);
  pendingCount = $state(0);
  syncing = $state(false);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
      this.loadPendingCount();
    }
  }

  private handleOnline() {
    this.isOnline = true;
    this.syncPending();
  }

  private handleOffline() {
    this.isOnline = false;
  }

  private async loadPendingCount() {
    const all = await entries<string, OfflineTransaction>();
    this.pendingCount = all.filter(([_, v]) => !v.synced).length;
  }

  async queueTransaction(type: 'sale' | 'refund' | 'adjustment', data: unknown) {
    const transaction: OfflineTransaction = {
      id: crypto.randomUUID(),
      type,
      data,
      createdAt: new Date().toISOString(),
      synced: false,
    };

    await set(`offline:${transaction.id}`, transaction);
    this.pendingCount++;

    if (this.isOnline) {
      this.syncPending();
    }

    return transaction.id;
  }

  async syncPending() {
    if (this.syncing || !this.isOnline) return;

    this.syncing = true;

    try {
      const all = await entries<string, OfflineTransaction>();
      const pending = all.filter(([_, v]) => !v.synced);

      for (const [key, transaction] of pending) {
        try {
          // Send to API based on type
          switch (transaction.type) {
            case 'sale':
              await api.sales.create(transaction.data);
              break;
            case 'refund':
              await api.sales.refund(transaction.data);
              break;
            case 'adjustment':
              await api.stock.adjust(transaction.data);
              break;
          }

          // Mark as synced
          await set(key, { ...transaction, synced: true });
          this.pendingCount--;

          // Clean up old synced transactions
          await del(key);
        } catch (error) {
          console.error('Failed to sync transaction:', transaction.id, error);
        }
      }
    } finally {
      this.syncing = false;
    }
  }
}

export const offlineStore = new OfflineStore();
```

═══════════════════════════════════════════════════════════════════════════════
## 🎨 UI SCREENS REFERENCE
═══════════════════════════════════════════════════════════════════════════════

### POS Screen Layout
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ HEADER: Logo | Search Bar | Shift Info | User Menu                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                           │                 │
│  CATEGORIES: [ทั้งหมด] [อาหาร] [เครื่องดื่ม] [ขนม]...      │   CART PANEL   │
│                                                           │                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │  ┌───────────┐  │
│  │ Product │ │ Product │ │ Product │ │ Product │          │  │ Cart Item │  │
│  │  Card   │ │  Card   │ │  Card   │ │  Card   │          │  ├───────────┤  │
│  │  ฿99    │ │  ฿149   │ │  ฿59    │ │  ฿199   │          │  │ Cart Item │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │  ├───────────┤  │
│                                                           │  │ Cart Item │  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │  └───────────┘  │
│  │ Product │ │ Product │ │ Product │ │ Product │          │                 │
│  │  Card   │ │  Card   │ │  Card   │ │  Card   │          │  ─────────────  │
│  │  ฿89    │ │  ฿129   │ │  ฿79    │ │  ฿299   │          │  Subtotal: ฿XX  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │  Discount: -฿XX │
│                                                           │  ─────────────  │
│  PRODUCTS GRID                                            │  TOTAL: ฿XXX    │
│                                                           │                 │
│                                                           │  [ส่วนลด][โน้ต] │
│                                                           │  ┌─────────────┐│
│                                                           │  │ ชำระเงิน    ││
│                                                           │  └─────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Restaurant Table View
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ HEADER: Logo | Floor Select | Search | Notifications | User                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Floor: [ชั้น 1] [ชั้น 2] [ระเบียง]            Filter: [ว่าง] [มีลูกค้า]    │
│                                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │  T1     │ │  T2     │ │  T3     │ │  T4     │ │  T5     │ │  T6     │   │
│  │ 🟢 ว่าง │ │ 🔴 ใช้งาน│ │ 🟢 ว่าง │ │ 🟡 จอง  │ │ 🔴 ใช้งาน│ │ 🟢 ว่าง │   │
│  │         │ │ ฿1,250  │ │         │ │ 18:00   │ │ ฿890    │ │         │   │
│  │         │ │ 45 นาที │ │         │ │ 4 คน    │ │ 30 นาที │ │         │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│                                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │  T7     │ │  T8     │ │  T9     │ │  T10    │ │  T11    │ │  T12    │   │
│  │ 🟢 ว่าง │ │ 🟢 ว่าง │ │ 🔴 ใช้งาน│ │ 🟢 ว่าง │ │ 🟢 ว่าง │ │ 🔴 ใช้งาน│   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│                                                                             │
│  LEGEND: 🟢 Available  🔴 Occupied  🟡 Reserved  🟠 Ordering               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

═══════════════════════════════════════════════════════════════════════════════
## 📦 PACKAGE.JSON
═══════════════════════════════════════════════════════════════════════════════

```json
{
  "name": "kpos",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
    "lint": "eslint . --ext .ts,.svelte",
    "format": "prettier --write .",
    "test": "vitest",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@sveltejs/adapter-auto": "^3.0.0",
    "@sveltejs/kit": "^2.0.0",
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "prettier-plugin-svelte": "^3.0.0",
    "svelte": "^5.0.0",
    "svelte-check": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^6.0.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.40.0"
  },
  "dependencies": {
    "@tanstack/svelte-query": "^5.0.0",
    "bits-ui": "^1.0.0",
    "chart.js": "^4.4.0",
    "clsx": "^2.0.0",
    "date-fns": "^3.0.0",
    "html5-qrcode": "^2.3.0",
    "idb-keyval": "^6.2.0",
    "ky": "^1.2.0",
    "lucide-svelte": "^0.460.0",
    "socket.io-client": "^4.7.0",
    "svelte-motion": "^0.12.0",
    "svelte-sonner": "^0.3.0",
    "tailwind-merge": "^2.0.0",
    "tailwind-variants": "^0.3.0",
    "zod": "^3.22.0"
  }
}
```

═══════════════════════════════════════════════════════════════════════════════
## 🚀 GETTING STARTED
═══════════════════════════════════════════════════════════════════════════════

```bash
# Create project
bunx create-svelte@latest kpos
cd kpos

# Install dependencies
bun install

# Add Tailwind CSS v4
bun add -D tailwindcss @tailwindcss/vite

# Add other dependencies
bun add @tanstack/svelte-query socket.io-client lucide-svelte \
  zod date-fns chart.js idb-keyval ky svelte-sonner \
  tailwind-variants clsx tailwind-merge bits-ui

# Start development
bun run dev
```

═══════════════════════════════════════════════════════════════════════════════
## 📜 CONVENTIONS & BEST PRACTICES
═══════════════════════════════════════════════════════════════════════════════

### File Naming
- Components: `PascalCase.svelte`
- Stores: `camelCase.svelte.ts`
- Utils: `camelCase.ts`
- Types: `camelCase.ts`

### Component Guidelines
- Use Svelte 5 Runes (`$state`, `$derived`, `$effect`, `$props`)
- Keep components focused and single-responsibility
- Extract reusable logic into hooks
- Use TypeScript for all files

### State Management
- Local state: `$state` rune
- Computed values: `$derived` rune
- Side effects: `$effect` rune
- Global state: Svelte stores or context
- Server state: TanStack Query

### Performance
- Use `{#key}` blocks for dynamic lists
- Implement virtual scrolling for long lists
- Lazy load routes and components
- Optimize images with lazy loading
- Use skeleton loaders for better UX

---
*Last Updated: January 2026*
*Version: 1.0.0*
