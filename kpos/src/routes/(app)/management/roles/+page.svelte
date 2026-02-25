<script lang="ts">
    import { i18n } from "$lib/i18n/index.svelte";
    import { api } from "$lib/api";
    import { onMount } from "svelte";
    import { toast } from "svelte-sonner";
    import { Plus, Edit, Trash2, Shield, Loader2, X, AlertCircle, RefreshCw, ChevronLeft, ChevronRight } from "lucide-svelte";
    const t = i18n.t;

    let roles = $state<any[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let showModal = $state(false);
    let editingRole = $state<any>(null);
    let formData = $state({
        name: "",
        description: "",
        permissions: [] as string[],
    });

    // Pagination
    let currentPage = $state(1);
    let pageSize = $state(10);
    const pageSizeOptions = [10, 25, 50, 100];

    const allPermissions = [
        {
            category: "ການຂາຍ",
            permissions: [
                { key: "pos:access", label: "ເຂົ້າໃຊ້ໜ້າຂາຍ" },
                { key: "pos:void", label: "ຍົກເລີກລາຍການ" },
                { key: "pos:discount", label: "ໃຫ້ສ່ວນຫຼຸດ" },
                { key: "pos:refund", label: "ຄືນເງິນ" },
                { key: "pos:credit", label: "ຂາຍເຊື່ອ" },
            ],
        },
        {
            category: "ສິນຄ້າ",
            permissions: [
                { key: "products:read", label: "ເບິ່ງສິນຄ້າ" },
                { key: "products:create", label: "ເພີ່ມສິນຄ້າ" },
                { key: "products:update", label: "ແກ້ໄຂສິນຄ້າ" },
                { key: "products:delete", label: "ລົບສິນຄ້າ" },
            ],
        },
        {
            category: "ສາງ",
            permissions: [
                { key: "inventory:read", label: "ເບິ່ງສາງ" },
                { key: "inventory:stockin", label: "ນຳເຂົ້າສາງ" },
                { key: "inventory:stockout", label: "ນຳອອກສາງ" },
                { key: "inventory:adjust", label: "ປັບປ່ຽນຍອດ" },
                { key: "inventory:transfer", label: "ໂອນຍ້າຍ" },
            ],
        },
        {
            category: "ລາຍງານ",
            permissions: [
                { key: "reports:sales", label: "ລາຍງານຂາຍ" },
                { key: "reports:inventory", label: "ລາຍງານສາງ" },
                { key: "reports:financial", label: "ລາຍງານການເງິນ" },
                { key: "reports:staff", label: "ລາຍງານພະນັກງານ" },
            ],
        },
        {
            category: "ພະນັກງານ",
            permissions: [
                { key: "staff:read", label: "ເບິ່ງພະນັກງານ" },
                { key: "staff:create", label: "ເພີ່ມພະນັກງານ" },
                { key: "staff:update", label: "ແກ້ໄຂພະນັກງານ" },
                { key: "staff:delete", label: "ລົບພະນັກງານ" },
            ],
        },
        {
            category: "ຕັ້ງຄ່າ",
            permissions: [
                { key: "settings:read", label: "ເບິ່ງການຕັ້ງຄ່າ" },
                { key: "settings:update", label: "ແກ້ໄຂການຕັ້ງຄ່າ" },
            ],
        },
    ];

    onMount(() => {
        loadRoles();
    });

    async function loadRoles() {
        loading = true;
        error = null;
        try {
            const response = await api.get("roles").json<any>();
            if (response.success) {
                roles = response.data || [];
            }
        } catch (err) {
            console.error("Failed to load roles:", err);
            error = "ບໍ່ສາມາດໂຫຼດຂໍ້ມູນບົດບາດໄດ້";
            toast.error("ບໍ່ສາມາດໂຫຼດຂໍ້ມູນບົດບາດໄດ້");
            roles = [];
        } finally {
            loading = false;
        }
    }

    // Pagination derived values
    let totalPages = $derived(Math.ceil(roles.length / pageSize));
    let paginatedRoles = $derived(
        roles.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    );

    function goToPage(page: number) {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
        }
    }

    function changePageSize(newSize: number) {
        pageSize = newSize;
        currentPage = 1;
    }

    function openModal(role?: any) {
        if (role) {
            editingRole = role;
            formData = {
                name: role.name,
                description: role.description,
                permissions: [...role.permissions],
            };
        } else {
            editingRole = null;
            formData = { name: "", description: "", permissions: [] };
        }
        showModal = true;
    }

    async function saveRole() {
        try {
            if (editingRole) {
                await api.put(`roles/${editingRole.id}`, {
                    json: formData,
                }).json();
            } else {
                await api.post("roles", { json: formData }).json();
            }
            showModal = false;
            toast.success("ບັນທຶກສຳເລັດ");
            loadRoles();
        } catch (error) {
            console.error("Failed to save role:", error);
            toast.error("ເກີດຂໍ້ຜິດພາດ");
        }
    }

    async function deleteRole(role: any) {
        if (role.isSystem) {
            toast.error("ບໍ່ສາມາດລົບບົດບາດລະບົບໄດ້");
            return;
        }
        if (!confirm("ຕ້ອງການລົບບົດບາດນີ້ບໍ?")) return;
        try {
            await api.delete(`roles/${role.id}`).json();
            toast.success("ລົບສຳເລັດ");
            loadRoles();
        } catch (error) {
            console.error("Failed to delete role:", error);
            toast.error("ເກີດຂໍ້ຜິດພາດ");
        }
    }

    function togglePermission(permission: string) {
        if (formData.permissions.includes(permission)) {
            formData.permissions = formData.permissions.filter(
                (p) => p !== permission,
            );
        } else {
            formData.permissions = [...formData.permissions, permission];
        }
    }

    function toggleCategory(category: any) {
        const categoryPerms = category.permissions.map((p: any) => p.key);
        const allSelected = categoryPerms.every((p: string) =>
            formData.permissions.includes(p),
        );
        if (allSelected) {
            formData.permissions = formData.permissions.filter(
                (p) => !categoryPerms.includes(p),
            );
        } else {
            formData.permissions = [
                ...new Set([...formData.permissions, ...categoryPerms]),
            ];
        }
    }
