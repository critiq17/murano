import { getMap } from './cache.js';
import { DEV } from './env.js';
import { acquireDefs, nextFilterId, releaseDefs } from './defs.js';
import { getCapabilities, getPreferences, resolveEngine, watchPreferences } from './detect.js';
import { buildFilter, displacementPad, type FilterSpec } from './filter.js';
import { applySource, resolveSource, type ResolvedSource } from './source.js';
import {
	DEFAULTS,
	type Engine,
	type GlassInit,
	type GlassInstance,
	type GlassOptions,
	type MapShape
} from './types.js';

const RESIZE_DEBOUNCE_MS = 100;
/** Above this width a single stretched lens blooms into an oval and the GPU cost climbs. */
const WIDE_SURFACE_PX = 800;

const LAYER_ATTR = 'data-murano-layer';

function merge(base: GlassOptions, next: GlassInit): GlassOptions {
	return {
		...base,
		...next,
		specular: { ...base.specular, ...next.specular },
		fallback: { ...base.fallback, ...next.fallback }
	};
}

/**
 * Imperative core. `createGlass(el, opts)` applies the optics to any element, with no framework
 * involved. The Svelte components are thin wrappers over this.
 *
 * Visual dressing (tint, border, the pointer-tracked glare) lives in `murano/styles.css` and is
 * driven by the custom properties this sets. The optics live here.
 */
