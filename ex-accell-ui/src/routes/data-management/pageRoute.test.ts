import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => import('../../test/mocks/pageState.svelte'));
vi.mock('#lib/stores/projectStore.ts', async () => {
  const { writable } = await import('svelte/store');
  const currentProject = writable<unknown>(null);
  return {
    currentProject,
    loadCurrentProject: vi.fn(async () => {
      currentProject.set({ id: '1', name: 'Project' });
    })
  };
});

import { resetMockPage, setMockPage } from '../../test/mocks/pageState.svelte';
import { requested, stubApi } from '../../test/mocks/apiStub';
import Page from './+page.svelte';

const linked = { id: 1, name: 'Bluesky posts', description: '', dataset_type: 'social_media', source_platform: 'bluesky', status: 'available', record_count: '10' };
const spare = { id: 4, name: 'Spare dataset', description: '', dataset_type: 'social_media', status: 'available', record_count: '12' };

const at = (search: string) => setMockPage({ url: new URL(`http://localhost/data-management${search}`) });

const api = () =>
  stubApi((url) =>
    url.startsWith('/api/datasets?status=available')
      ? { success: true, datasets: [linked, spare] }
      : url.startsWith('/api/datasets')
        ? { success: true, datasets: [linked] }
        : url === '/api/workflows'
          ? { success: true, workflows: [] }
          : { success: true, status: 'idle' }
  );

afterEach(() => {
  cleanup();
  resetMockPage();
  vi.unstubAllGlobals();
});

describe('data management route', () => {
  it('opens the link dialog straight away when the address asks for it with a workspace', async () => {
    at('?workspace=9&link=1');
    api();

    render(Page);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('links a dataset to the workspace the route names now', async () => {
    at('?workspace=9');
    const urls = api();
    render(Page);
    await screen.findByText('Data Sources (1)');
    expect(requested(urls, '/api/datasets?workspace_id=9')).toHaveLength(1);

    at('?workspace=10');
    await fireEvent.click(screen.getByText('Link dataset'));
    await fireEvent.click(await screen.findByText('Spare dataset'));

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url, init]) => url === '/api/datasets' && init?.method === 'POST')).toBe(true));
    const post = vi.mocked(fetch).mock.calls.find(([url, init]) => url === '/api/datasets' && init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ action: 'link', workspace_id: 10, dataset_id: 4 });
  });
});
