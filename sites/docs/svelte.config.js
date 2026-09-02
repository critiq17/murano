import adapter from '@sveltejs/adapter-static';
import { mdsvex } from 'mdsvex';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	extensions: ['.svelte', '.md'],
	preprocess: [vitePreprocess(), mdsvex({ extensions: ['.md'] })],
	kit: {
		adapter: adapter({ fallback: '404.html' }),
		paths: { base: process.env.BASE_PATH ?? '' },
		alias: {
			'@murano': '../../packages/murano/src/lib'
		}
	}
};
