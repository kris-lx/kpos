<script lang="ts">
    import { auth } from "$stores";
    import { t } from "$lib/i18n/index.svelte";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";

    let status = $state<"loading" | "error">("loading");

    onMount(async () => {
        const ok = await auth.completeSsoLogin();
        if (ok) {
            goto("/pos");
        } else {
            status = "error";
            setTimeout(() => goto("/login?error=sso_failed"), 1500);
        }
    });
</script>

<svelte:head>
    <title>{t("app.name")}</title>
</svelte:head>

<div
    class="min-h-screen flex items-center justify-center bg-linear-to-br from-primary-500 to-primary-700 dark:from-gray-900 dark:to-gray-800 p-4"
>
    <div class="text-center text-white">
        {#if status === "loading"}
            <div
                class="animate-spin h-10 w-10 border-4 border-white border-t-transparent rounded-full mx-auto mb-4"
            ></div>
            <p>{t("auth.signingIn")}</p>
        {:else}
            <p>{t("auth.loginFailed")}</p>
        {/if}
    </div>
</div>
