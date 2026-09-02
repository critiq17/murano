import type { GlassInit, GlassOptions, SpecularOptions } from './types.js';

/** Apple's two material variants. `regular` hides more of the backdrop; `clear` shows it. */
export type Variant = 'regular' | 'clear';

/**
 * The single-slider curve.
 *
 * `intensity` moves displacement, blur, tint and specular together along a curve that stays
 * plausible end to end, so one number produces a usable material. Any prop the caller passes
 * explicitly wins over the curve; without that precedence rule `intensity` and the level-3
 * optics props silently fight each other.
 */
export interface Curve {
	displacement: number;
	chromatic: number;
	blur: number;
	saturation: number;
	tintOpacity: number;
	specular: number;
	edge: number;
	curvature: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function curveFor(variant: Variant, intensity: number): Curve {
	const i = clamp01(intensity);
	const clear = variant === 'clear';
	return {
		// Clear glass bends harder: with less tint, refraction is what makes it read as a material.
		displacement: -(clear ? 60 + 150 * i : 45 + 110 * i),
		chromatic: (clear ? 3 : 1.5) + (clear ? 12 : 7) * i,
		blur: clear ? 0.5 + 3 * i : 2 + 11 * i,
		saturation: 1 + (clear ? 0.3 : 0.8) * i,
		tintOpacity: clear ? 0.04 + 0.1 * i : 0.1 + 0.24 * i,
		specular: 0.2 + 0.5 * i,
		edge: clear ? 0.08 + 0.06 * i : 0.1 + 0.1 * i,
		curvature: clear ? 0.35 + 0.35 * i : 0.2 + 0.3 * i
	};
}

/** What a caller may override, before the curve fills in the rest. */
export type ExplicitOptics = Partial<
	Pick<GlassOptions, 'displacement' | 'chromatic' | 'edge' | 'curvature' | 'blur' | 'saturation'>
> & { specular?: Partial<SpecularOptions> };

/** Resolve the full option set: explicit props beat the curve, the curve beats nothing. */
export function resolveOptions(
	variant: Variant,
	intensity: number,
	explicit: ExplicitOptics
): Required<
	Pick<GlassInit, 'displacement' | 'chromatic' | 'edge' | 'curvature' | 'blur' | 'saturation'>
> & {
	specular: SpecularOptions;
	tintOpacity: number;
} {
	const c = curveFor(variant, intensity);
	return {
		...explicit,
		displacement: explicit.displacement ?? c.displacement,
		chromatic: explicit.chromatic ?? c.chromatic,
		blur: explicit.blur ?? c.blur,
		saturation: explicit.saturation ?? c.saturation,
		edge: explicit.edge ?? c.edge,
		curvature: explicit.curvature ?? c.curvature,
		specular: {
			angle: explicit.specular?.angle ?? 135,
			intensity: explicit.specular?.intensity ?? c.specular,
			width: explicit.specular?.width ?? 0.09,
			glow: explicit.specular?.glow ?? 0.12,
			followPointer: explicit.specular?.followPointer ?? false
		},
		tintOpacity: c.tintOpacity
	};
}
