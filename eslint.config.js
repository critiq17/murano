import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default ts.config(
	js.configs.recommended,
	...ts.configs.strict,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{ languageOptions: { globals: { ...globals.browser, ...globals.node } } },
	{
		files: ['**/*.svelte'],
		languageOptions: { parserOptions: { parser: ts.parser } }
	},
	{
		// A test that reaches into a DOM query result IS the assertion that it exists: if the
		// value is missing the test fails, which is the outcome we want. Forcing a guard around
		// every lookup buries the thing being tested.
		files: ['**/*.{test,spec}.{js,ts}', '**/e2e/**'],
		rules: { '@typescript-eslint/no-non-null-assertion': 'off' }
	},
	{ ignores: ['**/dist/', '**/.svelte-kit/', '**/build/', '**/node_modules/'] }
);
