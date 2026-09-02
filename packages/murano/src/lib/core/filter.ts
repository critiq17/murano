const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * SVG filter graph construction. See docs/optics.md §4 and §6.
 *
 * The same graph serves both refracting engines, because in both cases `SourceGraphic` is
 * "the thing to refract": the backdrop under `backdrop-filter`, the source copy under `filter`.
 */

export interface FilterSpec {
	id: string;
	/** Element width in px. */
	width: number;
	/** Element height in px. */
	height: number;
	/** Displacement padding on each side in px. */
	pad: number;
	/** `feDisplacementMap` scale. Negative magnifies. */
	displacement: number;
	/** Per-channel stagger. 0 collapses the graph to a single pass. */
	chromatic: number;
	/** Frost blur applied before displacement, px. */
	blur: number;
	/** Specular gain, 0..1. 0 skips the lift entirely. */
	specular: number;
	/** Map data URI. */
	map: string;
}

/**
 * Padding the filter region needs so displaced pixels are not clipped.
 *
 * A filter's region defaults to 10% around the element. At `displacement: -112` pixels are
 * pulled from up to 56px outside the box, and on a 48px element 10% is 4.8px. Everything past
 * that is clipped and the edges go transparent, which reads as "the effect died" at exactly the
 * settings that should look best.
 *
 * The 20px floor matters on small elements, where a percentage-derived region can round away.
 */
export function displacementPad(displacement: number, chromatic: number): number {
	return Math.ceil(Math.max(Math.abs(displacement) * 0.5 + Math.abs(chromatic), 20));
}

/** `feColorMatrix` that keeps one channel and zeroes the rest, preserving alpha. */
const CHANNEL_MATRIX = {
	r: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
	g: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
	b: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'
} as const;

/**
 * `feColorMatrix` that scales the map's displacement axes around the 0.5 neutral point.
 * This is how an elastic press animates squash and stretch without regenerating the map.
 */
export function axisScaleMatrix(sx: number, sy: number): string {
	return (
		`${sx} 0 0 0 ${0.5 * (1 - sx)}  ` +
		`0 ${sy} 0 0 ${0.5 * (1 - sy)}  ` +
		`0 0 1 0 0  ` +
		`0 0 0 1 0`
	);
}

function el<K extends keyof SVGElementTagNameMap>(
	name: K,
	attrs: Record<string, string | number>
): SVGElementTagNameMap[K] {
	const node = document.createElementNS(SVG_NS, name);
	for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
	return node;
}

/**
 * Build the filter element.
 *
 * Chromatic ordering note: shorter wavelengths refract harder, so blue takes the largest
 * magnitude. With a negative `displacement` that means blue gets `d - c`, not `d + 2c`. Most
 * published implementations have this backwards.
 */
export function buildFilter(spec: FilterSpec): SVGFilterElement {
	const { id, width: w, height: h, pad, displacement: d, chromatic: c, blur, specular } = spec;

	const regionW = w + 2 * pad;
	const regionH = h + 2 * pad;
	const pct = (v: number, total: number) => `${((v / total) * 100).toFixed(4)}%`;

	const filter = el('filter', {
		id,
		// Percentages relative to the element's bounding box, expanded by the displacement pad.
		x: pct(-pad, w),
		y: pct(-pad, h),
		width: pct(regionW, w),
		height: pct(regionH, h),
		filterUnits: 'objectBoundingBox',
		primitiveUnits: 'userSpaceOnUse',
		// Default linearRGB shifts the chroma recombination and the specular lift. Always sRGB.
		'color-interpolation-filters': 'sRGB'
	});

	// feImage has no referenced node, so its primitive subregion defaults to the whole filter
	// region. The map is drawn at region size, so the two boxes coincide by construction and
	// preserveAspectRatio="none" cannot desynchronise them.
	const image = el('feImage', {
		result: 'map',
		preserveAspectRatio: 'none',
		href: spec.map
	});
	// Safari still wants the namespaced href on feImage.
	image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', spec.map);
	filter.append(image);

	let source = 'SourceGraphic';
	if (blur > 0) {
		filter.append(el('feGaussianBlur', { in: source, stdDeviation: blur, result: 'frosted' }));
		source = 'frosted';
	}

	let refracted: string;
	if (c > 0) {
		// Three passes. Blue bends hardest, red least.
		const passes: [string, number, keyof typeof CHANNEL_MATRIX][] = [
			['r', d + c, 'r'],
			['g', d, 'g'],
			['b', d - c, 'b']
		];
		for (const [name, scale, channel] of passes) {
			filter.append(
				el('feDisplacementMap', {
					in: source,
					in2: 'map',
					scale,
					xChannelSelector: 'R',
					yChannelSelector: 'G',
					result: `d_${name}`
				})
			);
			filter.append(
				el('feColorMatrix', {
					in: `d_${name}`,
					type: 'matrix',
					values: CHANNEL_MATRIX[channel],
					result: `c_${name}`
				})
			);
		}
		// Each result carries one channel over black, so `screen` adds them without double count.
		filter.append(el('feBlend', { in: 'c_r', in2: 'c_g', mode: 'screen', result: 'rg' }));
		filter.append(el('feBlend', { in: 'rg', in2: 'c_b', mode: 'screen', result: 'refracted' }));
		refracted = 'refracted';
	} else {
		filter.append(
			el('feDisplacementMap', {
				in: source,
				in2: 'map',
				scale: d,
				xChannelSelector: 'R',
				yChannelSelector: 'G',
				result: 'refracted'
			})
		);
		refracted = 'refracted';
	}

	if (specular > 0) {
		// Lift the map's B channel into white with alpha: a = 2·gain·(B − 0.5).
		// Outside the shape B is 128, so alpha is 0 and the highlight clips itself to the shape.
		const gain = 2 * specular;
		filter.append(
			el('feColorMatrix', {
				in: 'map',
				type: 'matrix',
				values: `0 0 0 0 1  ` + `0 0 0 0 1  ` + `0 0 0 0 1  ` + `0 0 ${gain} 0 ${-specular}`,
				result: 'spec'
			})
		);
		filter.append(el('feBlend', { in: refracted, in2: 'spec', mode: 'screen' }));
	}

	return filter;
}
