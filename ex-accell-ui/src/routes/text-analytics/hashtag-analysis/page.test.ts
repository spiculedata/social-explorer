import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

vi.mock('$app/env', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => import('../../../test/mocks/pageState.svelte'));
vi.mock('#lib/utils/echarts.ts', () => ({ waitForEcharts: () => new Promise(() => {}), initChart: vi.fn() }));

import { resetMockPage, setMockPage } from '../../../test/mocks/pageState.svelte';
import { queryOf, requested, stubApi } from '../../../test/mocks/apiStub';
import Page from './+page.svelte';

/** Waits until a hashtag is listed (the page shows each one in more than one place). */
const listed = async (text: string) => (await screen.findAllByText(text)).length;

const at = (search: string) => setMockPage({ url: new URL(`http://localhost/text-analytics/hashtag-analysis${search}`) });

const analysis = (hashtags: string[]) => ({
  success: true,
  data: {
    hashtags: hashtags.map((hashtag, i) => ({ hashtag, count: String(10 - i), post_count: String(5 - i) })),
    cooccurrence: [],
    totalHashtags: hashtags.length,
    totalPosts: 9
  }
});

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  resetMockPage();
  vi.unstubAllGlobals();
});

describe('hashtag analysis page', () => {
  it('loads the hashtags of the workspace named in the URL', async () => {
    at('?workspace=4');
    const urls = stubApi((url) => (url.includes('hashtag-analysis') ? analysis(['alpha', 'beta']) : { success: true, datasets: [] }));

    render(Page);

    await waitFor(() => expect(requested(urls, 'type=hashtag-analysis')).toHaveLength(1));
    expect(queryOf(requested(urls, 'type=hashtag-analysis')[0]).get('workspace_id')).toBe('4');
    await listed('#alpha');
  });

  it('loads again when the workspace in the URL changes after mount, and not before', async () => {
    at('?workspace=4');
    const urls = stubApi((url) => (url.includes('workspace_id=5') ? analysis(['gamma']) : url.includes('hashtag-analysis') ? analysis(['alpha']) : { success: true, datasets: [] }));
    render(Page);
    await listed('#alpha');
    expect(requested(urls, 'type=hashtag-analysis')).toHaveLength(1);

    at('?workspace=5');

    await listed('#gamma');
    const loads = requested(urls, 'type=hashtag-analysis');
    expect(loads).toHaveLength(2);
    expect(queryOf(loads[1]).get('workspace_id')).toBe('5');
  });

  it('does not load again when only the search part of the URL changes for the same workspace', async () => {
    at('?workspace=4');
    const urls = stubApi((url) => (url.includes('hashtag-analysis') ? analysis(['alpha']) : { success: true, datasets: [] }));
    render(Page);
    await listed('#alpha');

    at('?workspace=4&date_start=2026-01-01');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(requested(urls, 'type=hashtag-analysis')).toHaveLength(1);
  });

  it('filters the listed hashtags by the search box', async () => {
    at('');
    stubApi((url) => (url.includes('hashtag-analysis') ? analysis(['alpha', 'beta']) : { success: true, datasets: [] }));
    render(Page);
    await listed('#beta');

    await fireEvent.input(screen.getByPlaceholderText(/search/i), { target: { value: 'alp' } });

    expect(screen.queryAllByText('#beta')).toHaveLength(0);
    expect(screen.getAllByText('#alpha').length).toBeGreaterThan(0);
  });
});
