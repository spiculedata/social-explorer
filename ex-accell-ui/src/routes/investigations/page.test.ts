import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const hoisted = vi.hoisted(() => ({ goto: vi.fn() }));

vi.mock('$app/navigation', () => ({ goto: hoisted.goto }));
vi.mock('$app/state', () => import('../../test/mocks/pageState.svelte'));

import { resetMockPage, setMockPage } from '../../test/mocks/pageState.svelte';
import { currentProject } from '#lib/stores/projectStore.ts';
import { requested, stubApi } from '../../test/mocks/apiStub';
import Page from './+page.svelte';

const at = (search: string) => setMockPage({ url: new URL(`http://localhost/investigations${search}`) });
const listCalls = (urls: string[]) => urls.filter((url) => url.startsWith('/api/investigations'));

const investigation = { id: '7', name: 'Port strike', description: '', keywords: ['port'], date_start: '', date_end: '', sources: ['social'], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

const api = () =>
  stubApi((url) =>
    url.startsWith('/api/workspace-overview')
      ? { success: true, workspace: { name: 'Harbour' } }
      : url.startsWith('/api/investigations')
        ? { success: true, investigations: [investigation] }
        : { success: true }
  );

afterEach(() => {
  cleanup();
  resetMockPage();
  currentProject.set(null);
  hoisted.goto.mockReset();
  vi.unstubAllGlobals();
});

describe('investigations list page', () => {
  it('lists every investigation when the URL names no workspace or project', async () => {
    at('');
    const urls = api();

    render(Page);

    expect(await screen.findByText('Port strike')).toBeInTheDocument();
    expect(listCalls(urls)).toEqual(['/api/investigations']);
    expect(screen.getByText(/All projects/)).toBeInTheDocument();
  });

  it('lists only the workspace in the URL, names it, and opens the form inside it', async () => {
    at('?workspace=3');
    const urls = api();

    render(Page);

    expect(await screen.findByText('Will be created in workspace:')).toBeInTheDocument();
    expect(listCalls(urls)).toEqual(['/api/investigations?workspace_id=3']);
    expect(await screen.findByText('Harbour', { selector: 'span.font-medium' })).toBeInTheDocument();
  });

  it('lists the project in the URL and labels it', async () => {
    at('?project=5');
    const urls = api();

    render(Page);

    expect(await screen.findByText(/In project: #5/)).toBeInTheDocument();
    expect(listCalls(urls)).toEqual(['/api/investigations?project_id=5']);
  });

  it('reloads the list when "Show all" drops the workspace after mount', async () => {
    at('?project=5');
    const urls = api();
    render(Page);
    await screen.findByText('Port strike');

    at('');

    await waitFor(() => expect(listCalls(urls)).toEqual(['/api/investigations?project_id=5', '/api/investigations']));
    expect(await screen.findByText(/All projects/)).toBeInTheDocument();
  });

  it('reloads for another workspace when the workspace in the URL changes after mount', async () => {
    at('?workspace=3');
    const urls = api();
    render(Page);
    await screen.findByText('Port strike');

    at('?workspace=4');

    await waitFor(() => expect(listCalls(urls)).toEqual(['/api/investigations?workspace_id=3', '/api/investigations?workspace_id=4']));
    expect(requested(urls, '/api/workspace-overview?id=4')).toHaveLength(1);
  });

  it('ignores a workspace that is not a positive whole number', async () => {
    at('?workspace=abc');
    const urls = api();

    render(Page);

    await screen.findByText('Port strike');
    expect(listCalls(urls)).toEqual(['/api/investigations']);
  });

  it('creates an investigation in the workspace the form was opened for, then opens it', async () => {
    at('?workspace=3');
    api();
    render(Page);
    await fireEvent.input(await screen.findByLabelText('Title'), { target: { value: 'Quay talk' } });
    vi.mocked(fetch).mockImplementation(((url: string, init?: RequestInit) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(init?.method === 'POST' ? { success: true, investigation: { id: 21 } } : { success: true, investigations: [] }) })) as never);

    await fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));

    await waitFor(() => expect(hoisted.goto).toHaveBeenCalledWith('/investigations/21'));
    const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ name: 'Quay talk', workspace_id: 3 });
  });
});
