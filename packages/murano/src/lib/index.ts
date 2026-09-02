/**
 * murano — Apple-grade Liquid Glass for Svelte 5.
 *
 * Import the stylesheet once in your root layout:
 * ```js
 * import 'murano/styles.css';
 * ```
 */

// The primitive. Everything else is built on it.
export { default as GlassSurface } from './components/GlassSurface.svelte';

// Headless: the optics on an element you already own.
export { glass, type GlassAttachmentOptions } from './actions/glass.js';

// The imperative core, for projects that are not Svelte.
export { createGlass } from './core/glass.js';
export { attachInteraction, type InteractionOptions } from './core/interaction.js';

// Engine resolution, exposed so an app can branch on what it actually got.
export {
	getCapabilities,
	getPreferences,
	resolveEngine,
	watchPreferences,
	type Capabilities,
	type Preferences
} from './core/detect.js';

// Readability tooling. `warnIfUnreadable` runs automatically in dev.
export {
	checkContrast,
	composite,
	contrastRatio,
	luminance,
	resolveColor,
	warnIfUnreadable,
	type ContrastCheck,
	type ResolvedColor,
	type Rgb
} from './core/contrast.js';

export { curveFor, resolveOptions, type Curve, type Variant } from './core/preset.js';
export { DEFAULTS } from './core/types.js';
export type {
	Engine,
	EngineRequest,
	FallbackOptions,
	GlassInit,
	GlassInstance,
	GlassOptions,
	GlassSource,
	MapShape,
	SpecularOptions
} from './core/types.js';
