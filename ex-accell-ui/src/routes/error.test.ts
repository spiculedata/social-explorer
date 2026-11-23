import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

vi.mock('$app/state', () => import('../test/mocks/pageState.svelte'));

import { resetMockPage, setMockPage } from '../test/mocks/pageState.svelte';
import ErrorPage from './+error.svelte';

afterEach(() => {
  cleanup();
  resetMockPage();
});

describe('+error page', () => {
  it('says the page was not found for a 404', () => {
    setMockPage({ status: 404 });

    render(ErrorPage);

    expect(screen.getByRole('heading', { name: 'We could not find that page' })).toBeInTheDocument();
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('says something went wrong for any other status', () => {
    setMockPage({ status: 500 });

    render(ErrorPage);

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText('We could not complete that request. Try again in a moment.')).toBeInTheDocument();
  });

  it('follows the status when it changes after mount', async () => {
    setMockPage({ status: 404 });
    render(ErrorPage);

    setMockPage({ status: 500 });

    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
  });
});
