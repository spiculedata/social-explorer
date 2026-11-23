import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

vi.mock('$app/env', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => import('../../../test/mocks/pageState.svelte'));
vi.mock('#lib/utils/echarts.ts', () => ({ waitForEcharts: () => new Promise(() => {}), initChart: vi.fn() }));
vi.mock('#lib/services/sentimentAnalysisDb.ts');

import { resetMockPage, setMockPage } from '../../../test/mocks/pageState.svelte';
import { stubApi } from '../../../test/mocks/apiStub';
import { typeFilterDate } from '../../../test/mocks/filterBar';
import { sentimentAnalysisDb as db } from '#lib/services/sentimentAnalysisDb.ts';
import Page from './+page.svelte';

const at = (search: string) => setMockPage({ url: new URL(`http://localhost/text-analytics/sentiment-analysis${search}`) });
const statsWorkspaces = () => vi.mocked(db.getSentimentStats).mock.calls.map(([workspace]) => workspace);
const postWorkspaces = () => vi.mocked(db.getSamplePosts).mock.calls.map(([, workspace]) => workspace);
const bucket = { count: 1, percentage: 33, confidence: 0.9 };

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(db.getSentimentStats).mockReset().mockResolvedValue({ positive: bucket, negative: bucket, neutral: bucket, total: 3 } as never);
  vi.mocked(db.getDetailedSentiments).mockReset().mockResolvedValue([]);
  vi.mocked(db.getEmotionStats).mockReset().mockResolvedValue([]);
  vi.mocked(db.getSentimentTrends).mockReset().mockResolvedValue([]);
  vi.mocked(db.getSamplePosts).mockReset().mockResolvedValue([]);
  stubApi((url) => (url.includes('/api/datasets') ? { success: true, datasets: [{ id: 1, name: 'Posts', dataset_type: 'social_media', source_platform: 'twitter' }] } : { success: true, data: [] }));
});

afterEach(() => {
  cleanup();
  resetMockPage();
  vi.unstubAllGlobals();
});

describe('sentiment analysis page', () => {
  it('loads the sentiment of the workspace named in the URL once the filter bar is ready', async () => {
    at('?workspace=4');

    render(Page);

    await waitFor(() => expect(statsWorkspaces()).toEqual(['4']));
    expect(new Set(postWorkspaces())).toEqual(new Set(['4']));
  });

  it('loads for all workspaces when the URL names none', async () => {
    at('');

    render(Page);

    await waitFor(() => expect(statsWorkspaces()).toEqual([undefined]));
  });

  it('reloads for the workspace the page is on now when the date range changes after navigation', async () => {
    at('?workspace=4');
    render(Page);
    await waitFor(() => expect(statsWorkspaces()).toEqual(['4']));
    await screen.findByDisplayValue('All Sentiments');

    at('?workspace=5');
    await typeFilterDate('Start date', '2026-02-01');

    await waitFor(() => expect(statsWorkspaces()).toEqual(['4', '5']));
  });

  it('reloads the posts and the trend, for the workspace the page is on now, when the sentiment filter changes', async () => {
    at('?workspace=4');
    render(Page);
    const select = await screen.findByDisplayValue('All Sentiments');
    await waitFor(() => expect(statsWorkspaces()).toEqual(['4']));
    const postsBefore = postWorkspaces().length;
    const trendsBefore = vi.mocked(db.getSentimentTrends).mock.calls.length;

    at('?workspace=5');
    await fireEvent.change(select, { target: { value: 'Positive' } });

    await waitFor(() => expect(postWorkspaces().length).toBe(postsBefore + 1));
    expect(postWorkspaces()[postsBefore]).toBe('5');
    expect(vi.mocked(db.getSamplePosts).mock.calls[postsBefore][0]).toMatchObject({ sentiment: 'Positive' });
    expect(vi.mocked(db.getSentimentTrends).mock.calls.length).toBe(trendsBefore + 1);
    expect(vi.mocked(db.getSentimentTrends).mock.calls[trendsBefore][1]).toBe('5');
  });
});
