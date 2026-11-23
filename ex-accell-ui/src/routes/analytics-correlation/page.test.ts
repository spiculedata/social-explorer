import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';

vi.mock('$app/env', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => import('../../test/mocks/pageState.svelte'));
vi.mock('#lib/utils/echarts.ts', () => ({ waitForEcharts: () => new Promise(() => {}), initChart: vi.fn() }));

import { resetMockPage, setMockPage } from '../../test/mocks/pageState.svelte';
import { queryOf, requested, stubApi } from '../../test/mocks/apiStub';
import Page from './+page.svelte';

const at = (search: string) => setMockPage({ url: new URL(`http://localhost/analytics-correlation${search}`) });
const workspacesAsked = (urls: string[]) => requested(urls, 'type=cross-platform-sentiment').map((url) => queryOf(url).get('workspace_id'));

afterEach(() => {
  cleanup();
  resetMockPage();
  vi.unstubAllGlobals();
});

describe('analytics correlation page', () => {
  it('loads every panel for the workspace named in the URL', async () => {
    at('?workspace=4');

    const urls = stubApi();
    render(Page);

    await waitFor(() => expect(requested(urls, '/api/unified-analytics')).toHaveLength(6));
    expect(new Set(requested(urls, '/api/unified-analytics').map((url) => queryOf(url).get('workspace_id')))).toEqual(new Set(['4']));
  });

  it('loads for all workspaces when the URL names none', async () => {
    at('');

    const urls = stubApi();
    render(Page);

    await waitFor(() => expect(workspacesAsked(urls)).toEqual([null]));
  });

  it('loads again for the new workspace when the URL changes after mount, and not for other changes', async () => {
    at('?workspace=4');
    const urls = stubApi();
    render(Page);
    await waitFor(() => expect(workspacesAsked(urls)).toEqual(['4']));

    at('?workspace=4&date_start=2026-01-01');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(workspacesAsked(urls)).toEqual(['4']);

    at('?workspace=5');

    await waitFor(() => expect(workspacesAsked(urls)).toEqual(['4', '5']));
  });
});
