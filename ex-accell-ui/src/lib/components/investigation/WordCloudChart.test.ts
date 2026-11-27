import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import WordCloudChart from './WordCloudChart.svelte';

vi.mock('#lib/utils/wordCloudLayout.ts', () => ({
	layoutWordCloud: (words: { text: string; size: number; rawSize: number }[]) =>
		words.map((w, i) => ({ ...w, x: (i + 1) * 40, y: 20, rotate: 0 }))
}));

// jsdom has no ResizeObserver; the component only uses it to learn its drawn width.
class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}

// The tooltip is the div that starts hidden and is filled on hover.
const tooltip = (container: HTMLElement) => container.querySelector<HTMLDivElement>('.z-50')!;

beforeEach(() => {
	vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('WordCloudChart tooltip', () => {
	it('renders a saved word containing markup as text, never as markup', () => {
		const { container } = render(WordCloudChart, {
			props: { words: [{ text: '<img src=x>', size: 20 }] }
		});

		const word = container.querySelector('svg text');
		expect(word).not.toBeNull();
		word!.dispatchEvent(new MouseEvent('mouseenter', { clientX: 10, clientY: 10 }));

		const el = tooltip(container);
		expect(el).not.toBeNull();
		expect(el!.style.display).toBe('block');
		expect(el!.textContent).toContain('<img src=x>');
		expect(el!.querySelector('img')).toBeNull();
	});
});
