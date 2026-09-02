import type { MapShape } from './types.js';

/**
 * Displacement-map generation. See docs/optics.md for the maths.
 *
 * Each pixel encodes:
 *   R — X displacement, 128 neutral
 *   G — Y displacement, 128 neutral
 *   B — specular mask, 128 none, 255 full
 *
 * The map is drawn on Canvas 2D rather than as an SVG data URI through `feImage`, because
 * `feImage` renders a data URI AS AN IMAGE, which suppresses CSS `mix-blend-mode` and
 * `filter`. The centre then never neutralises and the whole element shears. Canvas has no such
 * problem: `globalCompositeOperation` and `ctx.filter` are API calls, not CSS properties.
 *
 * The map is drawn at FULL FILTER REGION SIZE with neutral padding around the shape, so that
 * `feImage` with `preserveAspectRatio="none"` stretching across the region cannot desynchronise
 * the map from the element. See docs/optics.md §6.
 */

/** Longest edge of a generated map. Displacement fields are smooth, so this stretches well. */
const MAX_MAP_EDGE = 512;

/** erf(x) ≈ tanh(√π · x): smooth, monotone, one call. */
const ERF_K = Math.sqrt(Math.PI);
const erf = (x: number) => Math.tanh(ERF_K * x);

/** 8-bit encode of a signed −1..1 value around the 128 neutral point. */
const encodeAxis = (v: number) => {
	const n = 128 + v * 127;
	return n < 0 ? 0 : n > 255 ? 255 : n | 0;
};

/** 8-bit encode of a 0..1 specular mask into 128..255. */
const encodeSpec = (v: number) => {
	const n = 128 + v * 127;
	return n < 128 ? 128 : n > 255 ? 255 : n | 0;
};

/**
 * Spherical-cap constants for a chord half-width `a` and cap height `h`.
 * Sphere radius R = (a² + h²) / 2h; surface slope at x is x / √(R² − x²).
 * `norm` scales the slope so it reaches exactly 1 at the rim.
 */
function domeConstants(capHeight: number, halfExtent: number) {
	const cap = Math.max(0.01, Math.min(capHeight, halfExtent - 0.5));
	const R = (halfExtent * halfExtent + cap * cap) / (2 * cap);
	const edge = Math.min(halfExtent, R * (1 - 1e-3));
	const slopeAtRim = edge / Math.sqrt(R * R - edge * edge);
	return { R, norm: slopeAtRim > 0 ? 1 / slopeAtRim : 0 };
}

const domeSlope = (d: number, R: number, norm: number) => {
	const x = Math.min(Math.abs(d), R * (1 - 1e-3));
	return ((x / Math.sqrt(R * R - x * x)) * norm) as number;
};

/** Stable cache key. The map depends on shape only, never on position. */
export function shapeKey(s: MapShape, dpr: number): string {
	return [
		Math.round(s.width),
		Math.round(s.height),
		Math.round(s.pad),
		Math.round(s.radius),
		s.edge.toFixed(3),
		s.curvature.toFixed(3),
		Math.round(s.sheenAngle),
		s.sheenWidth.toFixed(3),
		s.glow.toFixed(3),
		s.specular.toFixed(3),
		dpr.toFixed(2)
	].join(':');
}

/**
 * Generate the map as a PNG data URI.
 *
 * The top-left quadrant carries every expensive term (SDF, normalisation, dome LUT, erf). The
 * other three quadrants reuse them by reflecting the displacement signs. The specular is the
 * one term that is NOT symmetric, because it pools toward a light angle, so its four dot
 * products are computed per pixel. That still keeps the square roots and the transcendentals
 * on a quarter of the pixels.
 */
