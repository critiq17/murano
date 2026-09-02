export { createGlass } from './glass.js';
export {
	getCapabilities,
	getPreferences,
	resolveEngine,
	resetCapabilities,
	watchPreferences,
	type Capabilities,
	type Preferences
} from './detect.js';
export { generateMap, shapeKey, BLANK_MAP } from './displacement.js';
export { getMap, hasMap, clearMapCache, mapCacheSize } from './cache.js';
export { buildFilter, displacementPad, axisScaleMatrix, type FilterSpec } from './filter.js';
export { resolveSource, applySource, type ResolvedSource } from './source.js';
export { acquireRule, nextInstanceId, type GlassRule } from './sheet.js';
export { DEV } from './env.js';
export { DEFAULTS } from './types.js';
export type {
	Engine,
	EngineRequest,
	GlassInit,
	GlassInstance,
	GlassOptions,
	GlassSource,
	MapShape,
	SpecularOptions,
	FallbackOptions
} from './types.js';
