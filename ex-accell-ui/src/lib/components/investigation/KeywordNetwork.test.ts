import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import KeywordNetwork from './KeywordNetwork.svelte';

// jsdom has no ResizeObserver; the component only uses it to learn its drawn width.
class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}

// The tooltip is the div that starts hidden and is filled on hover.
const tooltip = (container: HTMLElement) => container.querySelector<HTMLDivElement>('.z-50')!;

/** Hovers the node for `keyword` so the component fills its tooltip. */
function hoverKeyword(container: HTMLElement, keyword: string) {
	const text = [...container.querySelectorAll('svg text')].find((t) => t.textContent === keyword);
	if (!text) throw new Error(`no node rendered for keyword ${keyword}`);
	// The d3 listeners sit on the node group, the direct parent of the circle and its label.
	text.parentElement!.dispatchEvent(new MouseEvent('mouseenter', { clientX: 10, clientY: 10 }));
	return tooltip(container);
}

beforeEach(() => {
	vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('KeywordNetwork tooltip', () => {
	it('renders a saved keyword containing markup as text, never as markup', () => {
		const { container } = render(KeywordNetwork, {
			props: { data: [{ keyword: '<img src=x>', gdelt_count: 1, radio_count: 2, social_count: 3 }] }
		});

		const el = hoverKeyword(container, '<img src=x>');
		expect(el).not.toBeNull();
		expect(el!.style.display).toBe('block');
		expect(el!.textContent).toContain('<img src=x>');
		expect(el!.querySelector('img')).toBeNull();
		expect(el!.querySelector('div')).not.toBeNull();
	});
});
