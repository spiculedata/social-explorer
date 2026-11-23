import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

vi.mock('$app/state', () => import('../../test/mocks/pageState.svelte'));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { resetMockPage, setMockPage } from '../../test/mocks/pageState.svelte';
import { stubApi } from '../../test/mocks/apiStub';
import Page from './+page.svelte';

const admin = { id: '1', email: 'root@example.com', name: 'Root', role: 'admin' };
const viewer = { id: '2', email: 'vic@example.com', name: 'Vic', role: 'viewer' };
const notice = /Only administrators can generate, publish or import/;

const api = () =>
  stubApi((url) =>
    url.includes('action=status')
      ? { success: true, data: { enabled: true } }
      : url.includes('action=list')
        ? { success: true, packages: [] }
        : url.includes('action=registry')
          ? { success: true, enabled: true, packages: [] }
          : { success: true, datasets: [] }
  );

afterEach(() => {
  cleanup();
  resetMockPage();
  vi.unstubAllGlobals();
});

describe('/data-sharing role', () => {
  it('tells a viewer that only administrators can publish, and stops telling them once they are one', async () => {
    setMockPage({ data: { user: viewer } });
    api();
    render(Page);
    expect(await screen.findByText(notice)).toBeInTheDocument();

    setMockPage({ data: { user: admin } });

    await vi.waitFor(() => expect(screen.queryByText(notice)).toBeNull());
  });

  it('does not tell an administrator, and does once they are a viewer', async () => {
    setMockPage({ data: { user: admin } });
    api();
    render(Page);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByText(notice)).toBeNull();

    setMockPage({ data: { user: viewer } });

    expect(await screen.findByText(notice)).toBeInTheDocument();
  });
});
