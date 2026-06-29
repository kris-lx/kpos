<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { Toaster } from 'svelte-sonner';

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 30, // 30 minutes
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  let { children } = $props();

  onMount(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  });
</script>

<QueryClientProvider client={queryClient}>
  {@render children()}
</QueryClientProvider>

<Toaster 
  position="top-right" 
  richColors 
  closeButton 
  duration={4000}
/>
