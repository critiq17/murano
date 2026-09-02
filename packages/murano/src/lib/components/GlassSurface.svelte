<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { createGlass } from '../core/glass.js';
	import { attachInteraction } from '../core/interaction.js';
	import { warnIfUnreadable } from '../core/contrast.js';
	import { DEV } from '../core/env.js';
	import { resolveOptions, type Variant } from '../core/preset.js';
	import type {
		Engine,
		EngineRequest,
		FallbackOptions,
		GlassInstance,
		GlassSource,
		SpecularOptions
	} from '../core/types.js';

	interface Props extends HTMLAttributes<HTMLElement> {
		/** Apple's two materials. `regular` hides more of the backdrop, `clear` shows it. */
		variant?: Variant;
		/** One slider, 0..1, driving displacement, blur, tint and specular together. */
		intensity?: number;
		/** Any CSS colour. Drives the tint layer, which carries text contrast. */
		tint?: string;
		/** Overrides the opacity the `intensity` curve would pick. */
		tintOpacity?: number;
		radius?: number;
		/** Elastic press plus a glare that follows the pointer. */
		interactive?: boolean;

		engine?: EngineRequest;
		source?: GlassSource;
		displacement?: number;
		chromatic?: number;
		edge?: number;
		curvature?: number;
		blur?: number;
		saturation?: number;
		specular?: Partial<SpecularOptions>;
		fallback?: Partial<FallbackOptions>;
		onEngineResolved?: (engine: Engine) => void;

		/** Element to render. `GlassButton` and friends are this with a different tag. */
		as?: string;
		children?: Snippet;
	}

	let {
		variant = 'regular',
		intensity = 0.6,
		tint,
		tintOpacity,
		radius = 24,
		interactive = false,
		engine = 'auto',
		source = 'auto',
		displacement,
		chromatic,
		edge,
		curvature,
		blur,
		saturation,
		specular,
		fallback,
		onEngineResolved,
		as = 'div',
		children,
		...rest
	}: Props = $props();

	const resolved = $derived(
		resolveOptions(variant, intensity, {
			displacement,
			chromatic,
			edge,
			curvature,
			blur,
			saturation,
			specular
		})
	);

	const opacity = $derived(tintOpacity ?? resolved.tintOpacity);

	/**
	 * Server render.
	 *
	 * The server cannot probe, so it renders the frost engine with the per-instance tokens
	 * already applied. First paint is a finished frosted surface rather than an unstyled box,
	 * and because frost shares the tint, radius and shadow with the real engines, hydration
	 * adds refraction without moving or resizing anything.
	 *
	 * These properties are inline, which beats the rule `createGlass` writes. They are removed
	 * on mount, by name, so the consumer's own inline style is untouched.
	 */
	const SSR_KEYS = ['--murano-radius', '--murano-tint', '--murano-tint-opacity'] as const;
	const ssrStyle = $derived(
		[
			`--murano-radius:${radius}px`,
			tint ? `--murano-tint:${tint}` : '',
			`--murano-tint-opacity:${opacity}`
		]
			.filter(Boolean)
			.join(';')
	);

	function glass(node: HTMLElement) {
		let instance: GlassInstance | null = null;
		let detachInteraction: (() => void) | null = null;

		// The rule takes over from here, so the SSR placeholders have to go or they would win
		// on specificity and freeze the surface at its server-rendered values.
		for (const key of SSR_KEYS) node.style.removeProperty(key);

		$effect(() => {
			const next = {
				engine,
				source,
				radius,
				displacement: resolved.displacement,
				chromatic: resolved.chromatic,
				edge: resolved.edge,
				curvature: resolved.curvature,
				blur: resolved.blur,
				saturation: resolved.saturation,
				specular: resolved.specular,
				fallback,
				onEngineResolved
			};
			if (instance) instance.update(next);
			else instance = createGlass(node, next);

			node.style.setProperty('--murano-tint-opacity', String(opacity));
			if (tint) node.style.setProperty('--murano-tint', tint);
			else node.style.removeProperty('--murano-tint');

			if (DEV) warnIfUnreadable(node, rest.id ? `GlassSurface#${rest.id}` : 'GlassSurface');
		});

		$effect(() => {
			detachInteraction?.();
			// `interactive` is the switch. `specular.followPointer` is the override, so passing
			// it explicitly as false keeps the elastic press without the moving glare.
			detachInteraction = interactive
				? attachInteraction(node, {
						followPointer: specular?.followPointer ?? true,
						press: true,
						give: 0.02
					})
				: null;
			return () => {
				detachInteraction?.();
				detachInteraction = null;
			};
		});

		return () => instance?.destroy();
	}
</script>

<svelte:element
	this={as}
	{...rest}
	data-murano-engine="frost"
	style={ssrStyle + (rest.style ? ';' + rest.style : '')}
	{@attach glass}
>
	{@render children?.()}
</svelte:element>
