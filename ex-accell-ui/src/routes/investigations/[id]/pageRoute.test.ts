import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), beforeNavigate: vi.fn() }));
vi.mock('$app/state', () => import('../../../test/mocks/pageState.svelte'));

// The d3 charts draw nothing useful without layout, so stand-ins show what they were given
vi.mock('#lib/components/investigation/SwimLaneTimeline.svelte', async () => ({
  default: (await import('../../../test/stubs/TimelineStub.svelte')).default
}));
vi.mock('#lib/components/investigation/portals/SentimentPortal.svelte', async () => ({
  default: (await import('../../../test/stubs/PortalStub.svelte')).default
}));
vi.mock('#lib/components/investigation/portals/VolumePortal.svelte', async () => ({
  default: (await import('../../../test/stubs/PortalStub.svelte')).default
}));
vi.mock('#lib/components/investigation/portals/CorrelationPortal.svelte', async () => ({
  default: (await import('../../../test/stubs/PortalStub.svelte')).default
}));
vi.mock('#lib/components/investigation/portals/TopicsPortal.svelte', async () => ({
  default: (await import('../../../test/stubs/PortalStub.svelte')).default
}));
vi.mock('#lib/components/investigation/portals/GeographyPortal.svelte', async () => ({
  default: (await import('../../../test/stubs/PortalStub.svelte')).default
}));
vi.mock('#lib/components/investigation/portals/ActorsPortal.svelte', async () => ({
  default: (await import('../../../test/stubs/PortalStub.svelte')).default
}));

import { resetMockPage, setMockPage } from '../../../test/mocks/pageState.svelte';
import { clearSelection } from '#lib/stores/investigationStore.ts';
import Page from './+page.svelte';

const investigation = { id: '5', name: 'Border Talks', description: '', keywords: ['border'], date_start: '2026-01-01', date_end: '2026-01-31', sources: [], created_at: '2026-01-01', annotations: [] };

const reply = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

function stubFetch() {
  const calls = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'PATCH') return reply({ success: true });
    if (url.startsWith('/api/investigations')) return reply({ success: true, investigation });
    return reply({ success: true, data: [] });
  });
  vi.stubGlobal('fetch', calls);
  return calls;
}

afterEach(() => {
  cleanup();
  resetMockPage();
  clearSelection();
  vi.unstubAllGlobals();
});

describe('investigation workbench route', () => {
  it('loads the investigation named in the route', async () => {
    setMockPage({ params: { id: '5' } });
    const fetchMock = stubFetch();

    render(Page);

    expect(await screen.findByRole('heading', { name: 'Border Talks' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain('/api/investigations?id=5');
  });

  it('saves notes to the investigation the route names now', async () => {
    setMockPage({ params: { id: '5' } });
    const fetchMock = stubFetch();
    render(Page);
    await screen.findByRole('heading', { name: 'Border Talks' });
    await fireEvent.click(screen.getByRole('button', { name: 'Notes' }));

    setMockPage({ params: { id: '6' } });
    const input = screen.getByPlaceholderText('Add note...');
    await fireEvent.input(input, { target: { value: 'A thought' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(true));
    const patch = fetchMock.mock.calls.find((call) => call[1]?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body)).id).toBe('6');
  });
});
