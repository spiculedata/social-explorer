import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';

vi.mock('$app/env', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => import('../../test/mocks/pageState.svelte'));
vi.mock('#lib/utils/echarts.ts', () => ({ waitForEcharts: () => new Promise(() => {}), initChart: vi.fn() }));
vi.mock('#lib/services/dashboardDb.ts');
vi.mock('#lib/stores/workspaceStore.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/stores/workspaceStore.ts')>()),
  setWorkspaceFromUrl: vi.fn()
}));

import { resetMockPage, setMockPage } from '../../test/mocks/pageState.svelte';
import { requested, stubApi } from '../../test/mocks/apiStub';
import { typeFilterDate } from '../../test/mocks/filterBar';
import { dashboardDb as db } from '#lib/services/dashboardDb.ts';
import Page from './+page.svelte';

const at = (search: string) => setMockPage({ url: new URL(`http://localhost/dashboards${search}`) });
const statsWorkspaces = () => vi.mocked(db.getDashboardStats).mock.calls.map(([workspace]) => workspace);

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(db.getDashboardStats).mockReset().mockResolvedValue({ total_posts: 1234, total_sources: 2, last_updated: '', processing_rate: 1, data_quality: 90 } as never);
  vi.mocked(db.getDataSources).mockReset().mockResolvedValue([]);
  vi.mocked(db.getSentimentBreakdown).mockReset().mockResolvedValue([{ sentiment: 'positive', count: 7, percentage: 70 }] as never);
  vi.mocked(db.getTopLanguages).mockReset().mockResolvedValue([]);
  vi.mocked(db.getTopTopics).mockReset().mockResolvedValue([]);
  vi.mocked(db.getCrawlingActivity).mockReset().mockResolvedValue([]);
  vi.mocked(db.getRecentActivity).mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  resetMockPage();
  vi.unstubAllGlobals();
});

const api = () =>
  stubApi((url) =>
    url.includes('/api/datasets')
      ? { success: true, datasets: [{ id: 1, name: 'Posts', dataset_type: 'social_media', source_platform: 'twitter' }] }
      : url.includes('/api/workspaces')
        ? { success: true, workspace: { id: 4, name: 'Harbour', project_id: null } }
        : { success: true, data: [] }
  );

describe('dashboards page', () => {
  it('loads the workspace and the figures named in the URL, and shows them', async () => {
    at('?workspace=4');
    const urls = api();

    render(Page);

    await waitFor(() => expect(statsWorkspaces()).toEqual(['4']));
    expect(requested(urls, '/api/workspaces?id=4')).toHaveLength(1);
    expect(await screen.findByText('1,234')).toBeInTheDocument();
  });

  it('says whether the dashboard is for one workspace or for everything, following the URL', async () => {
    at('');
    api();
    render(Page);
    expect(screen.getByText(/Comprehensive analytics and insights across all your social media data sources/)).toBeInTheDocument();

    at('?workspace=4');

    expect(await screen.findByText('Workspace-scoped analytics and insights')).toBeInTheDocument();
  });

  it('reloads for the workspace the page is on now when the date range changes after navigation', async () => {
    at('?workspace=4');
    api();
    render(Page);
    await waitFor(() => expect(statsWorkspaces()).toEqual(['4']));
    await screen.findByText('1,234');

    at('?workspace=5');
    await typeFilterDate('Start date', '2026-02-01');

    await waitFor(() => expect(statsWorkspaces()).toEqual(['4', '5']));
  });
});
