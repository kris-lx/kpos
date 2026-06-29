<script lang="ts">
    import { t } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { formatCurrency, formatDate } from "$lib/utils";
    import { toast } from "svelte-sonner";
    import MoneyInput from "$lib/components/MoneyInput.svelte";
    import {
        Plus,
        Tag,
        Edit,
        Trash2,
        X,
        Loader2,
        DollarSign,
        Percent,
        Package,
        Calendar,
        ChevronLeft,
        ChevronRight,
        AlertCircle,
        RefreshCw,
        Search,
        Eye,
        Copy,
        Layers,
        TrendingUp,
        TrendingDown,
        Check,
        Star,
        Users,
        Hash,
    } from "lucide-svelte";

    // Types
    interface PriceLevel {
        id: string;
        name: string;
        description: string | null;
        isDefault: boolean;
        createdAt: string;
        updatedAt: string;
        products?: ProductPriceLevel[];
    }

    interface ProductPriceLevel {
        id: string;
        productId: string;
        priceLevelId: string;
        price: number;
        product?: {
            id: string;
            name: string;
            sku: string | null;
            price: number;
        };
    }

    interface Product {
        id: string;
        name: string;
        sku: string | null;
        price: number;
        cost: number;
    }

    // State - Price Levels
    let priceLevels = $state<PriceLevel[]>([]);
    let products = $state<Product[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let activeTab = $state<"levels" | "products">("levels");

    // Modal state
    let showLevelModal = $state(false);
    let showPriceModal = $state(false);
    let editingLevel = $state<PriceLevel | null>(null);
    let selectedLevel = $state<PriceLevel | null>(null);
    let isSaving = $state(false);

    // Form - Price Level
    let levelFormData = $state({
        name: "",
        description: "",
        isDefault: false,
    });

    // Form - Product Price
    let priceFormData = $state({
        productId: "",
        priceLevelId: "",
        price: 0,
    });

    // Search & Filter
    let searchQuery = $state("");
    let selectedLevelFilter = $state<string | null>(null);
    let searchTimeout: ReturnType<typeof setTimeout>;

    // Pagination
    let currentPage = $state(1);
    let limit = $state(20);
    let totalItems = $state(0);
    const pageSizeOptions = [5, 10, 20, 50, 70, 100];
    let totalProducts = $state(0);
    let totalPages = $derived(Math.max(1, Math.ceil(totalItems / limit)));

    // Computed
    let filteredLevels = $derived(priceLevels);

    // Stats
    let stats = $derived({
        totalLevels: priceLevels.length,
        defaultLevel: priceLevels.find((l) => l.isDefault),
        totalProducts,
        productsWithPricing: new Set(
            priceLevels.flatMap((l) => l.products?.map((p) => p.productId) || [])
        ).size,
    });

    $effect(() => {
        currentPage;
        limit;
        loadData();
    });

    async function loadData() {
        loading = true;
        error = null;
        try {
            const [levelsRes, productsRes] = await Promise.all([
                api.get("products/price-levels", { searchParams: { page: currentPage, limit, ...(searchQuery ? { search: searchQuery } : {}) } }).json<any>(),
                api.get("products", { searchParams: { all: "true" } }).json<any>(),
            ]);

            if (levelsRes.success) {
                priceLevels = levelsRes.data || [];
                totalItems = levelsRes.meta?.total ?? priceLevels.length;
            } else {
                throw new Error(levelsRes.error?.message || "Failed to load price levels");
            }

            if (productsRes.success) {
                products = productsRes.data || [];
                totalProducts = productsRes.meta?.total ?? productsRes.pagination?.total ?? products.length;
            }
        } catch (err: any) {
            console.error("Failed to load data:", err);
            error = err.message || "ບໍ່ສາມາດໂຫລດຂໍ້ມູນໄດ້";
            toast.error("ບໍ່ສາມາດໂຫລດຂໍ້ມູນ Pricing ໄດ້");
        } finally {
            loading = false;
        }
    }

    // Price Level Functions
    function openLevelModal(level?: PriceLevel) {
        if (level) {
            editingLevel = level;
            levelFormData = {
                name: level.name,
                description: level.description || "",
                isDefault: level.isDefault,
            };
        } else {
            editingLevel = null;
            levelFormData = {
                name: "",
                description: "",
                isDefault: false,
            };
        }
        showLevelModal = true;
    }

    async function saveLevel() {
        if (!levelFormData.name.trim()) {
            toast.error("ກະລຸນາລະບຸຊື່ລະດັບລາຄາ");
            return;
        }

        isSaving = true;
        try {
            if (editingLevel) {
                await api.put(`products/price-levels/${editingLevel.id}`, {
                    json: levelFormData,
                }).json();
                toast.success("ອັບເດດລະດັບລາຄາສຳເລັດ");
            } else {
                await api.post("products/price-levels", {
                    json: levelFormData,
                }).json();
                toast.success("ສ້າງລະດັບລາຄາສຳເລັດ");
            }
            showLevelModal = false;
            loadData();
        } catch (err: any) {
            console.error("Failed to save:", err);
            toast.error(err.message || "ບໍ່ສາມາດບັນທຶກໄດ້");
        } finally {
            isSaving = false;
        }
    }

    async function deleteLevel(level: PriceLevel) {
        if (level.isDefault) {
            toast.error("ບໍ່ສາມາດລົບລະດັບລາຄາ Default ໄດ້");
            return;
        }
        if (!confirm(`ຕ້ອງການລົບລະດັບລາຄາ "${level.name}" ບໍ?`)) return;

        try {
            await api.delete(`products/price-levels/${level.id}`).json();
            toast.success("ລົບລະດັບລາຄາສຳເລັດ");
            loadData();
        } catch (err: any) {
            console.error("Failed to delete:", err);
            toast.error(err.message || "ບໍ່ສາມາດລົບໄດ້");
        }
    }

    async function setDefaultLevel(level: PriceLevel) {
        try {
            await api.put(`products/price-levels/${level.id}/set-default`).json();
            toast.success(`ຕັ້ງ "${level.name}" ເປັນ Default ແລ້ວ`);
            loadData();
        } catch (err: any) {
            toast.error(err.message || "ບໍ່ສາມາດຕັ້ງ Default ໄດ້");
        }
    }

    // Product Price Functions
    function openPriceModal(level: PriceLevel) {
        selectedLevel = level;
        priceFormData = {
            productId: "",
            priceLevelId: level.id,
            price: 0,
        };
        showPriceModal = true;
    }

    async function saveProductPrice() {
        if (!priceFormData.productId) {
            toast.error("ກະລຸນາເລືອກສິນຄ້າ");
            return;
        }
        if (priceFormData.price <= 0) {
            toast.error("ກະລຸນາລະບຸລາຄາທີ່ຖືກຕ້ອງ");
            return;
        }

        isSaving = true;
        try {
            await api.post("products/price-levels/prices", {
                json: priceFormData,
            }).json();
            toast.success("ເພີ່ມລາຄາສິນຄ້າສຳເລັດ");
            showPriceModal = false;
            loadData();
        } catch (err: any) {
            console.error("Failed to save:", err);
            toast.error(err.message || "ບໍ່ສາມາດບັນທຶກໄດ້");
        } finally {
            isSaving = false;
        }
    }

    async function removeProductPrice(priceId: string) {
        if (!confirm("ຕ້ອງການລົບລາຄາສິນຄ້ານີ້ບໍ?")) return;

        try {
            await api.delete(`products/price-levels/prices/${priceId}`).json();
            toast.success("ລົບລາຄາສິນຄ້າສຳເລັດ");
            loadData();
        } catch (err: any) {
            toast.error(err.message || "ບໍ່ສາມາດລົບໄດ້");
        }
    }

    function getDiscountPercent(originalPrice: number, levelPrice: number): number {
        if (originalPrice <= 0) return 0;
        return Math.round(((originalPrice - levelPrice) / originalPrice) * 100);
    }

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
        }
    }

    function changePageSize(size: number) {
        limit = size;
        currentPage = 1;
    }

    function handleSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadData();
        }, 300);
    }

    function copyPrice(price: number) {
        navigator.clipboard.writeText(price.toString());
        toast.success("ກ໋ອບປີ້ລາຄາແລ້ວ");
    }
