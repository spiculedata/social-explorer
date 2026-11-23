import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

vi.mock('$app/env', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => import('../../test/mocks/pageState.svelte'));
vi.mock('#lib/utils/echarts.ts', () => ({ waitForEcharts: () => new Promise(() => {}), initChart: vi.fn() }));
vi.mock('#lib/services/radioAnalyticsDb.ts');

import { resetMockPage, setMockPage } from '../../test/mocks/pageState.svelte';
import { stubApi } from '../../test/mocks/apiStub';
import { typeFilterDate } from '../../test/mocks/filterBar';
import { radioAnalyticsDb as db } from '#lib/services/radioAnalyticsDb.ts';
import Page from './+page.svelte';

const at = (search: string) => setMockPage({ url: new URL(`http://localhost/radio-analytics${search}`) });
const statsWorkspaces = () => vi.mocked(db.getOverviewStats).mock.calls.map(([workspace]) => workspace);

const transcripts = [
  { id: 1, radioName: 'Harbour FM', transcript: 'storm warning', isPolitical: false, isAd: false },
  { id: 2, radioName: 'City Talk', transcript: 'election result', isPolitical: true, isAd: false }
];

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(db.getOverviewStats).mockReset().mockResolvedValue({} as never);
  vi.mocked(db.getSentimentBreakdown).mockReset().mockResolvedValue([]);
  vi.mocked(db.getStationBreakdown).mockReset().mockResolvedValue([]);
  vi.mocked(db.getSentimentTrends).mockReset().mockResolvedValue([]);
  vi.mocked(db.getTopTopics).mockReset().mockResolvedValue([]);
  vi.mocked(db.getPoliticalBreakdown).mockReset().mockResolvedValue({} as never);
  vi.mocked(db.getTranscripts).mockReset().mockResolvedValue(transcripts as never);
  stubApi((url) => (url.includes('/api/datasets') ? { success: true, datasets: [{ id: 1, name: 'Shows', dataset_type: 'radio', source_platform: 'radio' }] } : { success: true, data: [] }));
});

afterEach(() => {
  cleanup();
  resetMockPage();
  vi.unstubAllGlobals();
});

describe('radio analytics page', () => {
  it('loads the radio data of the workspace named in the URL once the filter bar is ready', async () => {
    at('?workspace=4');

    render(Page);

    await waitFor(() => expect(statsWorkspaces()).toEqual(['4']));
    expect(await screen.findByText('2 transcripts shown')).toBeInTheDocument();
  });

  it('loads for all workspaces when the URL names none', async () => {
    at('');

    render(Page);

    await waitFor(() => expect(statsWorkspaces()).toEqual([undefined]));
  });

  it('reloads for the workspace the page is on now when the date range changes after navigation', async () => {
    at('?workspace=4');
    render(Page);
    await screen.findByText('2 transcripts shown');

    at('?workspace=5');
    await typeFilterDate('Start date', '2026-02-01');

    await waitFor(() => expect(statsWorkspaces()).toEqual(['4', '5']));
  });

  it('narrows the transcripts by the search box and by the political filter', async () => {
    at('');
    render(Page);
    await screen.findByText('2 transcripts shown');

    await fireEvent.input(screen.getByPlaceholderText(/search/i), { target: { value: 'storm' } });
    expect(await screen.findByText('1 transcripts shown')).toBeInTheDocument();

    await fireEvent.input(screen.getByPlaceholderText(/search/i), { target: { value: '' } });
    await fireEvent.click(screen.getByRole('button', { name: /^Political/ }));

    expect(await screen.findByText('1 transcripts shown')).toBeInTheDocument();
    expect(screen.getAllByText('City Talk').length).toBeGreaterThan(0);
  });
});
