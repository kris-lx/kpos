import { SYSTEM_ROLE_PERMISSIONS } from './systemRolePermissions';

export type DefaultRole = {
    name: string;
    displayName: string;
    description: string;
    permissions: string[];
    isSystem: true;
};

export type DefaultRule = {
    name: string;
    displayName: string;
    description: string;
    module: string;
    icon: string;
    routes: string[];
    permissions: string[];
    order: number;
    isSystem: true;
};

export type CrudFlags = { r: boolean; c: boolean; u: boolean; d: boolean };

const unique = (items: string[]) => Array.from(new Set(items));

const permissionSet = (roleName: keyof typeof SYSTEM_ROLE_PERMISSIONS) =>
    SYSTEM_ROLE_PERMISSIONS[roleName] ?? [];

const adminPermissions = unique([
    ...permissionSet('merchant_owner'),
    'admin:access',
    'admin:view',
    'admin:manage',
]);

export const DEFAULT_ROLES: DefaultRole[] = [
    { name: 'super_admin', displayName: 'Super Admin', description: 'Full platform access', permissions: ['*'], isSystem: true },
    { name: 'admin', displayName: 'Admin', description: 'Platform admin with tenant operations access', permissions: adminPermissions, isSystem: true },

    // Canonical tenant roles
    { name: 'merchant_owner', displayName: 'Merchant Owner', description: 'Full tenant control; replaces hq_admin/store_owner for new tenants', permissions: permissionSet('merchant_owner'), isSystem: true },
    { name: 'merchant_manager', displayName: 'Merchant Manager', description: 'Cross-branch management; replaces hq_manager for new tenants', permissions: permissionSet('merchant_manager'), isSystem: true },
    { name: 'accountant', displayName: 'Accountant', description: 'Financial and report access', permissions: permissionSet('accountant'), isSystem: true },
    { name: 'supervisor', displayName: 'Supervisor', description: 'Branch-scoped operations; replaces branch_admin/store_manager for new tenants', permissions: permissionSet('supervisor'), isSystem: true },
    { name: 'senior_cashier', displayName: 'Senior Cashier', description: 'POS cashier with discount and refund ability', permissions: permissionSet('senior_cashier'), isSystem: true },

    // Legacy roles kept for backward compatibility
    { name: 'hq_admin', displayName: 'HQ Admin', description: 'Legacy cross-branch admin', permissions: permissionSet('hq_admin'), isSystem: true },
    { name: 'hq_manager', displayName: 'HQ Manager', description: 'Legacy read-heavy HQ manager', permissions: permissionSet('hq_manager'), isSystem: true },
    { name: 'store_owner', displayName: 'Store Owner', description: 'Legacy store owner', permissions: permissionSet('store_owner'), isSystem: true },
    { name: 'branch_admin', displayName: 'Branch Admin', description: 'Legacy branch administrator', permissions: permissionSet('branch_admin'), isSystem: true },
    { name: 'branch_manager', displayName: 'Branch Manager', description: 'Legacy branch manager', permissions: permissionSet('branch_manager'), isSystem: true },
    { name: 'store_manager', displayName: 'Store Manager', description: 'Legacy single-store manager', permissions: permissionSet('store_manager'), isSystem: true },
    { name: 'store_admin', displayName: 'Store Admin', description: 'Legacy store admin alias', permissions: permissionSet('store_admin'), isSystem: true },
    { name: 'cashier', displayName: 'Cashier', description: 'POS cashier', permissions: permissionSet('cashier'), isSystem: true },
    { name: 'inventory_staff', displayName: 'Inventory Staff', description: 'Warehouse/inventory staff', permissions: permissionSet('inventory_staff'), isSystem: true },
    { name: 'kitchen_staff', displayName: 'Kitchen Staff', description: 'Kitchen display staff', permissions: permissionSet('kitchen_staff'), isSystem: true },
    { name: 'waiter', displayName: 'Waiter', description: 'Restaurant waiter', permissions: permissionSet('waiter'), isSystem: true },
    { name: 'staff', displayName: 'Staff', description: 'Basic staff role', permissions: permissionSet('staff'), isSystem: true },
    { name: 'manager', displayName: 'Manager', description: 'Branch manager (legacy alias for branch_manager)', permissions: permissionSet('manager'), isSystem: true },
];

