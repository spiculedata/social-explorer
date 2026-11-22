import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';

vi.mock('$app/env', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => import('../../../test/mocks/pageState.svelte'));
vi.mock('#lib/utils/echarts.ts', () => ({ waitForEcharts: () => new Promise(() => {}), initChart: vi.fn() }));
vi.mock('#lib/services/languageDetectionDb.ts');

import { resetMockPage, setMockPage } from '../../../test/mocks/pageState.svelte';
import { stubApi } from '../../../test/mocks/apiStub';
import { typeFilterDate } from '../../../test/mocks/filterBar';
import { languageDetectionDb } from '#lib/services/languageDetectionDb.ts';
import Page from './+page.svelte';

const at = (search: string) => setMockPage({ url: new URL(`http://localhost/text-analytics/language-detection${search}`) });
const statsCalls = () => vi.mocked(languageDetectionDb.getLanguageStats).mock.calls.map(([workspace]) => workspace);

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(languageDetectionDb.getLanguageStats).mockReset().mockResolvedValue([]);
  vi.mocked(languageDetectionDb.getLanguageAnalysis).mockReset().mockResolvedValue([]);
  vi.mocked(languageDetectionDb.getLanguageDetectionStats).mockReset().mockResolvedValue({} as never);
  vi.mocked(languageDetectionDb.getSamplePosts).mockReset().mockResolvedValue([]);
  vi.mocked(languageDetectionDb.getLanguageMixing).mockReset().mockResolvedValue([]);
  vi.mocked(languageDetectionDb.getGeographicDistribution).mockReset().mockResolvedValue([]);
  stubApi((url) => (url.includes('/api/datasets') ? { success: true, datasets: [{ id: 1, name: 'Posts', dataset_type: 'social_media', source_platform: 'twitter' }] } : { success: true, data: [] }));
});

afterEach(() => {
  cleanup();
  resetMockPage();
  vi.unstubAllGlobals();
});

describe('language detection page', () => {
  it('loads the languages of the workspace named in the URL', async () => {
    at('?workspace=4');

    render(Page);

    await waitFor(() => expect(statsCalls()).toEqual(['4']));
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

    at('?workspace=5');
    await typeFilterDate('Start date', '2026-02-01');

    await waitFor(() => expect(statsCalls()).toEqual(['4', '5']));
  });
});
