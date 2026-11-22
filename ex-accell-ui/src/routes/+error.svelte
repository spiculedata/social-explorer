<script lang="ts">
  import { page } from '$app/state';
  import BrandMark from '#lib/components/ui/BrandMark.svelte';

  const status = $derived(page.status);
  const notFound = $derived(status === 404);
  const heading = $derived(notFound ? 'We could not find that page' : 'Something went wrong');
  const detail = $derived(notFound
    ? 'The link may be out of date, or the page may have moved.'
    : 'We could not complete that request. Try again in a moment.');
</script>

<svelte:head>
  <title>{notFound ? 'Page not found' : 'Error'} - Social Explorer</title>
</svelte:head>

<main class="min-h-screen bg-ink-50 flex items-center justify-center px-4">
  <div class="max-w-md text-center">
    <BrandMark size={48} class="mx-auto text-primary-700" />
    <p class="mt-6 text-sm font-semibold uppercase tracking-wider text-ink-500">{status}</p>
    <h1 class="mt-2 text-3xl font-semibold text-ink-900">{heading}</h1>
    <p class="mt-3 text-ink-600">{detail}</p>
    <div class="mt-8 flex flex-wrap justify-center gap-3">
      <a href="/" class="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">Go to home</a>
      <a href="/projects" class="rounded-md border border-ink-300 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">Open projects</a>
    </div>
  </div>
</main>
