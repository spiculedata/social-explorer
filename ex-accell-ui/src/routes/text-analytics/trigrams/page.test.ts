import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';

vi.mock('$app/env', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => import('../../../test/mocks/pageState.svelte'));
vi.mock('#lib/services/trigramsDb.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/services/trigramsDb.ts')>()),
  trigramsDb: { getTrigramsResult: vi.fn(), exportTrigramsData: vi.fn() }
}));

import { resetMockPage, setMockPage } from '../../../test/mocks/pageState.svelte';
import { stubApi } from '../../../test/mocks/apiStub';
import { typeFilterDate } from '../../../test/mocks/filterBar';
import { trigramsDb, type TrigramData } from '#lib/services/trigramsDb.ts';
import Page from './+page.svelte';

const at = (search: string) => setMockPage({ url: new URL(`http://localhost/text-analytics/trigrams${search}`) });
const workspaces = () => vi.mocked(trigramsDb.getTrigramsResult).mock.calls.map(([, workspace]) => workspace);

const trigram = (text: string, frequency: number): TrigramData => ({
  trigram: text,
  frequency,
  sentiment: 0.1,
  platforms: ['twitter'],
  trend: 'stable',
  firstSeen: '2026-01-01',
  lastSeen: '2026-01-07',
  averageEngagement: 3,
  topPosts: []
});

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(trigramsDb.getTrigramsResult).mockReset().mockResolvedValue({ data: [], truncated: false } as never);
  stubApi(() => ({ success: true, data: [] }));
});

afterEach(() => {
  cleanup();
  resetMockPage();
  vi.unstubAllGlobals();
});

describe('trigrams page', () => {
  it('loads the phrases of the workspace named in the URL', async () => {
    at('?workspace=4');

    render(Page);

    await waitFor(() => expect(workspaces()).toEqual(['4']));
  });

  it('loads for all workspaces when the URL names none', async () => {
    at('');

    render(Page);

    await waitFor(() => expect(workspaces()).toEqual([undefined]));
  });

  it('lists only the phrases that meet the minimum frequency', async () => {
    at('');
    vi.mocked(trigramsDb.getTrigramsResult).mockResolvedValue({ data: [trigram('state of emergency', 5), trigram('rare phrase here', 1), trigram('another common phrase', 3)], truncated: false } as never);

    render(Page);

    expect(await screen.findByText('2 results')).toBeInTheDocument();
    expect(screen.queryByText('rare phrase here')).toBeNull();
  });

  it('reloads for the workspace the page is on now when the date range changes after navigation', async () => {
    at('?workspace=4');
    render(Page);
    await waitFor(() => expect(workspaces()).toEqual(['4']));

    at('?workspace=5');
    await typeFilterDate('Start date', '2026-02-01');

    await waitFor(() => expect(workspaces()).toEqual(['4', '5']));
  });
});