export function createGlass(host: HTMLElement, init: GlassInit = {}): GlassInstance {
	let options = merge(DEFAULTS, init);
	let engine: Engine = 'none';
	let destroyed = false;

	const filterBase = nextFilterId();
	let filterVersion = 0;
	/** Current id. Bumped on every rebuild: browsers cache filter output by id, so reusing it
	 *  leaves the old result on screen and every parameter change reads as a no-op. */
	let filterId = `${filterBase}-0`;
	let defs: SVGDefsElement | null = null;
	let filter: SVGFilterElement | null = null;
	let lensLayer: HTMLDivElement | null = null;
	let lensPaint: HTMLDivElement | null = null;
	let source: ResolvedSource | null = null;

	let lastShapeKey = '';
	let resizeTimer: ReturnType<typeof setTimeout> | undefined;
	let warnedWide = false;

	// ── layers ────────────────────────────────────────────────────────────────

	/**
	 * Two nested elements, and the split is load-bearing.
	 *
	 * The outer layer is exactly the host's box, because that box is what the filter's
	 * `objectBoundingBox` region is computed from. The inner paint carries the source's own box
	 * so `cover` and percentage backgrounds resolve correctly, and is translated into place.
	 * `overflow: hidden` on the outer keeps the source from inflating anything.
	 */
	function ensureLensLayer(): { clip: HTMLDivElement; paint: HTMLDivElement } {
		if (lensLayer && lensPaint) return { clip: lensLayer, paint: lensPaint };
		const doc = host.ownerDocument;
		const layer = doc.createElement('div');
		layer.setAttribute(LAYER_ATTR, 'lens');
		layer.setAttribute('aria-hidden', 'true');
		layer.inert = true;
		layer.style.cssText =
			'position:absolute;inset:0;overflow:hidden;pointer-events:none;border-radius:inherit;';

		const paint = doc.createElement('div');
		paint.setAttribute(LAYER_ATTR, 'lens-paint');
		paint.style.cssText = 'position:absolute;top:0;left:0;transform-origin:0 0;';

		layer.append(paint);
		// The lens sits behind everything the host renders.
		host.prepend(layer);
		lensLayer = layer;
		lensPaint = paint;
		return { clip: layer, paint };
	}

	function removeLensLayer(): void {
		lensLayer?.remove();
		lensLayer = null;
		lensPaint = null;
	}

	// ── optics ────────────────────────────────────────────────────────────────

	function currentShape(width: number, height: number, pad: number): MapShape {
		return {
			width,
			height,
			pad,
			radius: options.radius,
			edge: options.edge,
			curvature: options.curvature,
			sheenAngle: options.specular.angle,
			sheenWidth: options.specular.width,
			glow: options.specular.glow,
			specular: options.specular.intensity
		};
	}

	function syncFilter(width: number, height: number): void {
		const pad = displacementPad(options.displacement, options.chromatic);

		// Large surfaces: taper rather than melt the GPU, and say so once in dev.
		let displacement = options.displacement;
		if (width > WIDE_SURFACE_PX) {
			displacement *= WIDE_SURFACE_PX / width;
			if (DEV && !warnedWide) {
				warnedWide = true;
				console.warn(
					`[murano] surface is ${Math.round(width)}px wide. A single stretched lens blooms ` +
						`into an oval past ~${WIDE_SURFACE_PX}px, so displacement was tapered to ` +
						`${displacement.toFixed(0)}. Consider engine="frost" for wide bars.`
				);
			}
		}

		const shape = currentShape(width, height, pad);
		const dpr = window.devicePixelRatio || 1;
		filterVersion += 1;
		filterId = `${filterBase}-${filterVersion}`;
		const spec: FilterSpec = {
			id: filterId,
			width,
			height,
			pad,
			displacement,
			chromatic: options.chromatic,
			blur: options.blur,
			specular: options.specular.intensity,
			map: getMap(shape, dpr)
		};

		if (!defs) defs = acquireDefs(host);

		// Drop the previous definition and publish under a fresh id. Callers re-point their
		// `filter` / `backdrop-filter` at `filterId` immediately after.
		filter?.remove();
		filter = buildFilter(spec);
		defs.append(filter);
	}

	function clearVisuals(): void {
		host.style.removeProperty('backdrop-filter');
		host.style.removeProperty('-webkit-backdrop-filter');
		lensLayer?.style.removeProperty('filter');
	}

	function apply(): void {
		if (destroyed) return;

		const rect = host.getBoundingClientRect();
		const width = Math.round(rect.width);
		const height = Math.round(rect.height);
		if (width < 1 || height < 1) return;

		source = resolveSource(host, options.source);
		const next = resolveEngine(
			options.engine,
			source !== null,
			getCapabilities(),
			getPreferences()
		);

		if (next !== engine) {
			engine = next;
			host.setAttribute('data-murano-engine', engine);
			options.onEngineResolved?.(engine);
		}

		host.style.setProperty('--murano-radius', `${options.radius}px`);
		host.style.setProperty('--murano-saturation', String(options.saturation));
		host.style.setProperty('--murano-fallback-blur', `${options.fallback.blur}px`);
		host.style.setProperty('--murano-fallback-opacity', String(options.fallback.opacity));
		host.style.setProperty('--murano-specular', String(options.specular.intensity));

		if (engine === 'none') {
			clearVisuals();
			removeLensLayer();
			return;
		}

		if (engine === 'frost') {
			clearVisuals();
			removeLensLayer();
			const value = `blur(${options.fallback.blur}px) saturate(${options.saturation})`;
			host.style.setProperty('-webkit-backdrop-filter', value);
			host.style.setProperty('backdrop-filter', value);
			return;
		}

		// Both refracting engines share the filter graph: SourceGraphic is "the thing to
		// refract" either way.
		const shapeKeyNow = `${width}:${height}:${options.radius}:${options.edge}:${options.curvature}:${options.specular.angle}:${options.specular.width}:${options.specular.glow}:${options.specular.intensity}:${options.displacement}:${options.chromatic}:${options.blur}`;
		if (shapeKeyNow !== lastShapeKey) {
			lastShapeKey = shapeKeyNow;
			syncFilter(width, height);
		}

		if (engine === 'backdrop') {
			removeLensLayer();
			// Assign the plain value first. If the enhanced one is rejected the CSSOM setter
			// ignores it and the fallback stands, which is the inline-style equivalent of the
			// two-declaration cascade trick.
			const plain = `blur(${options.blur}px) saturate(${options.saturation})`;
			const enhanced = `blur(${options.blur}px) url(#${filterId}) saturate(${options.saturation})`;
			host.style.setProperty('backdrop-filter', plain);
			host.style.setProperty('backdrop-filter', enhanced);
			host.style.setProperty('-webkit-backdrop-filter', plain);
			return;
		}

		// engine === 'lens'
		host.style.removeProperty('backdrop-filter');
		host.style.removeProperty('-webkit-backdrop-filter');
		if (!source) return;
		const { clip, paint } = ensureLensLayer();
		applySource(paint, host, source);
		// The filter goes on the host-sized clip, not on the source-sized paint: the region is
		// derived from the filtered element's own box.
		clip.style.filter = `url(#${filterId}) saturate(${options.saturation})`;
	}

	// ── observers ─────────────────────────────────────────────────────────────

	const resizeObserver = new ResizeObserver(() => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(apply, RESIZE_DEBOUNCE_MS);
	});
	resizeObserver.observe(host);

	const stopWatchingPrefs = watchPreferences(() => apply());

	// A lens layer copies a background that can move or resize independently of the host.
	let sourceObserver: ResizeObserver | null = null;
	function observeSource(): void {
		sourceObserver?.disconnect();
		if (engine !== 'lens' || !source?.element) return;
		sourceObserver = new ResizeObserver(() => {
			if (lensPaint && source) applySource(lensPaint, host, source);
		});
		sourceObserver.observe(source.element);
	}

	apply();
	observeSource();

	return {
		update(next: GlassInit) {
			options = merge(options, next);
			apply();
			observeSource();
		},
		refresh() {
			lastShapeKey = '';
			apply();
			observeSource();
		},
		destroy() {
			destroyed = true;
			clearTimeout(resizeTimer);
			resizeObserver.disconnect();
			sourceObserver?.disconnect();
			stopWatchingPrefs();
			filter?.remove();
			if (defs) releaseDefs(host);
			removeLensLayer();
			clearVisuals();
			host.removeAttribute('data-murano-engine');
		},
		get engine() {
			return engine;
		},
		get supported() {
			return engine !== 'none';
		}
	};
}
