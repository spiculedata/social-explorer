import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';

const hoisted = vi.hoisted(() => ({ signOut: vi.fn(), signOutEverywhere: vi.fn() }));

vi.mock('$app/state', () => import('../../test/mocks/pageState.svelte'));
vi.mock('#lib/utils/signOut.ts', () => ({ signOut: hoisted.signOut, signOutEverywhere: hoisted.signOutEverywhere }));

import { resetMockPage, setMockPage } from '../../test/mocks/pageState.svelte';
import UserMenu from './UserMenu.svelte';

const admin = { name: 'Ada Admin', email: 'ada@example.com', role: 'admin' };
const viewer = { name: 'Vic Viewer', email: 'vic@example.com', role: 'viewer' };

afterEach(() => {
  cleanup();
  resetMockPage();
  hoisted.signOut.mockReset();
  hoisted.signOutEverywhere.mockReset();
});

describe('UserMenu', () => {
  it('renders nothing while nobody is signed in', () => {
    setMockPage({ data: { user: null } });

    render(UserMenu);

    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('shows the signed-in user and follows the page data when it changes', async () => {
    setMockPage({ data: { user: admin } });
    render(UserMenu);
    expect(screen.getByText('Ada Admin')).toBeInTheDocument();

    setMockPage({ data: { user: viewer } });

    expect(await screen.findByText('Vic Viewer')).toBeInTheDocument();
    expect(screen.queryByText('Ada Admin')).toBeNull();
  });

  it('offers Manage users to admins only', async () => {
    setMockPage({ data: { user: viewer } });
    render(UserMenu);
    expect(screen.queryByRole('link', { name: 'Manage users' })).toBeNull();

    setMockPage({ data: { user: admin } });

    expect(await screen.findByRole('link', { name: 'Manage users' })).toBeInTheDocument();
  });

  it('signs out, and disables both buttons while it does', async () => {
    hoisted.signOut.mockReturnValue(new Promise(() => {}));
    setMockPage({ data: { user: admin } });
    render(UserMenu);

    await fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(hoisted.signOut).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sign out on all devices' })).toBeDisabled();
  });

  it('signs out everywhere from the menu', async () => {
    setMockPage({ data: { user: admin } });
    render(UserMenu);

    await fireEvent.click(screen.getByRole('button', { name: 'Sign out on all devices' }));

    expect(hoisted.signOutEverywhere).toHaveBeenCalledOnce();
  });
});
