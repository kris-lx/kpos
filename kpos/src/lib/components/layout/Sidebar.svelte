<script lang="ts">
    import { page } from "$app/stores";
    import { cn } from "$utils";
    import { t } from "$lib/i18n/index.svelte";
    import { auth } from "$stores";
    import { api } from "$lib/api";
    import { slide, fade } from "svelte/transition";
    import { cubicOut } from "svelte/easing";
    import { onMount } from "svelte";
    import {
        Store,
        ShoppingCart,
        Package,
        Users,
        BarChart3,
        Settings,
        LogOut,
        ChevronDown,
        Boxes,
        Tags,
        Building2,
        LayoutDashboard,
        Barcode,
        FileText,
        Gift,
        UtensilsCrossed,
        CreditCard,
        UserCog,
        Truck,
        ClipboardList,
        DollarSign,
        Percent,
        TicketPercent,
        Receipt,
        Printer,
        QrCode,
        Scale,
        Box,
        ArrowRightLeft,
        PackageSearch,
        CalendarClock,
        TrendingUp,
        TrendingDown,
        PieChart,
        FileSpreadsheet,
        Wallet,
        BellRing,
        Plug,
        Monitor,
        HelpCircle,
        Crown,
        Layers,
        ShoppingBag,
        ChefHat,
        UtensilsCrossed as TableIcon,
        ClipboardCheck,
        Timer,
        Star,
        Heart,
        PackageX,
        Shield,
        ShieldCheck,
        FileCheck,
        Key,
        History,
        type Icon,
    } from "lucide-svelte";

    interface MenuItem {
        id: string;
        name: string;
        nameKey?: string;
        href?: string;
        icon: typeof Icon;
        permission?: string;
        badge?: string | number;
        badgeColor?: string;
        children?: MenuItem[];
    }

    let { isOpen = true, onToggle } = $props<{
        isOpen?: boolean;
        onToggle?: () => void;
    }>();

    let expandedMenus = $state<Set<string>>(new Set(["sales"]));
    let heldOrdersCount = $state(0);
    let pendingCreditCount = $state(0);

    // Load held orders count
    async function loadHeldOrdersCount() {
        try {
            const response = await api.get("sales/held").json<any>();
            if (response.success && response.data) {
                heldOrdersCount = response.data.length;
            }
        } catch (err) {
            console.error("Failed to load held orders count:", err);
        }
    }

    // Load pending credit sales count
    async function loadPendingCreditCount() {
        try {
            const response = await api.get("sales/credit").json<any>();
            if (response.success && response.data) {
                // Count only pending/partial/overdue items
                pendingCreditCount = response.data.filter((s: any) => 
                    s.status === 'pending' || s.status === 'partial' || s.status === 'overdue'
                ).length;
            }
        } catch (err) {
            console.error("Failed to load pending credit count:", err);
        }
    }

    onMount(() => {
        loadHeldOrdersCount();
        loadPendingCreditCount();
        // Refresh count every 30 seconds
        const interval = setInterval(() => {
            loadHeldOrdersCount();
            loadPendingCreditCount();
        }, 30000);
        return () => clearInterval(interval);
    });

    const menuItems: MenuItem[] = [
        {
            id: "dashboard",
            name: "Dashboard",
            nameKey: "nav.dashboard",
            href: "/dashboard",
            icon: LayoutDashboard,
            permission: "dashboard:view",
        },
        {
            id: "sales",
            name: "ຂາຍ",
            nameKey: "nav.sales",
            icon: ShoppingCart,
            permission: "sales:create",
            children: [
                {
                    id: "pos",
                    name: "ໜ້າຂາຍ POS",
                    nameKey: "nav.pos",
                    href: "/pos",
                    icon: ShoppingCart,
                    permission: "sales:create",
                },
                {
                    id: "pos-fullscreen",
                    name: "ໜ້າຂາຍເຕັມຈໍ",
                    nameKey: "nav.posFullscreen",
                    href: "/pos?mode=fullscreen",
                    icon: Monitor,
                    permission: "sales:create",
                },
                {
                    id: "credit-sales",
                    name: "ຂາຍສິນເຊື່ອ",
                    nameKey: "nav.creditSales",
                    href: "/pos/credit",
                    icon: CreditCard,
                    permission: "sales:create",
                    badgeColor: "error",
                },
                {
                    id: "held-orders",
                    name: "ບິນທີ່ພັກໄວ້",
                    nameKey: "nav.heldOrders",
                    href: "/pos/held",
                    icon: ClipboardList,
                    permission: "sales:create",
                    badgeColor: "warning",
                },
                {
                    id: "customer-display",
                    name: "ຈໍລູກຄ້າ",
                    nameKey: "nav.customerDisplay",
                    href: "/display/customer",
                    icon: Monitor,
                    permission: "sales:create",
                },
            ],
        },
        {
            id: "products",
            name: "ສິນຄ້າ",
            nameKey: "nav.products",
            icon: Package,
            permission: "products:view",
            children: [
                {
                    id: "products-list",
                    name: "ລາຍການສິນຄ້າ",
                    nameKey: "nav.productsList",
                    href: "/products",
                    icon: Package,
                    permission: "products:view",
                },
                {
                    id: "categories",
                    name: "ໝວດໝູ່",
                    nameKey: "nav.categories",
                    href: "/categories",
                    icon: Tags,
                    permission: "categories:view",
                },
                {
                    id: "barcode",
                    name: "Barcode / QR Code",
                    nameKey: "nav.barcode",
                    href: "/barcode",
                    icon: Barcode,
                    permission: "products:view",
                },
                {
                    id: "sku",
                    name: "SKU / ຕົວເລືອກ",
                    nameKey: "nav.sku",
                    href: "/products/sku",
                    icon: Layers,
                    permission: "products:view",
                },
                {
                    id: "pricing",
                    name: "ລະດັບລາຄາ",
                    nameKey: "nav.pricing",
                    href: "/products/pricing",
                    icon: DollarSign,
                    permission: "products:update",
                },
            ],
        },
        {
            id: "inventory",
            name: "ສາງ",
            nameKey: "nav.inventory",
            icon: Boxes,
            permission: "inventory:view",
            children: [
                {
                    id: "stock",
                    name: "ສາງສິນຄ້າ",
                    nameKey: "nav.stock",
                    href: "/inventory",
                    icon: Boxes,
                    permission: "inventory:view",
                },
                {
                    id: "stock-in",
                    name: "ນຳເຂົ້າສິນຄ້າ",
                    nameKey: "nav.stockIn",
                    href: "/inventory/stockin",
                    icon: TrendingUp,
                    permission: "inventory:create",
                },
                {
                    id: "stock-out",
                    name: "ນຳອອກສິນຄ້າ",
                    nameKey: "nav.stockOut",
                    href: "/inventory/stockout",
                    icon: TrendingDown,
                    permission: "inventory:create",
                },
                {
                    id: "stock-adjust",
                    name: "ປັບປ່ຽນສະຕ໋ອກ",
                    nameKey: "nav.stockAdjust",
                    href: "/inventory/adjust",
                    icon: Scale,
                    permission: "inventory:update",
                },
                {
                    id: "stock-transfer",
                    name: "ໂອນຍ້າຍສິນຄ້າ",
                    nameKey: "nav.stockTransfer",
                    href: "/inventory/transfer",
                    icon: ArrowRightLeft,
                    permission: "inventory:update",
                },
                {
                    id: "stock-count",
                    name: "ກວດນັບສະຕ໋ອກ",
                    nameKey: "nav.stockCount",
                    href: "/inventory/count",
                    icon: ClipboardCheck,
                    permission: "inventory:update",
                },
                {
                    id: "purchase-orders",
                    name: "ສັ່ງຊື້ (PO)",
                    nameKey: "nav.purchaseOrders",
                    href: "/inventory/purchase-orders",
                    icon: ClipboardList,
                    permission: "inventory:create",
                },
                {
                    id: "vendors",
                    name: "ຜູ້ສະໜອງ",
                    nameKey: "nav.vendors",
                    href: "/inventory/vendors",
                    icon: Truck,
                    permission: "inventory:view",
                },
                {
                    id: "expiry",
                    name: "ວັນໝົດອາຍຸ",
                    nameKey: "nav.expiry",
                    href: "/inventory/expiry",
                    icon: CalendarClock,
                    permission: "inventory:view",
                },
                {
                    id: "out-of-stock",
                    name: "ສິນຄ້າໝົດສະຕ໋ອກ",
                    nameKey: "nav.outOfStock",
                    href: "/inventory/out-of-stock",
                    icon: PackageX,
                    permission: "inventory:view",
                    badgeColor: "error",
                },
            ],
        },
        {
            id: "restaurant",
            name: "ຮ້ານອາຫານ",
            nameKey: "nav.restaurant",
            icon: UtensilsCrossed,
            permission: "restaurant:view",
            children: [
                {
                    id: "tables",
                    name: "ໂຕະ",
                    nameKey: "nav.tables",
                    href: "/restaurant/tables",
                    icon: TableIcon,
                    permission: "restaurant:view",
                },
                {
                    id: "orders",
                    name: "ອໍເດີ",
                    nameKey: "nav.orders",
                    href: "/restaurant/orders",
                    icon: ClipboardList,
                    permission: "restaurant:view",
                },
                {
                    id: "kitchen",
                    name: "ຄົວ (KDS)",
                    nameKey: "nav.kitchen",
                    href: "/restaurant/kitchen",
                    icon: ChefHat,
                    permission: "restaurant:manage",
                },
                {
                    id: "reservations",
                    name: "ຈອງໂຕະ",
                    nameKey: "nav.reservations",
                    href: "/restaurant/reservations",
                    icon: CalendarClock,
                    permission: "restaurant:view",
                },
                {
                    id: "emenu",
                    name: "e-Menu",
                    nameKey: "nav.emenu",
                    href: "/restaurant/e-menu",
                    icon: QrCode,
                    permission: "restaurant:view",
                },
            ],
        },
        {
            id: "promotions",
            name: "ໂປຣໂມຊັ່ນ",
            nameKey: "nav.promotions",
            icon: Gift,
            permission: "promotions:view",
            children: [
                {
                    id: "promotions-list",
                    name: "ໂປຣໂມຊັ່ນ",
                    nameKey: "nav.promotionsList",
                    href: "/promotions",
                    icon: Gift,
                    permission: "promotions:view",
                },
                {
                    id: "coupons",
                    name: "ຄູປອງ",
                    nameKey: "nav.coupons",
                    href: "/promotions/coupons",
                    icon: TicketPercent,
                    permission: "promotions:view",
                },
                {
                    id: "discounts",
                    name: "ສ່ວນຫຼຸດ",
                    nameKey: "nav.discounts",
                    href: "/promotions/discounts",
                    icon: Percent,
                    permission: "promotions:view",
                },
            ],
        },
        {
            id: "crm",
            name: "ລູກຄ້າ (CRM)",
            nameKey: "nav.crm",
            icon: Users,
            permission: "customers:view",
            children: [
                {
                    id: "customers",
                    name: "ລູກຄ້າ",
                    nameKey: "nav.customers",
                    href: "/customers",
                    icon: Users,
                    permission: "customers:view",
                },
                {
                    id: "members",
                    name: "ສະມາຊິກ",
                    nameKey: "nav.members",
                    href: "/customers/members",
                    icon: Crown,
                    permission: "customers:view",
                },
                {
                    id: "points",
                    name: "ຄະແນນສະສົມ",
                    nameKey: "nav.points",
                    href: "/customers/points",
                    icon: Star,
                    permission: "customers:view",
                },
                {
                    id: "loyalty",
                    name: "ໂປຣແກຣມ Loyalty",
                    nameKey: "nav.loyalty",
                    href: "/customers/loyalty",
                    icon: Heart,
                    permission: "customers:update",
                },
            ],
        },
        {
            id: "payments",
            name: "ການຊຳລະ",
            nameKey: "nav.payments",
            icon: Wallet,
            permission: "payments:view",
            children: [
                {
                    id: "payment-methods",
                    name: "ວິທີຊຳລະ",
                    nameKey: "nav.paymentMethods",
                    href: "/payments",
                    icon: CreditCard,
                    permission: "payments:view",
                },
                {
                    id: "transactions",
                    name: "ລາຍການຊຳລະ",
                    nameKey: "nav.transactions",
                    href: "/payments/transactions",
                    icon: Receipt,
                    permission: "payments:view",
                },
                {
                    id: "settlements",
                    name: "ປິດບັນຊີ",
                    nameKey: "nav.settlements",
                    href: "/payments/settlements",
                    icon: DollarSign,
                    permission: "payments:manage",
                },
            ],
        },
        {
            id: "documents",
            name: "ເອກະສານ",
            nameKey: "nav.documents",
            icon: FileText,
            permission: "sales:view",
            children: [
                {
                    id: "receipts",
                    name: "ໃບບິນ",
                    nameKey: "nav.receipts",
                    href: "/documents",
                    icon: Receipt,
                    permission: "sales:view",
                },
                {
                    id: "receipt-design",
                    name: "ອອກແບບໃບບິນ",
                    nameKey: "nav.receiptDesign",
                    href: "/documents/design",
                    icon: Printer,
                    permission: "settings:update",
                },
                {
                    id: "invoices",
                    name: "ໃບແຈ້ງໜີ້",
                    nameKey: "nav.invoices",
                    href: "/documents/invoices",
                    icon: FileText,
                    permission: "sales:view",
                },
                {
                    id: "tax-invoices",
                    name: "ໃບກຳກັບພາສີ",
                    nameKey: "nav.taxInvoices",
                    href: "/documents/tax-invoices",
                    icon: FileSpreadsheet,
                    permission: "sales:view",
                },
            ],
        },
        {
            id: "reports",
            name: "ລາຍງານ",
            nameKey: "nav.reports",
            icon: BarChart3,
            permission: "reports:view",
            children: [
                {
                    id: "sales-report",
                    name: "ລາຍງານການຂາຍ",
                    nameKey: "nav.salesReport",
                    href: "/reports",
                    icon: BarChart3,
                    permission: "reports:view",
                },
                {
                    id: "product-report",
                    name: "ລາຍງານສິນຄ້າ",
                    nameKey: "nav.productReport",
                    href: "/reports/products",
                    icon: Package,
                    permission: "reports:view",
                },
                {
                    id: "inventory-report",
                    name: "ລາຍງານສາງ",
                    nameKey: "nav.inventoryReport",
                    href: "/reports/inventory",
                    icon: Boxes,
                    permission: "reports:view",
                },
                {
                    id: "financial-report",
                    name: "ລາຍງານການເງິນ",
                    nameKey: "nav.financialReport",
                    href: "/reports/financial",
                    icon: DollarSign,
                    permission: "reports:view",
                },
                {
                    id: "staff-report",
                    name: "ລາຍງານພະນັກງານ",
                    nameKey: "nav.staffReport",
                    href: "/reports/staff",
                    icon: UserCog,
                    permission: "reports:view",
                },
                {
                    id: "customer-report",
                    name: "ລາຍງານລູກຄ້າ",
                    nameKey: "nav.customerReport",
                    href: "/reports/customers",
                    icon: Users,
                    permission: "reports:view",
                },
            ],
        },
        // Super Admin Section - Only visible to super admins
        ...(auth.user?.isSuperAdmin ? [{
            id: "super-admin",
            name: "Super Admin",
            nameKey: "nav.superAdmin",
            icon: ShieldCheck,
            badgeColor: "badge-error",
            children: [
                {
                    id: "admin-dashboard",
                    name: "ແຜງຄວບຄຸມ",
                    nameKey: "nav.adminDashboard",
                    href: "/admin",
                    icon: Shield,
                },
                {
                    id: "admin-requests",
                    name: "ຄຳຂໍເປີດຮ້ານ",
                    nameKey: "nav.adminRequests",
                    href: "/admin/requests",
                    icon: FileCheck,
                },
                {
                    id: "admin-branches",
                    name: "ຈັດການສາຂາ",
                    nameKey: "nav.adminBranches",
                    href: "/admin/branches",
                    icon: Building2,
                },
                {
                    id: "admin-users",
                    name: "ຈັດການຜູ້ໃຊ້",
                    nameKey: "nav.adminUsers",
                    href: "/admin/users",
                    icon: Users,
                },
                {
                    id: "admin-roles",
                    name: "ຈັດການບົດບາດ",
                    nameKey: "nav.adminRoles",
                    href: "/admin/roles",
                    icon: Key,
                },
                {
                    id: "admin-permissions",
                    name: "ຈັດການສິດ",
                    nameKey: "nav.adminPermissions",
                    href: "/admin/permissions",
                    icon: Shield,
                },
                {
                    id: "admin-audit",
                    name: "ປະຫວັດການໃຊ້ງານ",
                    nameKey: "nav.adminAudit",
                    href: "/admin/audit",
                    icon: History,
                },
            ],
        }] : []),
        {
            id: "management",
            name: "ຈັດການ",
            nameKey: "nav.management",
            icon: Building2,
            permission: "staff:view",
            children: [
                {
                    id: "branches",
                    name: "ສາຂາ",
                    nameKey: "nav.branches",
                    href: "/branches",
                    icon: Building2,
                    permission: "branches:view",
                },
                {
                    id: "stores",
                    name: "ຮ້ານຄ້າ",
                    nameKey: "nav.stores",
                    href: "/management/stores",
                    icon: Store,
                    permission: "branches:view",
                },
                {
                    id: "staff",
                    name: "ພະນັກງານ",
                    nameKey: "nav.staff",
                    href: "/staff",
                    icon: UserCog,
                    permission: "staff:view",
                },
                {
                    id: "roles",
                    name: "ບົດບາດ",
                    nameKey: "nav.roles",
                    href: "/staff/roles",
                    icon: Users,
                    permission: "roles:view",
                },
                {
                    id: "cash-registers",
                    name: "ເຄື່ອງ POS",
                    nameKey: "nav.cashRegisters",
                    href: "/management/cashregisters",
                    icon: Monitor,
                    permission: "settings:view",
                },
                {
                    id: "shifts",
                    name: "ກະການເຮັດວຽກ",
                    nameKey: "nav.shifts",
                    href: "/staff/shifts",
                    icon: Timer,
                    permission: "staff:view",
                },
            ],
        },
        {
            id: "settings",
            name: "ຕັ້ງຄ່າ",
            nameKey: "nav.settings",
            icon: Settings,
            permission: "settings:view",
            children: [
                {
                    id: "general-settings",
                    name: "ຕັ້ງຄ່າທົ່ວໄປ",
                    nameKey: "nav.generalSettings",
                    href: "/settings",
                    icon: Settings,
                    permission: "settings:view",
                },
                {
                    id: "display-settings",
                    name: "ຕັ້ງຄ່າຈໍສະແດງ",
                    nameKey: "nav.displaySettings",
                    href: "/settings/display",
                    icon: Monitor,
                    permission: "settings:view",
                },
                {
                    id: "receipt-settings",
                    name: "ຕັ້ງຄ່າໃບບິນ",
                    nameKey: "nav.receiptSettings",
                    href: "/settings/receipt",
                    icon: Receipt,
                    permission: "settings:update",
                },
                {
                    id: "tax-settings",
                    name: "ຕັ້ງຄ່າພາສີ",
                    nameKey: "nav.taxSettings",
                    href: "/settings/tax",
                    icon: Percent,
                    permission: "settings:update",
                },
                {
                    id: "payment-settings",
                    name: "ຕັ້ງຄ່າການຊຳລະ",
                    nameKey: "nav.paymentSettings",
                    href: "/settings/payments",
                    icon: CreditCard,
                    permission: "settings:update",
                },
                {
                    id: "printer-settings",
                    name: "ຕັ້ງຄ່າເຄື່ອງພິມ",
                    nameKey: "nav.printerSettings",
                    href: "/settings/printers",
                    icon: Printer,
                    permission: "settings:update",
                },
                {
                    id: "notifications-settings",
                    name: "ຕັ້ງຄ່າແຈ້ງເຕືອນ",
                    nameKey: "nav.notificationsSettings",
                    href: "/settings/notifications",
                    icon: BellRing,
                    permission: "settings:view",
                },
                {
                    id: "integrations",
                    name: "ເຊື່ອມຕໍ່",
                    nameKey: "nav.integrations",
                    href: "/settings/integrations",
                    icon: Plug,
                    permission: "settings:update",
                },
            ],
        },
        {
            id: "help",
            name: "ຊ່ວຍເຫຼືອ",
            nameKey: "nav.help",
            href: "/help",
            icon: HelpCircle,
        },
    ];

    function toggleMenu(menuId: string) {
        if (expandedMenus.has(menuId)) {
            expandedMenus.delete(menuId);
        } else {
            expandedMenus.add(menuId);
        }
        expandedMenus = new Set(expandedMenus);
    }

    function isActive(href?: string): boolean {
        if (!href) return false;
        const pathname = $page.url.pathname;
        if (href === "/pos" && pathname === "/pos") return true;
        if (href !== "/pos" && pathname.startsWith(href)) return true;
        return pathname === href;
    }

    function isParentActive(item: MenuItem): boolean {
        if (item.children) {
            return item.children.some((child) => isActive(child.href));
        }
        return isActive(item.href);
    }

    function getBadgeClass(color?: string): string {
        switch (color) {
            case "error":
                return "bg-error-500 text-white";
            case "warning":
                return "bg-warning-500 text-white";
            case "success":
                return "bg-success-500 text-white";
            default:
                return "bg-primary-500 text-white";
        }
    }

    function getDynamicBadge(itemId: string): number | null {
        if (itemId === "held-orders") {
            return heldOrdersCount > 0 ? heldOrdersCount : null;
        }
        if (itemId === "credit-sales") {
            return pendingCreditCount > 0 ? pendingCreditCount : null;
        }
        return null;
    }
