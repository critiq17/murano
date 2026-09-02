<script lang="ts">
	import { GlassSurface } from 'murano';
	import type { Engine, Variant } from 'murano';
	import 'murano/styles.css';

	type Backdrop = 'gradient' | 'checker' | 'text';

	const presets = {
		'Control Center': { displacement: -112, chromatic: 6, edge: 0.12, curvature: 0.35, blur: 3, saturation: 1.5, radius: 30 },
		'Clear Lens': { displacement: -180, chromatic: 12, edge: 0.1, curvature: 0.75, blur: 0, saturation: 1.1, radius: 32 },
		'Subtle Card': { displacement: -42, chromatic: 0, edge: 0.24, curvature: 0.2, blur: 10, saturation: 1.15, radius: 22 }
	} as const;

	type Optics = { displacement: number; chromatic: number; edge: number; curvature: number; blur: number; saturation: number; radius: number };
	type SliderDefinition = [keyof Optics, number, number, number];
	const sliderDefinitions: SliderDefinition[] = [
		['displacement', -220, 0, 1],
		['chromatic', 0, 20, 1],
		['edge', 0.02, 0.6, 0.01],
		['curvature', 0, 1, 0.01],
		['blur', 0, 20, 1],
		['saturation', 0, 3, 0.05],
		['radius', 0, 100, 1]
	];

	let optics = $state<Optics>({ ...presets['Control Center'] });
	let variant = $state<Variant>('regular');
	let intensity = $state(0.62);
	let backdrop = $state<Backdrop>('gradient');
	let requestedEngine = $state<'auto' | 'backdrop' | 'lens' | 'frost'>('auto');
	let resolvedEngine = $state<Engine | 'pending'>('pending');
	let interactive = $state(true);
	let dragging = $state(false);
	let position = $state({ x: 0, y: 0 });

	function applyPreset(name: keyof typeof presets) {
		optics = { ...presets[name] };
		intensity = 0.62;
	}

	function drag(node: HTMLElement) {
		let origin = { x: 0, y: 0 };
		const move = (event: PointerEvent) => {
			position = { x: event.clientX - origin.x, y: event.clientY - origin.y };
		};
		const down = (event: PointerEvent) => {
			node.setPointerCapture(event.pointerId);
			dragging = true;
			origin = { x: event.clientX - position.x, y: event.clientY - position.y };
			node.addEventListener('pointermove', move);
		};
		const up = (event: PointerEvent) => {
			if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
			dragging = false;
			node.removeEventListener('pointermove', move);
		};
		node.addEventListener('pointerdown', down);
		node.addEventListener('pointerup', up);
		node.addEventListener('pointercancel', up);
		return () => {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', up);
			node.removeEventListener('pointermove', move);
		};
	}
</script>

<svelte:head>
	<title>Murano — Liquid Glass for Svelte 5</title>
	<meta name="description" content="Interactive Liquid Glass playground for Svelte 5." />
</svelte:head>