export const DEFAULT_RULES: DefaultRule[] = [
    { name: 'dashboard', displayName: 'Dashboard', description: 'Main dashboard', module: 'dashboard', icon: 'LayoutDashboard', routes: ['/dashboard'], permissions: ['dashboard:view'], order: 0, isSystem: true },
    { name: 'sales', displayName: 'Sales (POS)', description: 'POS sales, credit sales, and held bills', module: 'sales', icon: 'ShoppingCart', routes: ['/pos', '/pos/credit', '/pos/held'], permissions: ['sales:view', 'sales:create', 'sales:update', 'sales:delete', 'sales:void', 'sales:refund', 'pos:access', 'pos:discount', 'pos:void', 'pos:credit'], order: 1, isSystem: true },
    { name: 'products', displayName: 'Products', description: 'Products, categories, barcode, SKU, and pricing', module: 'products', icon: 'Package', routes: ['/products', '/products/sku', '/products/pricing', '/categories', '/barcode'], permissions: ['products:view', 'products:create', 'products:update', 'products:delete', 'products:import', 'categories:view', 'categories:create', 'categories:update', 'categories:delete'], order: 2, isSystem: true },
    { name: 'inventory', displayName: 'Inventory', description: 'Inventory, stock in/out, adjustments, transfers, counts, purchase orders, vendors, expiry', module: 'inventory', icon: 'Boxes', routes: ['/inventory', '/inventory/stockin', '/inventory/stockout', '/inventory/adjust', '/inventory/transfer', '/inventory/count', '/inventory/purchase-orders', '/inventory/vendors', '/inventory/expiry', '/inventory/out-of-stock'], permissions: ['inventory:view', 'inventory:create', 'inventory:update', 'inventory:delete', 'inventory:transfer', 'inventory:adjust', 'inventory:stockin', 'inventory:stockout'], order: 3, isSystem: true },
    { name: 'restaurant', displayName: 'Restaurant', description: 'Tables, restaurant orders, kitchen, reservations, and e-menu', module: 'restaurant', icon: 'UtensilsCrossed', routes: ['/restaurant/tables', '/restaurant/orders', '/restaurant/kitchen', '/restaurant/reservations', '/restaurant/e-menu'], permissions: ['restaurant:view', 'restaurant:manage', 'tables:view', 'tables:create', 'tables:update', 'tables:delete'], order: 4, isSystem: true },
    { name: 'promotions', displayName: 'Promotions', description: 'Promotions, coupons, and discounts', module: 'promotions', icon: 'Gift', routes: ['/promotions', '/promotions/coupons', '/promotions/discounts'], permissions: ['promotions:view', 'promotions:create', 'promotions:update', 'promotions:delete'], order: 5, isSystem: true },
    { name: 'customers', displayName: 'Customers (CRM)', description: 'Customers, members, points, and loyalty', module: 'customers', icon: 'Users', routes: ['/customers', '/customers/members', '/customers/points', '/customers/loyalty'], permissions: ['customers:view', 'customers:create', 'customers:update', 'customers:delete'], order: 6, isSystem: true },
    { name: 'payments', displayName: 'Payments', description: 'Payment methods, transactions, and settlements', module: 'payments', icon: 'Wallet', routes: ['/payments', '/payments/transactions', '/payments/settlements'], permissions: ['payments:view', 'payments:create', 'payments:void', 'payments:settle', 'payments:manage'], order: 7, isSystem: true },
    { name: 'documents', displayName: 'Documents', description: 'Documents, invoice design, invoices, and tax invoices', module: 'documents', icon: 'FileText', routes: ['/documents', '/documents/design', '/documents/invoices', '/documents/tax-invoices'], permissions: ['documents:view', 'documents:create', 'documents:update', 'documents:delete'], order: 8, isSystem: true },
    { name: 'reports', displayName: 'Reports', description: 'Sales, product, inventory, financial, staff, customer, promotion, branch, period, and GL reports', module: 'reports', icon: 'BarChart3', routes: ['/reports', '/reports/products', '/reports/inventory', '/reports/financial', '/reports/staff', '/reports/customers', '/reports/promotions', '/reports/period-compare', '/reports/branch-compare', '/reports/gl'], permissions: ['reports:view', 'reports:export', 'reports:sales', 'reports:inventory', 'reports:financial', 'reports:staff'], order: 9, isSystem: true },
    { name: 'branches', displayName: 'Branch Management', description: 'Branch management', module: 'branches', icon: 'Building2', routes: ['/branches'], permissions: ['branches:view', 'branches:create', 'branches:update', 'branches:delete'], order: 10, isSystem: true },
    { name: 'management.stores', displayName: 'Store Management', description: 'Stores and points of sale', module: 'management.stores', icon: 'Store', routes: ['/management/stores', '/my-store', '/store-request'], permissions: ['stores:view', 'stores:create', 'stores:update', 'stores:delete', 'stores:assign'], order: 11, isSystem: true },
    { name: 'management.staff', displayName: 'Staff Management', description: 'Staff and shifts', module: 'management.staff', icon: 'UserCog', routes: ['/staff', '/staff/shifts', '/management/shifts'], permissions: ['staff:view', 'staff:create', 'staff:update', 'staff:delete'], order: 12, isSystem: true },
    { name: 'management.roles', displayName: 'Role Management', description: 'Roles and permissions', module: 'management.roles', icon: 'Shield', routes: ['/staff/roles'], permissions: ['roles:view', 'roles:create', 'roles:update', 'roles:delete'], order: 13, isSystem: true },
    { name: 'management.operations', displayName: 'Daily Operations', description: 'Cash registers and daily store operations', module: 'management.operations', icon: 'Monitor', routes: ['/management/cashregisters'], permissions: ['stores:view', 'stores:update'], order: 14, isSystem: true },
    { name: 'settings', displayName: 'Settings', description: 'General, display, receipt, tax, payment, printer, notification, integration, and profile settings', module: 'settings', icon: 'Settings', routes: ['/settings', '/settings/display', '/settings/receipt', '/settings/tax', '/settings/payments', '/settings/printers', '/settings/notifications', '/settings/integrations', '/settings/profile'], permissions: ['settings:view', 'settings:update'], order: 15, isSystem: true },
    { name: 'admin', displayName: 'Super Admin', description: 'Platform administration panel', module: 'admin', icon: 'ShieldCheck', routes: ['/admin', '/admin/stores', '/admin/requests', '/admin/branches', '/admin/users', '/admin/roles', '/admin/positions', '/admin/rules', '/admin/audit', '/admin/permissions', '/admin/enums'], permissions: ['*', 'admin:access', 'admin:view', 'admin:manage'], order: 16, isSystem: true },
];