</script>

<aside
    class={cn(
        "flex flex-col h-full bg-white dark:bg-gray-900",
        "border-r border-gray-200 dark:border-gray-800",
        "transition-all duration-300 ease-out",
        isOpen ? "w-64" : "w-20",
    )}
>
    <!-- Logo -->
    <div
        class="flex items-center gap-3 h-16 px-4 border-b border-gray-200 dark:border-gray-800 shrink-0"
    >
        <div
            class="flex items-center justify-center w-10 h-10 rounded-xl bg-linear-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25"
        >
            <Store class="w-5 h-5" />
        </div>
        {#if isOpen}
            <div class="flex flex-col" transition:fade={{ duration: 150 }}>
                <span class="text-xl font-bold text-gray-900 dark:text-white"
                    >KPOS</span
                >
                <span class="text-xs text-gray-500 dark:text-gray-400"
                    >Enterprise POS</span
                >
            </div>
        {/if}
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
        <ul class="space-y-1">
            {#each menuItems as item}
                {#if !item.permission || auth.hasPermission(item.permission)}
                    <li>
                        {#if item.children}
                            <!-- Parent Menu with Children -->
                            <button
                                onclick={() => toggleMenu(item.id)}
                                class={cn(
                                    "flex items-center w-full gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                                    isParentActive(item)
                                        ? "bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400"
                                        : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800",
                                )}
                            >
                                <item.icon class="w-5 h-5 shrink-0" />
                                {#if isOpen}
                                    <span class="flex-1 text-left"
                                        >{item.nameKey
                                            ? t(item.nameKey)
                                            : item.name}</span
                                    >
                                    <ChevronDown
                                        class={cn(
                                            "w-4 h-4 transition-transform duration-200",
                                            expandedMenus.has(item.id)
                                                ? "rotate-180"
                                                : "",
                                        )}
                                    />
                                {/if}
                            </button>

                            <!-- Submenu -->
                            {#if isOpen && expandedMenus.has(item.id)}
                                <ul
                                    class="mt-1 ml-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-1"
                                    transition:slide={{
                                        duration: 200,
                                        easing: cubicOut,
                                    }}
                                >
                                    {#each item.children as child}
                                        {#if !child.permission || auth.hasPermission(child.permission)}
                                            <li>
                                                <a
                                                    href={child.href}
                                                    class={cn(
                                                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200",
                                                        isActive(child.href)
                                                            ? "bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400 font-medium"
                                                            : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300",
                                                    )}
                                                >
                                                    <child.icon
                                                        class="w-4 h-4 shrink-0"
                                                    />
                                                    <span class="flex-1"
                                                        >{child.nameKey
                                                            ? t(child.nameKey)
                                                            : child.name}</span
                                                    >
                                                    {#if child.badge || getDynamicBadge(child.id)}
                                                        <span
                                                            class={cn(
                                                                "px-1.5 py-0.5 text-xs font-medium rounded-full",
                                                                getBadgeClass(
                                                                    child.badgeColor,
                                                                ),
                                                            )}
                                                        >
                                                            {getDynamicBadge(child.id) ?? child.badge}
                                                        </span>
                                                    {/if}
                                                </a>
                                            </li>
                                        {/if}
                                    {/each}
                                </ul>
                            {/if}
                        {:else}
                            <!-- Single Menu Item -->
                            <a
                                href={item.href}
                                class={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                                    isActive(item.href)
                                        ? "bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400"
                                        : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800",
                                )}
                            >
                                <item.icon class="w-5 h-5 shrink-0" />
                                {#if isOpen}
                                    <span
                                        >{item.nameKey
                                            ? t(item.nameKey)
                                            : item.name}</span
                                    >
                                {/if}
                            </a>
                        {/if}
                    </li>
                {/if}
            {/each}
        </ul>
    </nav>

    <!-- User Section -->
    <div
        class="border-t border-gray-200 dark:border-gray-800 p-3 shrink-0"
    >
        <div
            class={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl",
                "bg-gray-50 dark:bg-gray-800/50",
            )}
        >
            <div
                class="w-9 h-9 rounded-full bg-linear-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-medium"
            >
                {auth.user?.name?.charAt(0) || "U"}
            </div>
            {#if isOpen}
                <div class="flex-1 min-w-0">
                    <p
                        class="text-sm font-medium text-gray-900 dark:text-white truncate"
                    >
                        {auth.user?.name || "User"}
                    </p>
                    <p
                        class="text-xs text-gray-500 dark:text-gray-400 truncate"
                    >
                        {auth.user?.email || ""}
                    </p>
                </div>
            {/if}
        </div>
    </div>
</aside>
