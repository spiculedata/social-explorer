import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

const hoisted = vi.hoisted(() => ({ goto: vi.fn() }));

vi.mock('$app/navigation', () => ({ goto: hoisted.goto }));
vi.mock('$app/state', () => import('../../test/mocks/pageState.svelte'));

import { resetMockPage, setMockPage } from '../../test/mocks/pageState.svelte';
import Page from './+page.svelte';

afterEach(() => {
  cleanup();
  resetMockPage();
  hoisted.goto.mockReset();
});

describe('data processing redirect', () => {
  it('sends the visitor to the workflows tab of data management', () => {
    setMockPage({ url: new URL('http://localhost/data-processing') });

    render(Page);

    expect(screen.getByText('Redirecting to Data Management...')).toBeInTheDocument();
    expect(hoisted.goto).toHaveBeenCalledWith('/data-management?tab=workflows', { replaceState: true });
  });

  it('keeps the workspace named in the URL', () => {
    setMockPage({ url: new URL('http://localhost/data-processing?workspace=6') });

    render(Page);

    expect(hoisted.goto).toHaveBeenCalledWith('/data-management?workspace=6&tab=workflows', { replaceState: true });
  });
});