const allRules = (exclude: string[] = []): Record<string, CrudFlags> =>
    Object.fromEntries(DEFAULT_RULES.filter((rule) => !exclude.includes(rule.name)).map((rule) => [rule.name, { r: true, c: true, u: true, d: true }]));

export const DEFAULT_ROLE_RULES: Record<string, Record<string, CrudFlags>> = {
    super_admin: allRules(),
    admin: allRules(['admin', 'sales']),
    hq_admin: allRules(['admin']),
    merchant_owner: allRules(['admin']),

    merchant_manager: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: false },
        inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false },
        promotions: { r: true, c: true, u: true, d: false },
        customers: { r: true, c: true, u: true, d: false },
        payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: true, d: false },
        reports: { r: true, c: false, u: false, d: false },
        branches: { r: true, c: false, u: true, d: false },
        'management.stores': { r: true, c: false, u: true, d: false },
        'management.staff': { r: true, c: true, u: true, d: false },
        'management.roles': { r: true, c: true, u: true, d: false },
        'management.operations': { r: true, c: false, u: true, d: false },
        settings: { r: true, c: false, u: true, d: false },
    },
    accountant: {
        dashboard: { r: true, c: false, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        payments: { r: true, c: false, u: false, d: false },
        documents: { r: true, c: false, u: false, d: false },
    },
    supervisor: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: true },
        inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false },
        promotions: { r: true, c: true, u: false, d: false },
        customers: { r: true, c: true, u: true, d: false },
        payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        'management.stores': { r: true, c: false, u: true, d: false },
        'management.staff': { r: true, c: true, u: true, d: false },
        'management.operations': { r: true, c: false, u: true, d: false },
        settings: { r: true, c: false, u: true, d: false },
    },
    senior_cashier: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: false, d: false },
        products: { r: true, c: false, u: false, d: false },
        customers: { r: true, c: false, u: false, d: false },
        payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: false, u: false, d: false },
    },

    hq_manager: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: false, u: false, d: false },
        products: { r: true, c: false, u: false, d: false },
        inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: false, u: false, d: false },
        promotions: { r: true, c: false, u: false, d: false },
        customers: { r: true, c: false, u: false, d: false },
        payments: { r: true, c: false, u: false, d: false },
        documents: { r: true, c: false, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        branches: { r: true, c: false, u: false, d: false },
        'management.stores': { r: true, c: false, u: false, d: false },
        'management.staff': { r: true, c: false, u: false, d: false },
        'management.operations': { r: true, c: false, u: false, d: false },
        settings: { r: true, c: false, u: false, d: false },
    },
    store_owner: {
        dashboard: { r: true, c: false, u: false, d: false }, sales: { r: true, c: true, u: true, d: true },
        products: { r: true, c: true, u: true, d: true }, inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false }, promotions: { r: true, c: true, u: true, d: true },
        customers: { r: true, c: true, u: true, d: false }, payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false }, reports: { r: true, c: false, u: false, d: false },
        branches: { r: true, c: false, u: true, d: false },
        'management.stores': { r: true, c: true, u: true, d: true }, 'management.staff': { r: true, c: true, u: true, d: true },
        'management.roles': { r: true, c: false, u: false, d: false }, 'management.operations': { r: true, c: true, u: true, d: false },
        settings: { r: true, c: false, u: true, d: false },
    },
    branch_admin: {
        dashboard: { r: true, c: false, u: false, d: false }, sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: true }, inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false }, promotions: { r: true, c: true, u: true, d: false },
        customers: { r: true, c: true, u: true, d: false }, payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false }, reports: { r: true, c: false, u: false, d: false },
        branches: { r: true, c: false, u: true, d: false },
        'management.stores': { r: true, c: false, u: true, d: false }, 'management.staff': { r: true, c: true, u: true, d: false },
        'management.operations': { r: true, c: false, u: true, d: false }, settings: { r: true, c: false, u: true, d: false },
    },
    branch_manager: {
        dashboard: { r: true, c: false, u: false, d: false }, sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: true }, inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false }, promotions: { r: true, c: false, u: false, d: false },
        customers: { r: true, c: true, u: true, d: false }, payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false }, reports: { r: true, c: false, u: false, d: false },
        'management.staff': { r: true, c: false, u: false, d: false }, 'management.operations': { r: true, c: false, u: false, d: false },
    },
    store_manager: {
        dashboard: { r: true, c: false, u: false, d: false }, sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: true }, inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false }, promotions: { r: true, c: false, u: false, d: false },
        customers: { r: true, c: true, u: true, d: false }, payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false }, reports: { r: true, c: false, u: false, d: false },
        'management.staff': { r: true, c: true, u: false, d: false }, 'management.operations': { r: true, c: false, u: false, d: false },
        settings: { r: true, c: false, u: false, d: false },
    },
    store_admin: {
        dashboard: { r: true, c: false, u: false, d: false }, sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: true }, inventory: { r: true, c: true, u: true, d: false },
        customers: { r: true, c: true, u: true, d: false }, payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false }, reports: { r: true, c: false, u: false, d: false },
        'management.staff': { r: true, c: true, u: true, d: false },
        'management.roles': { r: true, c: false, u: false, d: false },
        promotions: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false },
        settings: { r: true, c: false, u: true, d: false },
    },
    cashier: {
        dashboard: { r: true, c: false, u: false, d: false }, sales: { r: true, c: true, u: false, d: false },
        products: { r: true, c: false, u: false, d: false }, customers: { r: true, c: false, u: false, d: false },
        payments: { r: true, c: true, u: false, d: false }, documents: { r: true, c: false, u: false, d: false },
    },
    inventory_staff: {
        dashboard: { r: true, c: false, u: false, d: false }, products: { r: true, c: false, u: false, d: false },
        inventory: { r: true, c: true, u: true, d: false }, reports: { r: true, c: false, u: false, d: false },
    },
    kitchen_staff: { restaurant: { r: true, c: true, u: true, d: false } },
    waiter: { restaurant: { r: true, c: true, u: true, d: false }, sales: { r: true, c: true, u: false, d: false }, customers: { r: true, c: false, u: false, d: false } },
    staff: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: false, d: false },
        products: { r: true, c: false, u: false, d: false },
        customers: { r: true, c: false, u: false, d: false },
        payments: { r: true, c: true, u: false, d: false },
        settings: { r: true, c: false, u: true, d: false },
    },
    manager: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: true },
        inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false },
        promotions: { r: true, c: true, u: false, d: false },
        customers: { r: true, c: true, u: true, d: false },
        payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        'management.staff': { r: true, c: true, u: false, d: false },
        'management.operations': { r: true, c: false, u: false, d: false },
        settings: { r: true, c: false, u: false, d: false },
    },
};
