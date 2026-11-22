<script lang="ts">
  import { page } from '#lib/stores/pageStore.svelte.ts';

  // Legacy-syntax component reading the route in `$:` statements, as many pages do
  $: workspaceId = $page.url.searchParams.get('workspace');
  $: investigationId = $page.params.id || '';
  $: isAdmin = ($page.data.user as { role?: string } | undefined)?.role === 'admin';
</script>

<p data-testid="workspace">{workspaceId ?? 'none'}</p>
<p data-testid="id">{investigationId}</p>
<p data-testid="admin">{isAdmin ? 'admin' : 'viewer'}</p>
