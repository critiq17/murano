import adapter from '@sveltejs/adapter-static';
import { mdsvex } from 'mdsvex';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	extensions: ['.svelte', '.md'],
	preprocess: [vitePreprocess(), mdsvex({ extensions: ['.md'] })],
	kit: {
		adapter: adapter({ fallback: '404.html' }),
		// GitHub Pages serves this repository as a project site. Keep local preview at `/`,
		// while Actions automatically builds with `/murano` as the base path.
		paths: { base: process.env.BASE_PATH ?? (process.env.GITHUB_ACTIONS ? '/murano' : '') },
		alias: {
			'@murano': '../../packages/murano/src/lib'
		}
	}
};
