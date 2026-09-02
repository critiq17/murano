import type { MapShape } from './types.js';
import { generateMap, shapeKey } from './displacement.js';

/**
 * One map per unique shape, shared by every surface on the page. Twenty cards of the same size
 * generate one texture.
 *
 * The map is a pure function of shape, so moving a surface never invalidates it and squash or
 * stretch rides an `feColorMatrix` axis scale instead. See docs/performance.md §1.
 */

/** Data URIs are a few KB each. This ceiling exists so a resize sweep cannot grow unbounded. */
const MAX_ENTRIES = 64;

const cache = new Map<string, string>();

export function getMap(shape: MapShape, dpr: number): string {
	const key = shapeKey(shape, dpr);
	const hit = cache.get(key);
	if (hit !== undefined) {
		// Refresh recency: delete then set moves the key to the end of the insertion order.
		cache.delete(key);
		cache.set(key, hit);
		return hit;
	}

	const uri = generateMap(shape);
	cache.set(key, uri);
	if (cache.size > MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	return uri;
}

/** True when this shape would be served without generating. Used to skip debounce work. */
export function hasMap(shape: MapShape, dpr: number): boolean {
	return cache.has(shapeKey(shape, dpr));
}

export function clearMapCache(): void {
	cache.clear();
}

export function mapCacheSize(): number {
	return cache.size;
}
