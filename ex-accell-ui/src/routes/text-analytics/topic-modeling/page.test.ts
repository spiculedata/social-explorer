import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

vi.mock('$app/env', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => import('../../../test/mocks/pageState.svelte'));
vi.mock('#lib/utils/echarts.ts', () => ({ waitForEcharts: () => new Promise(() => {}), initChart: vi.fn() }));
vi.mock('#lib/services/topicModelingDb.ts');

import { resetMockPage, setMockPage } from '../../../test/mocks/pageState.svelte';
import { stubApi } from '../../../test/mocks/apiStub';
import { typeFilterDate } from '../../../test/mocks/filterBar';
import { topicModelingDb as db } from '#lib/services/topicModelingDb.ts';
import Page from './+page.svelte';

const at = (search: string) => setMockPage({ url: new URL(`http://localhost/text-analytics/topic-modeling${search}`) });
const topicWorkspaces = () => vi.mocked(db.getTopics).mock.calls.map(([, workspace]) => workspace);

const topic = (id: string, size: number) => ({ id, name: `Topic ${id}`, category: 'politics', size, weight: 0.5, keywords: ['k'] });
const topics = [topic('a', 500), topic('b', 50), topic('c', 5)];

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(db.getTopics).mockReset().mockResolvedValue(topics as never);
  vi.mocked(db.getTopicCategories).mockReset().mockResolvedValue([{ category: 'politics' }] as never);
  vi.mocked(db.getTopicRelationships).mockReset().mockResolvedValue([]);
  vi.mocked(db.getTopicStats).mockReset().mockResolvedValue({} as never);
  vi.mocked(db.getTreemapData).mockReset().mockResolvedValue([]);
  stubApi((url) => (url.includes('/api/datasets') ? { success: true, datasets: [{ id: 1, name: 'Posts', dataset_type: 'social_media', source_platform: 'twitter' }] } : { success: true, data: [] }));
});

afterEach(() => {
  cleanup();
  resetMockPage();
  vi.unstubAllGlobals();
});

describe('topic modeling page', () => {
  it('loads the topics of the workspace named in the URL', async () => {
    at('?workspace=4');

    render(Page);

    await waitFor(() => expect(topicWorkspaces()).toEqual(['4']));
    expect(await screen.findByText('(3 of 3 topics)')).toBeInTheDocument();
  });

  it('narrows the listed topics as the minimum mentions slider moves', async () => {
    at('');
    render(Page);
    await screen.findByText('(3 of 3 topics)');

    await fireEvent.input(screen.getByRole('slider'), { target: { value: '100' } });

    expect(await screen.findByText('(1 of 3 topics)')).toBeInTheDocument();
  });

  it('asks again, for the workspace the page is on now, after a search is typed', async () => {
    at('?workspace=4');
    render(Page);
    await screen.findByText('(3 of 3 topics)');

    at('?workspace=5');
    await fireEvent.input(screen.getByPlaceholderText('Search topics or keywords...'), { target: { value: 'peace' } });

    await waitFor(() => expect(topicWorkspaces()).toEqual(['4', '5']), { timeout: 2000 });
    expect(vi.mocked(db.getTopics).mock.calls[1][0]).toMatchObject({ search: 'peace' });
  });

  it('does not reload the topics when only the date range changes, as the page has always behaved', async () => {
    at('?workspace=4');
    render(Page);
    await screen.findByText('(3 of 3 topics)');

    at('?workspace=5');
    await typeFilterDate('Start date', '2026-02-01');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(topicWorkspaces()).toEqual(['4']);
  });
});