</script>

<svelte:head>
    <title>ບົດບາດ ແລະ ສິດ - KPOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
    <div class="flex justify-between items-center mb-6">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">ບົດບາດ ແລະ ສິດ</h1>
            <p class="text-gray-500 dark:text-gray-400">ຈັດການບົດບາດ ແລະ ສິດເຂົ້າໃຊ້ລະບົບ</p>
        </div>
        <button
            onclick={() => openModal()}
            class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
            <Plus class="w-4 h-4" />
            ເພີ່ມບົດບາດ
        </button>
    </div>

    {#if loading}
        <div class="flex justify-center py-12">
            <Loader2 class="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin" />
        </div>
    {:else if error}
        <div class="flex flex-col items-center justify-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <AlertCircle class="w-12 h-12 text-red-500 dark:text-red-400 mb-4" />
            <p class="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
            <button
                onclick={() => loadRoles()}
                class="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 transition-colors"
            >
                <RefreshCw class="w-4 h-4" />
                ລອງໃໝ່
            </button>
        </div>
    {:else if roles.length === 0}
        <div class="flex flex-col items-center justify-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <Shield class="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
            <p class="text-gray-500 dark:text-gray-400">ບໍ່ມີຂໍ້ມູນບົດບາດ</p>
        </div>
    {:else}
        <div class="grid gap-4 md:grid-cols-2">
            {#each paginatedRoles as role (role.id)}
                <div
                    class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow"
                >
                    <div class="flex items-start justify-between">
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="font-semibold text-gray-900 dark:text-white">
                                    {role.name}
                                </h3>
                                {#if role.isSystem}
                                    <span
                                        class="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded"
                                    >ລະບົບ</span>
                                {/if}
                            </div>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {role.description}
                            </p>
                        </div>
                        <div class="p-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                            <Shield class="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        </div>
                    </div>
                    <div class="mt-3">
                        <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            ສິດທັງໝົດ: {role.permissions.length}
                        </p>
                        <div class="flex flex-wrap gap-1">
                            {#each role.permissions.slice(0, 5) as perm (perm)}
                                <span
                                    class="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded"
                                >{perm.split(":")[0]}</span>
                            {/each}
                            {#if role.permissions.length > 5}
                                <span
                                    class="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded"
                                >+{role.permissions.length - 5}</span>
                            {/if}
                        </div>
                    </div>
                    <div class="mt-4 flex gap-2 border-t border-gray-200 dark:border-gray-700 pt-3">
                        <button
                            onclick={() => openModal(role)}
                            class="flex items-center gap-1 px-3 py-1 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded"
                        >
                            <Edit class="w-3 h-3" />
                            ແກ້ໄຂ
                        </button>
                        {#if !role.isSystem}
                            <button
                                onclick={() => deleteRole(role)}
                                class="flex items-center gap-1 px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            >
                                <Trash2 class="w-3 h-3" />
                                ລົບ
                            </button>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>

        <!-- Pagination -->
        {#if roles.length > 0}
            <div class="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span>ສະແດງ</span>
                    <select
                        bind:value={pageSize}
                        onchange={(e) => changePageSize(Number((e.target as HTMLSelectElement).value))}
                        class="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                    >
                        {#each pageSizeOptions as size (size)}
                            <option value={size}>{size}</option>
                        {/each}
                    </select>
                    <span>ລາຍການ ຈາກທັງໝົດ {roles.length} ລາຍການ</span>
                </div>
                <div class="flex items-center gap-2">
                    <button
                        onclick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        class="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft class="w-4 h-4" />
                    </button>
                    <span class="text-sm text-gray-600 dark:text-gray-400">
                        ໜ້າ {currentPage} / {totalPages || 1}
                    </span>
                    <button
                        onclick={() => goToPage(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                        class="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight class="w-4 h-4" />
                    </button>
                </div>
            </div>
        {/if}
    {/if}
</div>

{#if showModal}
    <div
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onclick={() => (showModal = false)}
        onkeydown={(e) => e.key === "Escape" && (showModal = false)}
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <div
            class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onclick={(e) => e.stopPropagation()}
            role="document"
        >
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                    {editingRole ? "ແກ້ໄຂບົດບາດ" : "ເພີ່ມບົດບາດໃໝ່"}
                </h2>
                <button
                    onclick={() => (showModal = false)}
                    class="p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                    <X class="w-5 h-5" />
                </button>
            </div>
            <div class="space-y-4">
                <div>
                    <label for="roleName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >ຊື່ບົດບາດ</label>
                    <input
                        id="roleName"
                        type="text"
                        bind:value={formData.name}
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                        placeholder="ເຊັ່ນ: Manager, Cashier"
                    />
                </div>
                <div>
                    <label for="roleDesc" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >ຄຳອະທິບາຍ</label>
                    <input
                        id="roleDesc"
                        type="text"
                        bind:value={formData.description}
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                    />
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3"
                        >ສິດ</label>
                    <div class="space-y-4">
                        {#each allPermissions as category (category.category)}
                            <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                                <label
                                    class="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={category.permissions.every(
                                            (p) =>
                                                formData.permissions.includes(
                                                    p.key,
                                                ),
                                        )}
                                        onchange={() =>
                                            toggleCategory(category)}
                                        class="w-4 h-4 rounded"
                                    />
                                    {category.category}
                                </label>
                                <div class="mt-2 ml-6 grid grid-cols-2 gap-2">
                                    {#each category.permissions as perm (perm)}
                                        <label
                                            class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={formData.permissions.includes(
                                                    perm.key,
                                                )}
                                                onchange={() =>
                                                    togglePermission(perm.key)}
                                                class="w-4 h-4 rounded"
                                            />
                                            {perm.label}
                                        </label>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
            <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                    onclick={() => (showModal = false)}
                    class="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                    ຍົກເລີກ
                </button>
                <button
                    onclick={saveRole}
                    class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                    ບັນທຶກ
                </button>
            </div>
        </div>
    </div>
{/if}
