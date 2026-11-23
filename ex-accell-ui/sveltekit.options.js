import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// SvelteKit 3 no longer reads svelte.config.js. These options are passed to the `sveltekit()` Vite plugin in
// vite.config.ts and vitest.config.ts, and csp.test.ts imports them, so there is one definition of the policy.
/** @type {import('@sveltejs/kit/vite').Config} */
export const sveltekitOptions = {
	preprocess: vitePreprocess(),

	// Node server output, used by the Dockerfile (`node build`)
	adapter: adapter(),

	// Scripts run only from this site (the framework's own inline scripts get a per-response nonce), nothing is evaluated
	// from strings, and the page cannot call other servers, be framed by other sites or load plugins. Styles allow inline
	// because the UI and its charts set style attributes. Images and media may come from any https site (map tiles, post
	// images, radio streams); frames from any http(s) site, because the Jupyter server has its own address.
	csp: {
		mode: 'auto',
		directives: {
			'default-src': ['self'],
			'script-src': ['self'],
			'style-src': ['self', 'unsafe-inline'],
			'img-src': ['self', 'data:', 'blob:', 'https:'],
			'font-src': ['self', 'data:'],
			'connect-src': ['self'],
			'media-src': ['self', 'blob:', 'https:'],
			'frame-src': ['self', 'http:', 'https:'],
			'worker-src': ['self', 'blob:'],
			'object-src': ['none'],
			'base-uri': ['self'],
			'form-action': ['self'],
			'frame-ancestors': ['self']
		}
	}
};
