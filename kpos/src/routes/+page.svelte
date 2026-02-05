<script lang="ts">
    import { auth } from "$stores";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";

    onMount(() => {
        // Redirect to login if not authenticated
        if (!auth.isAuthenticated) {
            goto("/login");
        } else {
            // Redirect to POS by default
            goto("/pos");
        }
    });
</script>

<div
    class="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950"
>
    <div class="text-center">
        <div
            class="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent mx-auto"
        ></div>
        <p class="mt-4 text-gray-600 dark:text-gray-400">กำลังโหลด...</p>
    </div>
</div>