export function generateMap(shape: MapShape): string {
	const { pad, radius, edge, curvature, sheenAngle, sheenWidth, glow, specular } = shape;

	// The map covers the full filter region, not the element box, so that `feImage` stretching
	// across the region cannot desynchronise the two. Fit it into the map budget while
	// preserving aspect, or the preserveAspectRatio="none" stretch distorts the corners.
	const regionW = Math.max(1, Math.round(shape.width + 2 * pad));
	const regionH = Math.max(1, Math.round(shape.height + 2 * pad));
	const fit = Math.min(1, MAX_MAP_EDGE / Math.max(regionW, regionH));
	const W = Math.max(2, Math.round(regionW * fit));
	const H = Math.max(2, Math.round(regionH * fit));

	const canvas = document.createElement('canvas');
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext('2d', { willReadFrequently: false });
	if (!ctx) return BLANK_MAP;
	const image = ctx.createImageData(W, H);
	const data = image.data;

	// Shape geometry in map space.
	const padX = pad * fit;
	const padY = pad * fit;
	const halfW = Math.max(0.5, W / 2 - padX);
	const halfH = Math.max(0.5, H / 2 - padY);
	const r = Math.max(0, Math.min(radius * fit, Math.min(halfW, halfH)));
	const flatW = halfW - r;
	const flatH = halfH - r;

	const minHalf = Math.min(halfW, halfH);
	const rimPx = Math.max(0.5, edge * minHalf * 2);
	const rimInv = 1 / rimPx;

	const hasDome = curvature > 0;
	const domeX = hasDome ? domeConstants(curvature * halfW, halfW) : null;
	const domeY = hasDome ? domeConstants(curvature * halfH, halfH) : null;

	const hasSpec = specular > 0 && (glow > 0 || sheenWidth > 0);
	// Angles are read in the usual maths convention (0 = light from the left, 90 = from above),
	// so the sine is negated: screen Y grows downward. Without this the Apple-style top-edge
	// highlight lands on the bottom edge instead.
	const angle = (sheenAngle * Math.PI) / 180;
	const cosA = Math.cos(angle);
	const sinA = -Math.sin(angle);
	const sheenBand = Math.max(0.5, sheenWidth * minHalf * 2);
	const sheenInv = 1 / sheenBand;
	const glowReach = Math.max(1, minHalf);
	const glowInv = 1 / glowReach;

	const halfCols = Math.ceil(W / 2);
	const halfRows = Math.ceil(H / 2);

	// Per-column dome LUT: the X slope depends only on the column.
	let lut: Float32Array | null = null;
	if (hasDome && domeX) {
		lut = new Float32Array(halfCols);
		for (let col = 0; col < halfCols; col++) {
			const x = col + 0.5 - W / 2; // negative in the left half
			lut[col] = -domeSlope(x, domeX.R, domeX.norm); // outward = toward -x on the left
		}
	}

	for (let row = 0; row < halfRows; row++) {
		const mirrorRow = H - 1 - row;
		const y = row + 0.5 - H / 2; // negative in the top half
		const qy = Math.abs(y) - flatH;
		const domeYv = hasDome && domeY ? -domeSlope(y, domeY.R, domeY.norm) : 0;
		const rowBase = row * W;
		const mirrorRowBase = mirrorRow * W;

		for (let col = 0; col < halfCols; col++) {
			const mirrorCol = W - 1 - col;
			const x = col + 0.5 - W / 2;
			const qx = Math.abs(x) - flatW;

			// Rounded-rect SDF, closed form. Negative inside, 0 on the border.
			const ox = qx > 0 ? qx : 0;
			const oy = qy > 0 ? qy : 0;
			const outside = ox > 0 || oy > 0 ? Math.sqrt(ox * ox + oy * oy) : 0;
			const inside = Math.min(Math.max(qx, qy), 0);
			const sdf = outside + inside - r;

			const i00 = (rowBase + col) * 4;
			const i01 = (rowBase + mirrorCol) * 4;
			const i10 = (mirrorRowBase + col) * 4;
			const i11 = (mirrorRowBase + mirrorCol) * 4;

			if (sdf >= 0) {
				// Outside the silhouette: neutral, no displacement, no specular.
				data[i00] = data[i01] = data[i10] = data[i11] = 128;
				data[i00 + 1] = data[i01 + 1] = data[i10 + 1] = data[i11 + 1] = 128;
				data[i00 + 2] = data[i01 + 2] = data[i10 + 2] = data[i11 + 2] = 128;
				data[i00 + 3] = data[i01 + 3] = data[i10 + 3] = data[i11 + 3] = 255;
				continue;
			}

			// Outward normal, analytic rather than by central differences.
			// In this quadrant x and y are both negative, so the normal points up and left.
			let nx: number;
			let ny: number;
			if (qx > 0 && qy > 0) {
				const len = Math.sqrt(qx * qx + qy * qy) || 1;
				nx = -qx / len;
				ny = -qy / len;
			} else if (qx > qy) {
				nx = -1;
				ny = 0;
			} else {
				nx = 0;
				ny = -1;
			}

			// Rim gate: 1 at the border, ~0 at `rimPx` inward. Gates the dome too, so a thin
			// `edge` keeps the centre optically neutral however high `curvature` goes.
			const rim = 1 - erf(-sdf * rimInv);

			// Direction and profile: bevel uses the unit normal, dome uses the spherical slope.
			const domeXv = lut?.[col] ?? 0;
			const dx = ((1 - curvature) * nx + curvature * domeXv) * rim;
			const dy = ((1 - curvature) * ny + curvature * domeYv) * rim;

			const rx = encodeAxis(dx);
			const gy = encodeAxis(dy);
			// Mirroring flips the sign of the displacement on the mirrored axis.
			const rxM = 255 - rx;
			const gyM = 255 - gy;

			let b00 = 128;
			let b01 = 128;
			let b10 = 128;
			let b11 = 128;
			if (hasSpec) {
				const depth = -sdf;
				// Edge sheen: a band hugging the rim, squared for a tighter falloff.
				const band = Math.max(0, 1 - depth * sheenInv);
				const sheen = band * band * specular;
				// Inner glow: soft, all around, no direction.
				const glowTerm = glow * Math.max(0, 1 - depth * glowInv) * specular;
				// The sheen is the one term that is not symmetric: it pools toward the light, so
				// each quadrant needs its own dot product against the mirrored normal.
				const dot = (mx: number, my: number) => {
					const d = mx * cosA + my * sinA;
					const lit = d > 0 ? d * sheen : 0;
					const v = lit + glowTerm;
					return encodeSpec(v > 1 ? 1 : v);
				};
				b00 = dot(nx, ny);
				b01 = dot(-nx, ny);
				b10 = dot(nx, -ny);
				b11 = dot(-nx, -ny);
			}

			data[i00] = rx;
			data[i00 + 1] = gy;
			data[i00 + 2] = b00;
			data[i00 + 3] = 255;
			data[i01] = rxM;
			data[i01 + 1] = gy;
			data[i01 + 2] = b01;
			data[i01 + 3] = 255;
			data[i10] = rx;
			data[i10 + 1] = gyM;
			data[i10 + 2] = b10;
			data[i10 + 3] = 255;
			data[i11] = rxM;
			data[i11 + 1] = gyM;
			data[i11 + 2] = b11;
			data[i11 + 3] = 255;
		}
	}

	ctx.putImageData(image, 0, 0);
	return canvas.toDataURL('image/png');
}

/** 1×1 transparent PNG. A filter with no map must still have a valid `feImage` href. */
export const BLANK_MAP =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