<div class="app">
	<main class="stage" data-backdrop={backdrop}>
		<div class="topbar">
			<div><span class="mark">M</span><strong>murano</strong><span class="tag">preview</span></div>
			<a href="https://github.com/critiq17/murano">GitHub ↗</a>
		</div>

		{#if backdrop === 'text'}
			<div class="stress-text" aria-hidden="true">
				{#each Array.from({ length: 30 }, (_, i) => i) as i (i)}
					<p>{i + 1}. Real refraction bends the edge and leaves the centre optically clear. This tiny text is the stress test. A gradient map would shear every line uniformly; an SDF map bends only the rim.</p>
				{/each}
			</div>
		{/if}

		<GlassSurface
			class="hero-glass"
			style="translate: {position.x}px {position.y}px"
			variant={variant}
			intensity={intensity}
			interactive={interactive}
			engine={requestedEngine}
			radius={optics.radius}
			displacement={optics.displacement}
			chromatic={optics.chromatic}
			edge={optics.edge}
			curvature={optics.curvature}
			blur={optics.blur}
			saturation={optics.saturation}
			onEngineResolved={(event) => (resolvedEngine = event)}
			{@attach drag}
		>
			<div class="hero-copy"><span class="eyebrow">LIQUID GLASS · SVELTE 5</span><h1>Glass that<br /><em>moves light.</em></h1><p>Drag this surface across the background. Watch the rim refract, split colour and catch the light.</p><span class="drag-hint">↕ &nbsp; drag me across the canvas</span></div>
		</GlassSurface>

		<div class="stage-footer"><span>real-time optical preview</span><span class="status"><i></i>{resolvedEngine} engine</span></div>
	</main>

	<aside class="controls">
		<div class="controls-head"><div><span class="eyebrow">MATERIAL LAB</span><h2>Shape the glass.</h2></div><span class="live-dot">LIVE</span></div>
		<section><span class="section-label">Preset</span><div class="chips">{#each Object.keys(presets) as name (name)}<button class:active={name === 'Control Center' && optics.displacement === -112} onclick={() => applyPreset(name as keyof typeof presets)}>{name}</button>{/each}</div></section>
		<section><span class="section-label">Backdrop</span><div class="chips">{#each ['gradient', 'checker', 'text'] as item (item)}<button class:active={backdrop === item} onclick={() => (backdrop = item as Backdrop)}>{item}</button>{/each}</div></section>
		<section><span class="section-label">Engine <span class="value">{resolvedEngine}</span></span><div class="chips">{#each ['auto', 'backdrop', 'lens', 'frost'] as item (item)}<button class:active={requestedEngine === item} onclick={() => (requestedEngine = item as typeof requestedEngine)}>{item}</button>{/each}</div></section>
		<section><span class="section-label">Material <span class="value">{variant} · {intensity.toFixed(2)}</span></span><div class="chips"><button class:active={variant === 'regular'} onclick={() => (variant = 'regular')}>regular</button><button class:active={variant === 'clear'} onclick={() => (variant = 'clear')}>clear</button><button class:active={interactive} onclick={() => (interactive = !interactive)}>interactive</button></div><label class="visually-hidden" for="intensity">Intensity</label><input id="intensity" aria-label="intensity" type="range" min="0" max="1" step="0.01" bind:value={intensity} /></section>
		<section><span class="section-label">Optics <span class="value">{optics.displacement}px</span></span>
			{#each sliderDefinitions as item (item[0])}
				<label class="slider"><span>{item[0]}</span><b>{optics[item[0]].toFixed(item[3] < 1 ? 2 : 0)}</b><input aria-label={item[0]} type="range" min={item[1]} max={item[2]} step={item[3]} bind:value={optics[item[0]]} /></label>
			{/each}
		</section>
		<p class="note">The playground is served from GitHub Pages while the package is in preview.</p>
	</aside>
</div>

<style>
	:global(*) { box-sizing: border-box; }
	:global(html, body) { margin: 0; min-width: 320px; background: #080a10; color: #f2f4fb; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
	:global(body) { overflow: hidden; }
	.app { display: grid; grid-template-columns: minmax(0, 1fr) 330px; height: 100svh; overflow: hidden; }
	.stage { position: relative; overflow: hidden; isolation: isolate; background: radial-gradient(circle at 26% 28%, #315fbd, transparent 34%), radial-gradient(circle at 78% 70%, #863b8d, transparent 36%), #111521; transition: background .5s ease; }
	.stage[data-backdrop='checker'] { background-color: #f4f5f8; background-image: linear-gradient(45deg, #161b2b 25%, transparent 25%, transparent 75%, #161b2b 75%), linear-gradient(45deg, #161b2b 25%, transparent 25%, transparent 75%, #161b2b 75%); background-position: 0 0, 34px 34px; background-size: 68px 68px; }
	.stage[data-backdrop='text'] { background: #10131c; }
	.topbar { position: absolute; z-index: 5; inset: 22px 28px auto; display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
	.topbar > div { display: flex; align-items: center; gap: 9px; }.topbar a { color: inherit; opacity: .62; text-decoration: none; }.mark { display: grid; place-items: center; width: 25px; height: 25px; border: 1px solid #ffffff45; border-radius: 8px; font-size: 11px; }.tag { color: #a9c2ff; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }
	:global(.hero-glass) { position: absolute; top: 50%; left: 50%; width: min(540px, calc(100% - 80px)); min-height: 300px; margin: -150px 0 0 -270px; cursor: grab; }:global(.hero-glass:active) { cursor: grabbing; }
	.hero-copy { padding: 54px 58px; }.eyebrow { color: #abc1f5; font-size: 10px; font-weight: 700; letter-spacing: .17em; }.hero-copy h1 { margin: 18px 0 18px; font-size: clamp(38px, 5vw, 66px); line-height: .94; letter-spacing: -.065em; }.hero-copy h1 em { color: #b9cfff; font-style: normal; }.hero-copy p { max-width: 350px; margin: 0; color: #d8def0; font-size: 14px; line-height: 1.6; }.drag-hint { display: block; margin-top: 46px; color: #c6d2ef; font-size: 11px; opacity: .64; }.stress-text { position: absolute; inset: 80px 40px; columns: 3; column-gap: 28px; color: #aeb6cd; font-size: 11px; line-height: 1.65; opacity: .75; }.stress-text p { margin: 0 0 10px; }
	.stage-footer { position: absolute; z-index: 2; inset: auto 28px 22px; display: flex; justify-content: space-between; color: #b5bdd2; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; opacity: .65; }.status { display: flex; align-items: center; gap: 7px; }.status i { width: 6px; height: 6px; border-radius: 50%; background: #5cf0a0; box-shadow: 0 0 12px #5cf0a0; }
	.controls { min-height: 0; overflow-y: auto; padding: 28px 22px; background: #10121a; border-left: 1px solid #252936; }.controls-head { display: flex; justify-content: space-between; align-items: start; margin-bottom: 30px; }.controls h2 { margin: 8px 0 0; font-size: 25px; letter-spacing: -.05em; }.live-dot { padding: 4px 7px; border: 1px solid #254e3b; border-radius: 5px; color: #63e5a0; font-size: 9px; letter-spacing: .12em; }.controls section { padding: 18px 0; border-top: 1px solid #252936; }.section-label { display: flex; justify-content: space-between; margin-bottom: 10px; color: #8c96ae; font-size: 11px; }.controls label { display: flex; justify-content: space-between; margin-bottom: 10px; color: #8c96ae; font-size: 11px; }.value, .slider b { color: #e7ebf6; font-variant-numeric: tabular-nums; font-weight: 500; }.chips { display: flex; flex-wrap: wrap; gap: 5px; }.chips button { padding: 6px 8px; border: 1px solid #2a2e3d; border-radius: 6px; background: #171a24; color: #aab2c6; cursor: pointer; font: inherit; font-size: 10px; }.chips button.active, .chips button:hover { border-color: #597fcb; background: #203154; color: #e1eaff; }.slider { display: grid !important; grid-template-columns: 1fr auto; gap: 3px 8px; margin: 11px 0 0; }.slider input { grid-column: 1 / -1; width: 100%; accent-color: #6c91df; }.note { margin: 20px 0 0; color: #6e778f; font-size: 10px; line-height: 1.5; }.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
	@media (max-width: 760px) { :global(body) { overflow: auto; }.app { display: block; height: auto; min-height: 100svh; }.stage { height: 610px; }.controls { overflow: visible; }:global(.hero-glass) { width: calc(100% - 40px); margin-left: calc((40px - 100%) / 2); }.hero-copy { padding: 42px 34px; }.stress-text { columns: 2; inset: 70px 20px; } }
</style>
