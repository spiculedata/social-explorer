import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';

const hoisted = vi.hoisted(() => ({ goto: vi.fn() }));

vi.mock('$app/navigation', () => ({ goto: hoisted.goto }));
vi.mock('$app/state', () => import('../../test/mocks/pageState.svelte'));
vi.mock('#lib/stores/projectStore.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/stores/projectStore.ts')>()),
  loadCurrentProject: vi.fn()
}));

import { resetMockPage, setMockPage } from '../../test/mocks/pageState.svelte';
import { stubApi } from '../../test/mocks/apiStub';
import Page from './+page.svelte';

const at = (search: string) => setMockPage({ url: new URL(`http://localhost/text-analytics${search}`) });
const openSentiment = () => fireEvent.click(screen.getByText('Sentiment Analysis'));

afterEach(() => {
  cleanup();
  resetMockPage();
  hoisted.goto.mockReset();
  vi.unstubAllGlobals();
});

describe('text analytics index page', () => {
  it('opens a tool without a workspace when the URL names none', async () => {
    stubApi();
    at('');
    render(Page);

    await openSentiment();

    expect(hoisted.goto).toHaveBeenCalledWith('/text-analytics/sentiment-analysis');
  });

  it('carries the workspace of the URL into the tool it opens, and follows it when it changes', async () => {
    stubApi();
    at('?workspace=4');
    render(Page);
    await openSentiment();
    expect(hoisted.goto).toHaveBeenLastCalledWith('/text-analytics/sentiment-analysis?workspace=4');

    at('?workspace=9');
    await openSentiment();

    expect(hoisted.goto).toHaveBeenLastCalledWith('/text-analytics/sentiment-analysis?workspace=9');
  });
});
