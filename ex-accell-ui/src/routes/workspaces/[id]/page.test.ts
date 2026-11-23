import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';

const hoisted = vi.hoisted(() => ({ goto: vi.fn() }));

vi.mock('$app/navigation', () => ({ goto: hoisted.goto }));
vi.mock('$app/state', () => import('../../../test/mocks/pageState.svelte'));

import { resetMockPage, setMockPage } from '../../../test/mocks/pageState.svelte';
import { requested, stubApi } from '../../../test/mocks/apiStub';
import Page from './+page.svelte';

const overview = {
  success: true,
  workspace: { id: 4, name: 'Harbour', description: 'Dock activity', workspace_type: 'research', project_id: 2, project_name: 'Port', status: 'active', created_at: '2026-01-01T00:00:00Z' },
  data_sources: [],
  investigations: [],
  summary: { total_records: 1500, total_data_sources: 0, total_investigations: 0 }
};

const at = (id: string) => setMockPage({ params: { id }, url: new URL(`http://localhost/workspaces/${id}`) });

afterEach(() => {
  cleanup();
  resetMockPage();
  hoisted.goto.mockReset();
  vi.unstubAllGlobals();
});

describe('workspace page', () => {
  it('loads the overview of the workspace in the route and shows it', async () => {
    at('4');
    const urls = stubApi(() => overview);

    render(Page);

    expect(await screen.findByRole('heading', { name: 'Harbour' })).toBeInTheDocument();
    expect(requested(urls, '/api/workspace-overview?id=4')).toHaveLength(1);
    expect(screen.getByText(/1\.5K records/)).toBeInTheDocument();
  });

  it('links a dataset to the workspace the route names now', async () => {
    at('4');
    stubApi(() => overview);
    render(Page);
    await fireEvent.click(await screen.findByRole('button', { name: 'Link dataset' }));
    expect(hoisted.goto).toHaveBeenLastCalledWith('/data-management?workspace=4&link=1');

    at('5');
    await fireEvent.click(screen.getByRole('button', { name: 'Link dataset' }));

    expect(hoisted.goto).toHaveBeenLastCalledWith('/data-management?workspace=5&link=1');
  });

  it('asks for the workspace the route names when the load is retried after the route changed', async () => {
    at('4');
    const urls = stubApi((url) => (url.includes('id=4') ? { success: false, error: 'Workspace is unavailable' } : overview));
    render(Page);
    expect(await screen.findByText('Workspace is unavailable')).toBeInTheDocument();

    at('5');
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Harbour' })).toBeInTheDocument();
    expect(requested(urls, '/api/workspace-overview?id=5')).toHaveLength(1);
  });
});
