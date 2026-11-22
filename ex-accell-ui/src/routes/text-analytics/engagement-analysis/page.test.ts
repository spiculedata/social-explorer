import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';

vi.mock('$app/env', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => import('../../../test/mocks/pageState.svelte'));
vi.mock('#lib/utils/echarts.ts', () => ({ waitForEcharts: () => new Promise(() => {}), initChart: vi.fn() }));
vi.mock('#lib/services/engagementAnalysisDb.ts');

import { resetMockPage, setMockPage } from '../../../test/mocks/pageState.svelte';
import { stubApi } from '../../../test/mocks/apiStub';
import { typeFilterDate } from '../../../test/mocks/filterBar';
import { engagementAnalysisDb as db } from '#lib/services/engagementAnalysisDb.ts';
import Page from './+page.svelte';

const at = (search: string) => setMockPage({ url: new URL(`http://localhost/text-analytics/engagement-analysis${search}`) });
const statsCalls = () => vi.mocked(db.getEngagementStats).mock.calls.map(([workspace]) => workspace);
const platformCalls = () => vi.mocked(db.getPlatformEngagement).mock.calls.map(([, workspace]) => workspace);
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(db.getEngagementStats).mockReset().mockResolvedValue({} as never);
  vi.mocked(db.getPlatformEngagement).mockReset().mockResolvedValue([]);
  vi.mocked(db.getContentTypePerformance).mockReset().mockResolvedValue([]);
  vi.mocked(db.getEngagementTrends).mockReset().mockResolvedValue([]);
  vi.mocked(db.getTopPerformingPosts).mockReset().mockResolvedValue([]);
  stubApi((url) => (url.includes('/api/datasets') ? { success: true, datasets: [{ id: 1, name: 'Posts', dataset_type: 'social_media', source_platform: 'twitter' }] } : { success: true, data: [] }));
});

afterEach(() => {
  cleanup();
  resetMockPage();
  vi.unstubAllGlobals();
});

describe('engagement analysis page', () => {
  it('loads the engagement of the workspace named in the URL', async () => {
    at('?workspace=4');

    render(Page);

    await waitFor(() => expect(statsCalls()).toEqual(['4']));
    await settle();
    expect(new Set(platformCalls())).toEqual(new Set(['4']));
  });

  it('loads the filtered figures again once the first load has finished, as the page always has', async () => {
    at('?workspace=4');

    render(Page);
    await waitFor(() => expect(statsCalls()).toEqual(['4']));
    await settle();

    expect(platformCalls()).toEqual(['4', '4']);
  });

  it('loads for all workspaces when the URL names none', async () => {
    at('');

    render(Page);

    await waitFor(() => expect(statsCalls()).toEqual([undefined]));
  });

  it('reloads for the workspace the page is on now when the date range changes after navigation', async () => {
    at('?workspace=4');
    render(Page);
    await waitFor(() => expect(statsCalls()).toEqual(['4']));
    await settle();

    at('?workspace=5');
    await typeFilterDate('Start date', '2026-02-01');

    await waitFor(() => expect(statsCalls()).toEqual(['4', '5']));
  });
});
