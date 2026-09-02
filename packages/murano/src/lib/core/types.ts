/** Rendering strategy for a glass surface. See docs/architecture.md §2. */
export type Engine =
	/** `backdrop-filter: blur() url(#f)`. Refracts the live page. Chromium only. */
	| 'backdrop'
	/** `filter: url(#f)` over a copy of a resolved source. Every engine. */
	| 'lens'
	/** `backdrop-filter: blur() saturate()`. No refraction. Every engine. */
	| 'frost'
	/** Effect off. `forced-colors: active`, or nothing at all is supported. */
	| 'none';

/** What `engine` accepts. `auto` runs the resolution ladder. */
export type EngineRequest = Engine | 'auto';

/** Where the `lens` engine gets the pixels it refracts. */
export type GlassSource =
	/** Walk ancestors to the nearest painted background and replicate it. */
	| 'auto'
	/** Never use `lens`; fall through to `frost`. */
	| 'none'
	/** A CSS selector or element whose background is replicated. */
	| string
	| HTMLElement
	/** An explicit image or video URL. */
	| { image: string };

export interface SpecularOptions {
	/** Light angle in degrees. 0 points left, 135 is the Apple-ish default. */
	angle: number;
	/** Gain on the highlight, 0..1. */
	intensity: number;
	/** Width of the edge sheen band, as a fraction of `min(w, h)`. */
	width: number;
	/** Soft all-around inner glow, 0..1. */
	glow: number;
	/** Move the light with the pointer. Enabled by `interactive`. */
	followPointer: boolean;
}

export interface FallbackOptions {
	/** Backdrop blur in px used by the `frost` engine. */
	blur: number;
	/** Backing opacity used by the `frost` engine, 0..1. */
	opacity: number;
}

export interface GlassOptions {
	engine: EngineRequest;
	source: GlassSource;

	/** `feDisplacementMap` scale in px. Negative magnifies, positive is fish-eye. */
	displacement: number;
	/** Per-channel scale stagger for chromatic aberration. 0 emits a one-pass graph. */
	chromatic: number;
	/** Rim band width as a fraction of `min(w, h)`, 0..1. */
	edge: number;
	/** Spherical cap height as a fraction of the half-extent, 0..1. 0 is a flat bevel. */
	curvature: number;
	/** Frost blur applied to the refracted source, px. */
	blur: number;
	/** Backdrop saturation. Apple's veil sits slightly under 1. */
	saturation: number;
	/** Corner radius in px. Matches the element's own `border-radius`. */
	radius: number;

	specular: SpecularOptions;
	fallback: FallbackOptions;

	/** Called whenever the resolved engine changes, including the first resolve. */
	onEngineResolved?: (engine: Engine) => void;
}

export type GlassInit = Partial<Omit<GlassOptions, 'specular' | 'fallback'>> & {
	specular?: Partial<SpecularOptions>;
	fallback?: Partial<FallbackOptions>;
};

/** The geometry that a displacement map depends on. Anything else is free to change. */
export interface MapShape {
	/** Element width in px. The filter region is derived as `width + 2 * pad`. */
	width: number;
	/** Element height in px. */
	height: number;
	/** Displacement padding in px on each side, from `displacementPad()`. */
	pad: number;
	radius: number;
	edge: number;
	curvature: number;
	sheenAngle: number;
	sheenWidth: number;
	glow: number;
	specular: number;
}

export interface GlassInstance {
	/** Merge new options and apply. Regenerates the map only if the shape changed. */
	update(next: GlassInit): void;
	/** Force a re-measure and re-apply. Use after a layout change nothing observed. */
	refresh(): void;
	/** Remove every artifact: styles, filter, observers, listeners. */
	destroy(): void;
	/** The engine actually in use. */
	readonly engine: Engine;
	/** False when the effect is off entirely (`forced-colors`, or no support). */
	readonly supported: boolean;
}

export const DEFAULTS: GlassOptions = {
	engine: 'auto',
	source: 'auto',
	displacement: -112,
	chromatic: 6,
	edge: 0.12,
	curvature: 0.35,
	blur: 3,
	saturation: 1.5,
	radius: 24,
	specular: { angle: 135, intensity: 0.5, width: 0.09, glow: 0.12, followPointer: false },
	fallback: { blur: 16, opacity: 0.72 }
};
