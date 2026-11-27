import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// The one cross-origin origin a page may frame: the JupyterLab server. Defaults to the loopback address the app
// launches Jupyter on (`src/lib/server/jupyter.ts`); a Jupyter run elsewhere is named by JUPYTER_URL, whose origin
// becomes the frame source. Narrowed so an injected <iframe> cannot point at any http(s) site. The cast is for the
// type checker only: SvelteKit's CSP types are a closed union of string literals and cannot name a configured host,
// so the computed origin is typed as the default loopback form it takes when JUPYTER_URL is unset.
const JUPYTER_FRAME_SRC = /** @type {'http://localhost:8888'} */ (
	(() => {
		try {
			const raw = process.env.JUPYTER_URL;
			if (raw) return new URL(raw).origin;
		} catch {
			// An unparseable JUPYTER_URL falls back to the default rather than widening the policy.
		}
		return 'http://localhost:8888';
	})()
);

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
	// images, radio streams). The only cross-origin frame the app embeds is JupyterLab, whose origin is fixed here so an
	// injected <iframe> cannot load an arbitrary site: the loopback address the app launches Jupyter on, or the origin
	// of an external Jupyter set in JUPYTER_URL at build time (changing it needs a rebuild, like any other build config).
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
			'frame-src': ['self', JUPYTER_FRAME_SRC],
			'worker-src': ['self', 'blob:'],
			'object-src': ['none'],
			'base-uri': ['self'],
			'form-action': ['self'],
			'frame-ancestors': ['self']
		}
	}
};
