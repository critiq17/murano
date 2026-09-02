import type { GlassSource } from './types.js';

/**
 * Resolving what the `lens` engine refracts.
 *
 * `filter: url()` sees only the filtered element's own pixels. It has no access to the
 * backdrop in any browser, and never will: the spec input that would have provided it
 * (`BackgroundImage`) was never implemented anywhere, which is why `backdrop-filter` exists.
 *
 * So a cross-browser lens has to refract a COPY of the backdrop placed inside the surface.
 * The question this module answers is where that copy comes from. See docs/architecture.md §2.
 */

/** CSS properties that fully describe a painted background. */
const BACKGROUND_PROPS = [
	'background-image',
	'background-color',
	'background-size',
	'background-position',
	'background-repeat',
	'background-origin',
	'background-clip',
	'background-blend-mode'
] as const;

export interface ResolvedSource {
	/** The element whose paint we replicate. Null for an explicit image URL. */
	element: HTMLElement | null;
	/** Declarations to copy onto the lens layer. */
	style: Record<string, string>;
	/** Box the lens layer must occupy, in viewport coordinates. */
	rect: DOMRect;
}

function isPainted(style: CSSStyleDeclaration): boolean {
	if (style.backgroundImage && style.backgroundImage !== 'none') return true;

	const color = style.backgroundColor;
	if (!color || color === 'transparent' || color === 'none') return false;

	// Alpha lives in the last slot of `rgba(r, g, b, a)` and after the slash in every modern
	// syntax (`rgb(r g b / a)`, `color(srgb r g b / a)`, `oklch(l c h / a)`). Reading "the last
	// number" is wrong for three-component `rgb()`, where it would pick up the blue channel and
	// call an opaque yellow transparent.
	const slash = /\/\s*([\d.]+)%?\s*\)/.exec(color);
	if (slash) return Number(slash[1]) > 0;

	const legacy = /^rgba\(([^)]+)\)/.exec(color)?.[1];
	if (legacy !== undefined) {
		const parts = legacy.split(',');
		return parts.length < 4 || Number(parts[3]) > 0;
	}

	return true;
}

function copyStyle(el: HTMLElement): Record<string, string> {
	const computed = getComputedStyle(el);
	const out: Record<string, string> = {};
	for (const prop of BACKGROUND_PROPS) {
		const value = computed.getPropertyValue(prop);
		if (value) out[prop] = value;
	}
	return out;
}

/**
 * Walk ancestors to the nearest element that actually paints a background.
 *
 * This is what makes `source="auto"` work with no configuration: the common case is glass over
 * a gradient or photo page background, and a CSS background can be replicated by copying
 * computed values. No DOM cloning, no observers on a foreign subtree, no duplicated
 * accessibility tree.
 */
function findPaintedAncestor(el: HTMLElement): HTMLElement | null {
	let node = el.parentElement;
	while (node) {
		if (isPainted(getComputedStyle(node))) return node;
		node = node.parentElement;
	}
	// Nothing in the chain paints, so the canvas background is doing the work.
	return el.ownerDocument.documentElement;
}

export function resolveSource(host: HTMLElement, source: GlassSource): ResolvedSource | null {
	if (source === 'none') return null;

	if (typeof source === 'object' && source !== null && 'image' in source) {
		// An explicit image fills the host's own box.
		return {
			element: null,
			style: {
				'background-image': `url("${source.image}")`,
				'background-size': 'cover',
				'background-position': 'center',
				'background-repeat': 'no-repeat'
			},
			rect: host.getBoundingClientRect()
		};
	}

	let element: HTMLElement | null = null;
	if (source === 'auto') {
		element = findPaintedAncestor(host);
	} else if (typeof source === 'string') {
		element = host.ownerDocument.querySelector<HTMLElement>(source);
	} else if (source instanceof HTMLElement) {
		element = source;
	}

	if (!element) return null;
	const style = copyStyle(element);
	if (!isPainted(getComputedStyle(element))) return null;

	// The document element's painted area is the viewport, not its own border box, because the
	// canvas background propagates. Measuring the box would give the document height instead.
	const rect =
		element === host.ownerDocument.documentElement
			? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
			: element.getBoundingClientRect();

	return { element, style, rect };
}

/**
 * Paint the source copy so it lines up pixel-for-pixel with the real backdrop. Inside the
 * surface's bounds the copy IS the backdrop, so the seam is invisible.
 *
 * `paint` carries the source's own box size, NOT the host's, because a `background-size: cover`
 * or a percentage resolves against the box it is painted into. It is translated so the slice
 * sitting behind the host lands under the host.
 *
 * The clipping parent stays exactly the host's box. That matters: an SVG filter's
 * `objectBoundingBox` region is computed from the filtered element's border box, so a filter
 * sized for the host applied to a full-page-sized layer stretches the displacement map across
 * the whole page and the refraction silently disappears.
 */
export function applySource(paint: HTMLElement, host: HTMLElement, src: ResolvedSource): void {
	const hostRect = host.getBoundingClientRect();
	paint.style.width = `${src.rect.width}px`;
	paint.style.height = `${src.rect.height}px`;
	paint.style.transform = `translate(${src.rect.left - hostRect.left}px, ${src.rect.top - hostRect.top}px)`;
	for (const [prop, value] of Object.entries(src.style)) paint.style.setProperty(prop, value);
}
