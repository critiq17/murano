import type { Engine, EngineRequest } from './types.js';

/**
 * Engine detection and the degradation ladder.
 *
 * Why this is not a render probe: `url()` is valid `<filter-value-list>` grammar, so
 * `CSS.supports('backdrop-filter', 'url(#f)')` answers a PARSING question and returns true in
 * engines that will never paint the result. There is also no way to read a rendered
 * `backdrop-filter` back from script, since a filtered DOM element cannot be sampled into a
 * canvas. So the only honest signals are the grammar checks below plus User-Agent Client
 * Hints, which is a typed API rather than a string to regex.
 *
 * Firefox and Safari do not implement `userAgentData` at all, so they resolve to `lens` or
 * `frost`. The failure direction is correct: an unknown engine degrades, it never breaks.
 *
 * See docs/architecture.md §3.
 */

export interface Capabilities {
	/** `backdrop-filter: url()` actually paints. Gates the `backdrop` engine. */
	backdropUrl: boolean;
	/** `filter: url()` on an element. Gates the `lens` engine. */
	filterUrl: boolean;
	/** `backdrop-filter: blur()`. Gates the `frost` engine. */
	backdropBlur: boolean;
}

export interface Preferences {
	reducedTransparency: boolean;
	reducedMotion: boolean;
	moreContrast: boolean;
	forcedColors: boolean;
}

const NO_CAPABILITIES: Capabilities = {
	backdropUrl: false,
	filterUrl: false,
	backdropBlur: false
};

const NO_PREFERENCES: Preferences = {
	reducedTransparency: false,
	reducedMotion: false,
	moreContrast: false,
	forcedColors: false
};

interface UADataLike {
	brands?: { brand: string; version: string }[];
}

let capabilities: Capabilities | null = null;

/** Capabilities of the current document. Probed once, then cached for the page. */
export function getCapabilities(): Capabilities {
	if (capabilities) return capabilities;
	if (typeof window === 'undefined' || typeof CSS === 'undefined' || !CSS.supports) {
		// Server render. Do not cache: the client must probe for real after hydration.
		return NO_CAPABILITIES;
	}

	const backdropBlur =
		CSS.supports('backdrop-filter', 'blur(1px)') ||
		CSS.supports('-webkit-backdrop-filter', 'blur(1px)');

	const uaData = (navigator as Navigator & { userAgentData?: UADataLike }).userAgentData;
	const isBlink = uaData?.brands?.some((b) => b.brand === 'Chromium') ?? false;

	capabilities = {
		backdropBlur,
		backdropUrl: isBlink && backdropBlur && CSS.supports('backdrop-filter', 'url(#m)'),
		filterUrl: CSS.supports('filter', 'url(#m)')
	};
	return capabilities;
}

const QUERIES = {
	reducedTransparency: '(prefers-reduced-transparency: reduce)',
	reducedMotion: '(prefers-reduced-motion: reduce)',
	moreContrast: '(prefers-contrast: more)',
	forcedColors: '(forced-colors: active)'
} as const;

/** Current user preferences. Cheap enough to call on every resolve. */
export function getPreferences(): Preferences {
	if (typeof window === 'undefined' || !window.matchMedia) return NO_PREFERENCES;
	return {
		reducedTransparency: window.matchMedia(QUERIES.reducedTransparency).matches,
		reducedMotion: window.matchMedia(QUERIES.reducedMotion).matches,
		moreContrast: window.matchMedia(QUERIES.moreContrast).matches,
		forcedColors: window.matchMedia(QUERIES.forcedColors).matches
	};
}

/**
 * Subscribe to preference changes. Returns an unsubscribe function.
 * One listener set per call site; the lists are tiny and browsers dedupe the underlying queries.
 */
export function watchPreferences(onChange: (prefs: Preferences) => void): () => void {
	if (typeof window === 'undefined' || !window.matchMedia) return () => {};
	const lists = Object.values(QUERIES).map((q) => window.matchMedia(q));
	const handler = () => onChange(getPreferences());
	for (const list of lists) list.addEventListener('change', handler);
	return () => {
		for (const list of lists) list.removeEventListener('change', handler);
	};
}

/**
 * The degradation ladder.
 *
 * Accessibility wins over everything, including an explicit `engine` prop: a user who asked
 * for reduced transparency gets it whatever the developer requested. A requested engine that
 * is unsupported falls through the ladder rather than failing, so `engine="backdrop"` in
 * Safari yields `lens` or `frost`, never a broken box.
 *
 * @param request   what the caller asked for
 * @param hasSource whether the `lens` engine has pixels to refract
 */
export function resolveEngine(
	request: EngineRequest,
	hasSource: boolean,
	caps: Capabilities = getCapabilities(),
	prefs: Preferences = getPreferences()
): Engine {
	if (prefs.forcedColors) return 'none';
	if (prefs.reducedTransparency) return caps.backdropBlur ? 'frost' : 'none';

	if (request === 'none') return 'none';
	if (request === 'backdrop' && caps.backdropUrl) return 'backdrop';
	if (request === 'lens' && caps.filterUrl && hasSource) return 'lens';
	if (request === 'frost' && caps.backdropBlur) return 'frost';

	if (caps.backdropUrl) return 'backdrop';
	if (caps.filterUrl && hasSource) return 'lens';
	if (caps.backdropBlur) return 'frost';
	return 'none';
}

/** Test hook. Clears the cached probe so a suite can simulate another engine. */
export function resetCapabilities(next: Capabilities | null = null): void {
	capabilities = next;
}
