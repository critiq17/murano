import sveltePlugin from 'esbuild-svelte';

/**
 * size-limit bundles with esbuild, which has no idea what a `.svelte` file is. The plugin
 * compiles them, so the component entries measure what an app actually ships rather than
 * failing outright.
 *
 * The numbers that matter are the first and third rows: what you pay for the imperative core
 * alone, and what you pay for the primitive. The barrels are ceilings, not targets.
 */
const withSvelte = (config) => {
	config.plugins = [
		...(config.plugins ?? []),
		sveltePlugin({ compilerOptions: { css: 'external' } })
	];
	config.conditions = ['svelte', 'import', 'default'];
	return config;
};

export default [
	{
		name: 'createGlass only',
		path: 'dist/core/index.js',
		import: '{ createGlass }',
		limit: '6 kB',
		modifyEsbuildConfig: withSvelte
	},
	{
		name: 'core barrel',
		path: 'dist/core/index.js',
		limit: '8 kB',
		modifyEsbuildConfig: withSvelte
	},
	{
		name: 'GlassSurface',
		path: 'dist/index.js',
		import: '{ GlassSurface }',
		limit: '11 kB',
		ignore: ['svelte', 'svelte/internal', 'svelte/internal/client'],
		modifyEsbuildConfig: withSvelte
	},
	{
		name: 'full barrel',
		path: 'dist/index.js',
		limit: '28 kB',
		ignore: ['svelte', 'svelte/internal', 'svelte/internal/client'],
		modifyEsbuildConfig: withSvelte
	},
	{ name: 'styles', path: 'dist/styles/index.css', limit: '3 kB' }
];
