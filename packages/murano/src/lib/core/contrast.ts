/**
 * Text contrast over glass.
 *
 * Glass reduces contrast by design, so the tint layer exists for readability first and looks
 * second. This module answers one question in dev: will the text still clear WCAG AA once the
 * tint is composited over whatever is behind the surface?
 */

const AA_NORMAL = 4.5;

export type Rgb = [number, number, number];

export interface ResolvedColor {
	rgb: Rgb;
	alpha: number;
}

/**
 * Resolve any CSS colour to channels and alpha.
 *
 * `getComputedStyle` does not always hand back `rgb()`. A `color-mix()` background resolves to
 * `color(srgb 1 1 1 / 0.244)` in Chrome, and `oklch()` and friends round-trip in their own
 * syntax. Rather than chase every notation, hand the string to a 1x1 canvas and read the pixel:
 * whatever the browser can parse, this resolves. The `rgb()` fast path keeps the common case
 * off the canvas entirely.
 */
export function resolveColor(color: string, doc: Document = document): ResolvedColor | null {
	const legacy = /^rgba?\(([^)]+)\)$/.exec(color)?.[1];
	if (legacy) {
		const parts = legacy
			.split(/[,\s/]+/)
			.filter(Boolean)
			.map(Number);
		const [r, g, b, a] = parts;
		if (r !== undefined && g !== undefined && b !== undefined && !parts.some(Number.isNaN)) {
			return { rgb: [r, g, b], alpha: a ?? 1 };
		}
	}

	const canvas = doc.createElement('canvas');
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return null;

	ctx.clearRect(0, 0, 1, 1);
	// An unparseable value leaves fillStyle at its default, which would silently read as black.
	ctx.fillStyle = '#000';
	const before = ctx.fillStyle;
	ctx.fillStyle = color;
	if (ctx.fillStyle === before && !/^(#000000|black|rgb\(0,\s*0,\s*0\))$/i.test(color.trim())) {
		return null;
	}
	ctx.fillRect(0, 0, 1, 1);

	const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
	if (r === undefined || g === undefined || b === undefined || a === undefined) return null;
	return { rgb: [r, g, b], alpha: a / 255 };
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: Rgb): number {
	const channel = (v: number) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
	const la = luminance(a);
	const lb = luminance(b);
	const [hi, lo] = la > lb ? [la, lb] : [lb, la];
	return (hi + 0.05) / (lo + 0.05);
}

/** Composite `over` at `alpha` on top of `under`. */
export function composite(over: Rgb, alpha: number, under: Rgb): Rgb {
	return [
		over[0] * alpha + under[0] * (1 - alpha),
		over[1] * alpha + under[1] * (1 - alpha),
		over[2] * alpha + under[2] * (1 - alpha)
	];
}

export interface ContrastCheck {
	ratio: number;
	passes: boolean;
	/** Tint opacity that would clear AA, or null when no opacity does. */
	suggestedOpacity: number | null;
}

/**
 * Contrast for `text` reading through a `tint` at `opacity`, over a known `backdrop`.
 *
 * `suggestedOpacity` is scanned rather than solved: the composite is only monotone in alpha
 * when the tint sits on the same side of the text as the backdrop, and a scan is honest about
 * the cases where no opacity works at all.
 */
export function checkContrast(text: Rgb, tint: Rgb, opacity: number, backdrop: Rgb): ContrastCheck {
	const at = (alpha: number) => contrastRatio(text, composite(tint, alpha, backdrop));

	const ratio = at(opacity);
	let suggested: number | null = null;
	if (ratio < AA_NORMAL) {
		for (let a = 0; a <= 1.0001; a += 0.05) {
			if (at(Math.min(a, 1)) >= AA_NORMAL) {
				suggested = Math.round(Math.min(a, 1) * 100) / 100;
				break;
			}
		}
	}

	return {
		ratio: Math.round(ratio * 100) / 100,
		passes: ratio >= AA_NORMAL,
		suggestedOpacity: suggested
	};
}

/**
 * The backdrop a surface actually sits on, when that is knowable.
 *
 * A solid colour on an ancestor is a real answer. A background image is not: the surface could
 * be over any pixel of it, so the caller falls back to testing both extremes.
 */
function knownBackdrop(host: HTMLElement): Rgb | null {
	let node: HTMLElement | null = host.parentElement;
	while (node) {
		const style = getComputedStyle(node);
		if (style.backgroundImage && style.backgroundImage !== 'none') return null;
		const resolved = resolveColor(style.backgroundColor, host.ownerDocument);
		if (resolved && resolved.alpha > 0.95) return resolved.rgb;
		node = node.parentElement;
	}
	return null;
}

/**
 * Dev-only readability warning.
 *
 * Over a known solid backdrop this measures the real composite. Over an image or a gradient the
 * backdrop is unknowable, so it only warns when the text fails against black AND white, which
 * means no backdrop can save it. Warning on the worst case instead would fire on almost every
 * dark theme with light text, and a warning that always fires is one nobody reads.
 */
export function warnIfUnreadable(host: HTMLElement, label: string): void {
	const style = getComputedStyle(host);
	const text = resolveColor(style.color, host.ownerDocument);
	const tint = resolveColor(style.backgroundColor, host.ownerDocument);
	if (!text || !tint) return;

	const backdrop = knownBackdrop(host);
	const result = backdrop
		? checkContrast(text.rgb, tint.rgb, tint.alpha, backdrop)
		: (() => {
				const onBlack = checkContrast(text.rgb, tint.rgb, tint.alpha, [0, 0, 0]);
				const onWhite = checkContrast(text.rgb, tint.rgb, tint.alpha, [255, 255, 255]);
				// Hopeless only if neither extreme works.
				return onBlack.passes || onWhite.passes
					? { ...onBlack, passes: true }
					: onBlack.ratio < onWhite.ratio
						? onBlack
						: onWhite;
			})();

	if (result.passes) return;

	const where = backdrop
		? `against the resolved backdrop rgb(${backdrop.map(Math.round).join(' ')})`
		: 'against every possible backdrop, measured at black and white';
	const fix =
		result.suggestedOpacity === null
			? 'No tint opacity fixes this; change the text colour or the tint.'
			: `Raise tintOpacity to about ${result.suggestedOpacity}, or use variant="regular".`;

	console.warn(
		`[murano] ${label}: text contrast is ${result.ratio}:1 ${where}, below the 4.5:1 WCAG AA ` +
			`minimum. ${fix}`
	);
}