</script>

<svelte:head>
    <title>ຈັດການລາຄາ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <div class="p-2 bg-success-100 dark:bg-success-900/50 rounded-xl">
                    <DollarSign class="w-6 h-6 text-success-600 dark:text-success-400" />
                </div>
                ຈັດການລະດັບລາຄາ
            </h1>
            <p class="text-gray-500 dark:text-gray-400 mt-1">
                ກຳນົດລະດັບລາຄາສຳລັບກຸ່ມລູກຄ້າ ແລະ ສິນຄ້າຕ່າງໆ
            </p>
        </div>
        <div class="flex flex-wrap gap-3">
            <button
                onclick={() => loadData()}
                class="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
                <RefreshCw class="w-4 h-4" />
                ໂຫລດໃໝ່
            </button>
            <button
                onclick={() => openLevelModal()}
                class="flex items-center gap-2 px-4 py-2.5 bg-success-600 text-white rounded-xl hover:bg-success-700 transition-colors shadow-lg shadow-success-600/25"
            >
                <Plus class="w-4 h-4" />
                ເພີ່ມລະດັບລາຄາ
            </button>
        </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Layers class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalLevels}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ລະດັບລາຄາ</p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg">
                    <Star class="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                    <p class="text-lg font-bold text-gray-900 dark:text-white truncate">
                        {stats.defaultLevel?.name || "-"}
                    </p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">Default</p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Package class="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalProducts}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ສິນຄ້າທັງໝົດ</p>
                </div>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-success-100 dark:bg-success-900/50 rounded-lg">
                    <TrendingUp class="w-5 h-5 text-success-600 dark:text-success-400" />
                </div>
                <div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{stats.productsWithPricing}</p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ມີລາຄາພິເສດ</p>
                </div>
            </div>
        </div>
    </div>

    <!-- Error State -->
    {#if error && !loading}
        <div class="bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 rounded-xl p-6 mb-6">
            <div class="flex flex-col items-center justify-center text-center">
                <AlertCircle class="w-12 h-12 text-danger-500 mb-3" />
                <h3 class="text-lg font-semibold text-danger-700 dark:text-danger-400 mb-2">ເກີດຂໍ້ຜິດພາດ</h3>
                <p class="text-danger-600 dark:text-danger-300 mb-4">{error}</p>
                <button
                    onclick={() => loadData()}
                    class="flex items-center gap-2 px-4 py-2 bg-danger-600 text-white rounded-lg hover:bg-danger-700 transition-colors"
                >
                    <RefreshCw class="w-4 h-4" />
                    ລອງໃໝ່
                </button>
            </div>
        </div>
    {/if}

    <!-- Loading State -->
    {#if loading}
        <div class="flex flex-col items-center justify-center py-20">
            <Loader2 class="w-10 h-10 text-success-600 animate-spin mb-4" />
            <p class="text-gray-500 dark:text-gray-400">ກຳລັງໂຫລດຂໍ້ມູນ...</p>
        </div>
    {:else if filteredLevels.length === 0 && !error}
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
            <DollarSign class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">ບໍ່ພົບລະດັບລາຄາ</h3>
            <p class="text-gray-500 dark:text-gray-400 mb-6">ຍັງບໍ່ມີລະດັບລາຄາໃນລະບົບ ກະລຸນາເພີ່ມໃໝ່</p>
            <button
                onclick={() => openLevelModal()}
                class="inline-flex items-center gap-2 px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700"
            >
                <Plus class="w-4 h-4" />
                ເພີ່ມລະດັບລາຄາທຳອິດ
            </button>
        </div>
    {:else if !error}
        <div class="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div class="relative w-full sm:max-w-md">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    bind:value={searchQuery}
                    oninput={handleSearch}
                    placeholder="ຄົ້ນຫາລະດັບລາຄາ..."
                    class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-success-500"
                />
            </div>
            <select
                value={limit}
                onchange={(e) => changePageSize(Number(e.currentTarget.value))}
                class="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
                {#each pageSizeOptions as size (size)}
                    <option value={size}>{size} / ໜ້າ</option>
                {/each}
            </select>
        </div>

        <!-- Price Levels Grid -->
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {#each filteredLevels as level (level.id)}
                <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow">
                    <!-- Header -->
                    <div class="p-5 border-b border-gray-200 dark:border-gray-700 {level.isDefault ? 'bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20' : ''}">
                        <div class="flex items-start justify-between">
                            <div class="flex items-center gap-3">
                                <div class="p-2 rounded-lg {level.isDefault ? 'bg-yellow-100 dark:bg-yellow-900/50' : 'bg-gray-100 dark:bg-gray-700'}">
                                    {#if level.isDefault}
                                        <Star class="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                                    {:else}
                                        <Tag class="w-5 h-5 text-gray-600 dark:text-gray-400" />
                                    {/if}
                                </div>
                                <div>
                                    <h3 class="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                        {level.name}
                                        {#if level.isDefault}
                                            <span class="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 text-xs rounded-full">
                                                Default
                                            </span>
                                        {/if}
                                    </h3>
                                    {#if level.description}
                                        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                            {level.description}
                                        </p>
                                    {/if}
                                </div>
                            </div>
                            <div class="flex gap-1">
                                <button
                                    onclick={() => openLevelModal(level)}
                                    class="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                                    title="ແກ້ໄຂ"
                                >
                                    <Edit class="w-4 h-4" />
                                </button>
                                {#if !level.isDefault}
                                    <button
                                        onclick={() => deleteLevel(level)}
                                        class="p-2 text-gray-400 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded-lg transition-colors"
                                        title="ລົບ"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                {/if}
                            </div>
                        </div>
                    </div>

                    <!-- Stats -->
                    <div class="p-5">
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center gap-2">
                                <Package class="w-4 h-4 text-gray-400" />
                                <span class="text-sm text-gray-600 dark:text-gray-400">
                                    {level.products?.length || 0} ສິນຄ້າ
                                </span>
                            </div>
                            {#if !level.isDefault}
                                <button
                                    onclick={() => setDefaultLevel(level)}
                                    class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                                >
                                    ຕັ້ງເປັນ Default
                                </button>
                            {/if}
                        </div>

                        <!-- Product prices preview -->
                        {#if level.products && level.products.length > 0}
                            <div class="space-y-2 mb-4">
                                {#each level.products.slice(0, 3) as productPrice (productPrice.product?.id || productPrice.productId)}
                                    <div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        <span class="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[150px]">
                                            {productPrice.product?.name || "ສິນຄ້າ"}
                                        </span>
                                        <span class="text-sm font-semibold text-success-600 dark:text-success-400">
                                            {formatCurrency(productPrice.price)}
                                        </span>
                                    </div>
                                {/each}
                                {#if level.products.length > 3}
                                    <p class="text-xs text-gray-500 dark:text-gray-400 text-center">
                                        +{level.products.length - 3} ສິນຄ້າອື່ນໆ
                                    </p>
                                {/if}
                            </div>
                        {:else}
                            <div class="text-center py-4 text-gray-400 dark:text-gray-500">
                                <Package class="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p class="text-sm">ຍັງບໍ່ມີສິນຄ້າ</p>
                            </div>
                        {/if}

                        <!-- Actions -->
                        <button
                            onclick={() => openPriceModal(level)}
                            class="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl hover:border-success-500 hover:text-success-600 dark:hover:text-success-400 transition-colors"
                        >
                            <Plus class="w-4 h-4" />
                            ເພີ່ມລາຄາສິນຄ້າ
                        </button>
                    </div>

                    <!-- Footer -->
                    <div class="px-5 py-3 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-700">
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                            ສ້າງເມື່ອ: {formatDate(level.createdAt)}
                        </p>
                    </div>
                </div>
            {/each}
        </div>

        <div class="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3">
            <p class="text-sm text-gray-500 dark:text-gray-400">
                {(currentPage - 1) * limit + 1} - {Math.min(currentPage * limit, totalItems)} / {totalItems}
            </p>
            <div class="flex items-center gap-2">
                <button onclick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40">
                    <ChevronLeft class="w-4 h-4" />
                </button>
                <span class="px-3 text-sm text-gray-600 dark:text-gray-300">{currentPage} / {totalPages}</span>
                <button onclick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} class="p-2 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40">
                    <ChevronRight class="w-4 h-4" />
                </button>
            </div>
        </div>
    {/if}
</div>

<!-- Price Level Modal -->
{#if showLevelModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            role="button"
            tabindex="0"
            onclick={() => (showLevelModal = false)}
            onkeydown={(e) => e.key === "Escape" && (showLevelModal = false)}
        ></div>

        <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                    {editingLevel ? "ແກ້ໄຂລະດັບລາຄາ" : "ເພີ່ມລະດັບລາຄາໃໝ່"}
                </h2>
                <button
                    onclick={() => (showLevelModal = false)}
                    class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>

            <form
                onsubmit={(e) => {
                    e.preventDefault();
                    saveLevel();
                }}
                class="p-6 space-y-5"
            >
                <div>
                    <label for="a11y-app-products-pricing-page-svelte-1" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        ຊື່ລະດັບລາຄາ <span class="text-danger-500">*</span>
                    </label>
                    <input id="a11y-app-products-pricing-page-svelte-1"
                        type="text"
                        bind:value={levelFormData.name}
                        required
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-success-500"
                        placeholder="ເຊັ່ນ: ລາຄາສະມາຊິກ, ລາຄາຂາຍສົ່ງ"
                    />
                </div>

                <div>
                    <label for="a11y-app-products-pricing-page-svelte-2" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        ລາຍລະອຽດ
                    </label>
                    <textarea id="a11y-app-products-pricing-page-svelte-2"
                        bind:value={levelFormData.description}
                        rows="3"
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-success-500 resize-none"
                        placeholder="ອະທິບາຍລະດັບລາຄານີ້..."
                    ></textarea>
                </div>

                <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <div>
                        <p class="font-medium text-gray-900 dark:text-white">ຕັ້ງເປັນ Default</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400">ລະດັບລາຄາຫຼັກສຳລັບລູກຄ້າທົ່ວໄປ</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" bind:checked={levelFormData.isDefault} class="sr-only peer" />
                        <div
                            class="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-success-300 dark:peer-focus:ring-success-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-success-600"
                        ></div>
                    </label>
                </div>
            </form>

            <div class="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                    type="button"
                    onclick={() => (showLevelModal = false)}
                    class="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
                >
                    ຍົກເລີກ
                </button>
                <button
                    type="button"
                    onclick={saveLevel}
                    disabled={isSaving || !levelFormData.name.trim()}
                    class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-success-600 text-white hover:bg-success-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {#if isSaving}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {/if}
                    ບັນທຶກ
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Add Product Price Modal -->
{#if showPriceModal && selectedLevel}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
            class="absolute inset-0 bg-black/50 backdrop-blur-sm"
            role="button"
            tabindex="0"
            onclick={() => (showPriceModal = false)}
            onkeydown={(e) => e.key === "Escape" && (showPriceModal = false)}
        ></div>

        <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <div>
                    <h2 class="text-xl font-bold text-gray-900 dark:text-white">ເພີ່ມລາຄາສິນຄ້າ</h2>
                    <p class="text-sm text-gray-500 dark:text-gray-400">ລະດັບ: {selectedLevel.name}</p>
                </div>
                <button
                    onclick={() => (showPriceModal = false)}
                    class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>

            <form
                onsubmit={(e) => {
                    e.preventDefault();
                    saveProductPrice();
                }}
                class="p-6 space-y-5"
            >
                <div>
                    <label for="a11y-app-products-pricing-page-svelte-3" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        ເລືອກສິນຄ້າ <span class="text-danger-500">*</span>
                    </label>
                    <select id="a11y-app-products-pricing-page-svelte-3"
                        bind:value={priceFormData.productId}
                        required
                        class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-success-500"
                    >
                        <option value="">-- ເລືອກສິນຄ້າ --</option>
                        {#each products as product (product.id)}
                            <option value={product.id}>
                                {product.name} - {formatCurrency(product.price)}
                            </option>
                        {/each}
                    </select>
                </div>

                <div>
                    <label for="a11y-app-products-pricing-page-svelte-4" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        ລາຄາພິເສດ (₭) <span class="text-danger-500">*</span>
                    </label>
                    <div class="relative">
                        <DollarSign class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <MoneyInput id="a11y-app-products-pricing-page-svelte-4"
                            bind:value={priceFormData.price}
                            min={0}
                            required
                            class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-success-500"
                        />
                    </div>
                </div>

                <!-- Price comparison preview -->
                {#if priceFormData.productId && priceFormData.price > 0}
                    {@const selectedProduct = products.find((p) => p.id === priceFormData.productId)}
                    {#if selectedProduct}
                        {@const discount = getDiscountPercent(selectedProduct.price, priceFormData.price)}
                        <div class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-sm text-gray-600 dark:text-gray-400">ລາຄາປົກກະຕິ</span>
                                <span class="text-gray-900 dark:text-white line-through">
                                    {formatCurrency(selectedProduct.price)}
                                </span>
                            </div>
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-sm text-gray-600 dark:text-gray-400">ລາຄາພິເສດ</span>
                                <span class="text-lg font-bold text-success-600 dark:text-success-400">
                                    {formatCurrency(priceFormData.price)}
                                </span>
                            </div>
                            <div class="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                                <span class="text-sm text-gray-600 dark:text-gray-400">ສ່ວນຫຼຸດ</span>
                                <span class="font-semibold {discount > 0 ? 'text-success-600 dark:text-success-400' : discount < 0 ? 'text-danger-600 dark:text-danger-400' : 'text-gray-600'}">
                                    {discount > 0 ? "-" : discount < 0 ? "+" : ""}{Math.abs(discount)}%
                                </span>
                            </div>
                        </div>
                    {/if}
                {/if}
            </form>

            <div class="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                    type="button"
                    onclick={() => (showPriceModal = false)}
                    class="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
                >
                    ຍົກເລີກ
                </button>
                <button
                    type="button"
                    onclick={saveProductPrice}
                    disabled={isSaving || !priceFormData.productId || priceFormData.price <= 0}
                    class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-success-600 text-white hover:bg-success-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {#if isSaving}
                        <Loader2 class="w-4 h-4 animate-spin" />
                    {/if}
                    ເພີ່ມລາຄາ
                </button>
            </div>
        </div>
    </div>
{/if}
