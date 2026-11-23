import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const hoisted = vi.hoisted(() => ({ replaceState: vi.fn() }));

vi.mock('$app/env', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ replaceState: hoisted.replaceState }));
vi.mock('$app/state', () => import('../../../test/mocks/pageState.svelte'));

import { resetMockPage, setMockPage } from '../../../test/mocks/pageState.svelte';
import FilterBar from './FilterBar.svelte';

const datasets = [
  { id: 1, name: 'Tweets', dataset_type: 'social_media', source_platform: 'twitter' },
  { id: 2, name: 'Posts', dataset_type: 'social_media', source_platform: 'telegram' },
  { id: 3, name: 'Shows', dataset_type: 'radio', source_platform: 'radio' }
];

type Change = { workspaceId: string | null; enabledDatasets: number[]; platforms: string[]; dateStart: string | null; dateEnd: string | null };

/** Mounts the bar and collects what it reports as changed. */
function mountBar(props: Record<string, unknown> = {}) {
  const changes: Change[] = [];
  const onchange = (detail: Change) => changes.push(detail);
  const view = render(FilterBar, { props: { datasetTypes: ['social_media'], ...props, onchange } });
  return { changes, view };
}

/** Types a date the way a person does: the input updates the field, the change event reports it. */
async function setDate(label: string, value: string) {
  const input = screen.getByLabelText(label);
  await fireEvent.input(input, { target: { value } });
  await fireEvent.change(input);
}

const lastChange = (changes: Change[]) => changes[changes.length - 1];

beforeEach(() => {
  sessionStorage.clear();
  hoisted.replaceState.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ datasets }) } as Response))
  );
});

afterEach(() => {
  cleanup();
  resetMockPage();
  vi.unstubAllGlobals();
});

describe('FilterBar', () => {
  it('lists only the datasets of the requested types, all switched on, and reports them', async () => {
    const { changes } = mountBar();

    expect(await screen.findByRole('button', { name: /Tweets/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Posts/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Shows/ })).toBeNull();
    // Every loaded dataset is switched on, including those of other types; only the visible ones count as platforms
    expect(lastChange(changes).enabledDatasets).toEqual([1, 2, 3]);
    expect(lastChange(changes).platforms.sort()).toEqual(['telegram', 'twitter']);
  });

  it('asks for the workspace datasets when given a workspace', async () => {
    mountBar({ workspaceId: '7' });

    await screen.findByRole('button', { name: /Tweets/ });

    expect(fetch).toHaveBeenCalledWith('/api/datasets?workspace_id=7');
  });

  it('switches a source off and back on, narrowing the reported platforms', async () => {
    const { changes } = mountBar();
    await fireEvent.click(await screen.findByRole('button', { name: /Tweets/ }));

    expect(lastChange(changes).enabledDatasets).toEqual([2, 3]);
    expect(lastChange(changes).platforms).toEqual(['telegram']);

    await fireEvent.click(screen.getByRole('button', { name: /Tweets/ }));

    expect(lastChange(changes).enabledDatasets.sort()).toEqual([1, 2, 3]);
  });

  it('switches every source off with None and on with All', async () => {
    const { changes } = mountBar();
    await fireEvent.click(await screen.findByRole('button', { name: 'None' }));
    expect(lastChange(changes).enabledDatasets).toEqual([]);

    await fireEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(lastChange(changes).enabledDatasets.sort()).toEqual([1, 2]);
  });

  it('calls onReady once with the filter parameters after the first load', async () => {
    const onReady = vi.fn();
    mountBar({ workspaceId: '7', onReady });

    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    expect(onReady.mock.calls[0][0]).toMatchObject({ workspace_id: '7' });
    expect(onReady.mock.calls[0][0].platforms.split(',').sort()).toEqual(['telegram', 'twitter']);
  });

  it('starts from the date range in the page URL', async () => {
    setMockPage({ url: new URL('http://localhost/x?date_start=2026-01-01&date_end=2026-02-01') });
    const { changes } = mountBar();

    await screen.findByRole('button', { name: /Tweets/ });

    expect(screen.getByLabelText('Start date')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('End date')).toHaveValue('2026-02-01');
    expect(lastChange(changes)).toMatchObject({ dateStart: '2026-01-01', dateEnd: '2026-02-01' });
  });

  it('writes a new date range into the URL of the page it is on now, not the one it mounted on', async () => {
    setMockPage({ url: new URL('http://localhost/first?workspace=1') });
    mountBar();
    await screen.findByRole('button', { name: /Tweets/ });
    hoisted.replaceState.mockClear();

    setMockPage({ url: new URL('http://localhost/second?workspace=2') });
    await setDate('Start date', '2026-03-01');

    const [next] = hoisted.replaceState.mock.calls[hoisted.replaceState.mock.calls.length - 1];
    expect(next.pathname).toBe('/second');
    expect(next.searchParams.get('workspace')).toBe('2');
    expect(next.searchParams.get('date_start')).toBe('2026-03-01');
  });

  it('sets a quick range and clears it again', async () => {
    const { changes } = mountBar();
    await fireEvent.click(await screen.findByRole('button', { name: '7d' }));

    expect(lastChange(changes).dateStart).toBeTruthy();
    expect(lastChange(changes).dateEnd).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(lastChange(changes)).toMatchObject({ dateStart: null, dateEnd: null });
  });

  it('refuses a range that ends before it starts', async () => {
    const { changes } = mountBar();
    await screen.findByRole('button', { name: /Tweets/ });
    const before = changes.length;

    await setDate('Start date', '2026-05-01');
    await setDate('End date', '2026-04-01');

    expect(await screen.findByRole('alert')).toHaveTextContent('The start date must be on or before the end date');
    expect(changes.length).toBeGreaterThanOrEqual(before);
    expect(lastChange(changes).dateEnd).not.toBe('2026-04-01');
  });

  it('shows only the dates when asked, without loading datasets', async () => {
    const { changes } = mountBar({ datesOnly: true });

    expect(await screen.findByLabelText('Start date')).toBeInTheDocument();
    expect(screen.queryByText('Sources:')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(changes.length).toBeGreaterThan(0);
  });

  it('says so when there are no sources of the requested type', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ datasets: [] }) } as Response)));
    mountBar();

    await waitFor(() => expect(screen.queryByText('Loading data sources...')).toBeNull());

    expect(screen.queryByRole('button', { name: /Tweets/ })).toBeNull();
    expect(screen.getByText(/no|No/)).toBeInTheDocument();
  });
});
