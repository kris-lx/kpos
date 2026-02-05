# KPOS Frontend

SvelteKit 2.x + Svelte 5 Runes frontend สำหรับระบบ POS

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview
```

## 📁 Project Structure

```
src/
├── lib/
│   ├── api/           # API client (Ky HTTP client)
│   ├── stores/        # Svelte 5 Runes stores
│   ├── utils/         # Utility functions
│   ├── types/         # TypeScript types
│   └── components/    # Reusable UI components
├── routes/
│   ├── +layout.svelte # Root layout
│   ├── +page.svelte   # Home/redirect page
│   ├── login/         # Login page
│   └── (app)/         # Authenticated app routes
│       ├── pos/       # POS screen
│       ├── products/  # Products management
│       ├── categories/# Categories management
│       ├── inventory/ # Inventory management
│       ├── customers/ # Customers management
│       ├── branches/  # Branches management
│       ├── reports/   # Reports & analytics
│       └── settings/  # System settings
├── app.css            # Global styles (Tailwind v4)
├── app.html           # HTML template
└── app.d.ts           # Global type declarations
```

## 🎨 Design System

Using Tailwind CSS v4 with custom design tokens:

- **Primary Colors**: Blue palette (#3b82f6 base)
- **Semantic Colors**: Success (green), Warning (amber), Error (red)
- **Typography**: Inter font family
- **Spacing**: 4px base unit
- **Border Radius**: 0.5rem to 1.5rem scale

## 📦 Key Dependencies

| Package | Purpose |
|---------|---------|
| `@sveltejs/kit` | Meta framework |
| `svelte` | UI framework (v5 with Runes) |
| `@tailwindcss/vite` | Tailwind CSS v4 |
| `ky` | HTTP client |
| `@tanstack/svelte-query` | Server state management |
| `svelte-sonner` | Toast notifications |
| `lucide-svelte` | Icons |
| `chart.js` | Charts |
| `date-fns` | Date utilities |
| `zod` | Validation |

## 🔧 Path Aliases

Configured in `svelte.config.js`:

```javascript
$lib      → src/lib
$api      → src/lib/api
$stores   → src/lib/stores
$utils    → src/lib/utils
$types    → src/lib/types
$components → src/lib/components
```

## 🌐 Environment Variables

```env
PUBLIC_API_URL=http://localhost:5000/api/v1
PUBLIC_WS_URL=ws://localhost:5000
```

## 📱 PWA Support

The app is configured as a Progressive Web App with:

- Offline support
- Install prompt
- Push notifications (coming soon)

## 🎯 Svelte 5 Runes

This project uses Svelte 5's new Runes API:

```svelte
<script lang="ts">
  // Reactive state
  let count = $state(0);
  
  // Derived values
  let doubled = $derived(count * 2);
  
  // Props
  let { name, age = 18 } = $props();
</script>
```
