import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn(), goto: vi.fn() }));
vi.mock('$app/state', () => import('../test/mocks/pageState.svelte'));
vi.mock('#lib/components/Navigation.svelte', () => import('../test/stubs/NavStub.svelte'));

import { resetMockPage, setMockPage } from '../test/mocks/pageState.svelte';
import { projectNotice } from '#lib/stores/projectStore.ts';
import { sessionExpired } from '#lib/utils/sessionExpiry.ts';
import Layout from './+layout.svelte';

const children = createRawSnippet(() => ({ render: () => '<p data-testid="content">page content</p>' }));

const at = (path: string) => setMockPage({ url: new URL(`http://localhost${path}`) });

beforeEach(() => {
  projectNotice.set(null);
  sessionExpired.set(false);
});

afterEach(() => {
  cleanup();
  resetMockPage();
});

describe('root layout', () => {
  it('shows the navigation and the page content', () => {
    at('/projects');

    render(Layout, { children, $$slots: { default: true } });

    expect(screen.getByTestId('nav-stub')).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
  });

  it('hides the navigation on the login page', () => {
    at('/login');

    render(Layout, { children, $$slots: { default: true } });

    expect(screen.queryByTestId('nav-stub')).toBeNull();
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('hides the navigation on the investigation workbench and brings it back when the route changes', async () => {
    at('/investigations/12');
    render(Layout, { children, $$slots: { default: true } });
    expect(screen.queryByTestId('nav-stub')).toBeNull();

    at('/projects');

    expect(await screen.findByTestId('nav-stub')).toBeInTheDocument();

    at('/login');

    await vi.waitFor(() => expect(screen.queryByTestId('nav-stub')).toBeNull());
  });

  it('keeps the navigation on the investigations list', () => {
    at('/investigations');

    render(Layout, { children, $$slots: { default: true } });

    expect(screen.getByTestId('nav-stub')).toBeInTheDocument();
  });

  it('points the expired-session notice back at the current page, and follows the route', async () => {
    sessionExpired.set(true);
    at('/dashboards?workspace=3');
    render(Layout, { children, $$slots: { default: true } });
    expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/login?next=%2Fdashboards%3Fworkspace%3D3');

    at('/projects');

    await vi.waitFor(() =>
      expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/login?next=%2Fprojects')
    );
  });

  it('shows a project notice that can be dismissed', async () => {
    projectNotice.set('Project archived');
    at('/projects');
    render(Layout, { children, $$slots: { default: true } });
    expect(screen.getByText('Project archived')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText('Project archived')).toBeNull();
  });
});
