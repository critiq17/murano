/**
 * Development flag, with no runtime dependency and no bundler assumption.
 *
 * Vite's own build-time env object only exists under Vite, and pulling in `esm-env` would break
 * the zero-dependency rule. Every major bundler statically replaces the literal
 * `process.env.NODE_ENV`, so in a production build this collapses to `false` and the guarded
 * warnings are dropped as dead code. Unbundled in a browser, `process` is undefined and the
 * flag is simply `false`: no dev warnings, and nothing throws.
 */
export const DEV: boolean =
	typeof process !== 'undefined' && process.env ? process.env.NODE_ENV !== 'production' : false;
