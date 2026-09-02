<script lang="ts">
	import { GlassSurface } from '$lib/index.js';
	import type { Engine, Variant } from '$lib/index.js';
	import '$lib/styles/index.css';

	type Backdrop = 'text' | 'checker' | 'gradient' | 'photo';

	interface Optics {
		displacement: number;
		chromatic: number;
		edge: number;
		curvature: number;
		blur: number;
		saturation: number;
		radius: number;
		specular: number;
	}

	const PRESETS: Record<string, Optics> = {
		'Control Center': {
			displacement: -112,
			chromatic: 6,
			edge: 0.12,
			curvature: 0.35,
			blur: 3,
			saturation: 1.5,
			radius: 28,
			specular: 0.5
		},
		'iOS Dock': {
			displacement: -60,
			chromatic: 3,
			edge: 0.22,
			curvature: 0.15,
			blur: 6,
			saturation: 1.8,
			radius: 40,
			specular: 0.7
		},
		Notification: {
			displacement: -150,
			chromatic: 10,
			edge: 0.09,
			curvature: 0.6,
			blur: 1,
			saturation: 1.2,
			radius: 22,
			specular: 0.4
		},
		'Subtle Card': {
			displacement: -40,
			chromatic: 0,
			edge: 0.3,
			curvature: 0.2,
			blur: 10,
			saturation: 1.1,
			radius: 20,
			specular: 0.25
		},
		Clear: {
			displacement: -180,
			chromatic: 14,
			edge: 0.1,
			curvature: 0.8,
			blur: 0,
			saturation: 1,
			radius: 32,
			specular: 0.6
		}
	};

	const DEFAULT_PRESET: Optics = {
		displacement: -112,
		chromatic: 6,
		edge: 0.12,
		curvature: 0.35,
		blur: 3,
		saturation: 1.5,
		radius: 28,
		specular: 0.5
	};
	let o = $state<Optics & { angle: number }>({ ...DEFAULT_PRESET, angle: 135 });
	let engine = $state<Engine | 'pending'>('pending');
	let variant = $state<Variant>('regular');
	let intensity = $state(0.6);
	let interactive = $state(true);
	let tint = $state('#ffffff');
	// Explicit optics always beat the intensity curve. This toggle makes that visible: with it
	// on, the optics props are not passed at all and the curve drives everything.
	let curveDriven = $state(true);
	let forced = $state<'auto' | 'backdrop' | 'lens' | 'frost'>('auto');
	let backdrop = $state<Backdrop>('text');
	let fps = $state(0);

	function preset(name: string) {
		const p = PRESETS[name];
		if (!p) return;
		o = { ...p, angle: o.angle };
		curveDriven = false;
	}

	// Refraction can only be judged in motion, so the card is draggable.
	let x = $state(0);
	let y = $state(0);
	function drag(node: HTMLElement) {
		let ox = 0;
		let oy = 0;
		const move = (e: PointerEvent) => {
			x = e.clientX - ox;
			y = e.clientY - oy;
		};
		const down = (e: PointerEvent) => {
			node.setPointerCapture(e.pointerId);
			ox = e.clientX - x;
			oy = e.clientY - y;
			node.addEventListener('pointermove', move);
		};
		const up = (e: PointerEvent) => {
			node.releasePointerCapture(e.pointerId);
			node.removeEventListener('pointermove', move);
		};
		node.addEventListener('pointerdown', down);
		node.addEventListener('pointerup', up);
		return () => {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointerup', up);
		};
	}

	$effect(() => {
		let frames = 0;
		let last = performance.now();
		let raf = 0;
		const tick = (now: number) => {
			frames++;
			if (now - last >= 500) {
				fps = Math.round((frames * 1000) / (now - last));
				frames = 0;
				last = now;
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	});
</script>

<div class="app">
	<main class="stage" data-backdrop={backdrop}>
		{#if backdrop === 'text'}
			<div class="fill text" aria-hidden="true">
				{#each Array.from({ length: 60 }, (_, n) => n) as i (i)}
					<p>
						{i}. Small text under glass is the only honest test of a refraction. The rim bends, the
						centre stays optically clear, and chromatic aberration splits colour where contrast is
						highest. A uniform shear means the map is a gradient, not a signed distance field.
					</p>
				{/each}
			</div>
		{/if}

		<GlassSurface
			class="card"
			style="translate: {x}px {y}px"
			{variant}
			{intensity}
			{interactive}
			{tint}
			engine={forced}
			radius={o.radius}
			displacement={curveDriven ? undefined : o.displacement}
			chromatic={curveDriven ? undefined : o.chromatic}
			edge={curveDriven ? undefined : o.edge}
			curvature={curveDriven ? undefined : o.curvature}
			blur={curveDriven ? undefined : o.blur}
			saturation={curveDriven ? undefined : o.saturation}
			specular={curveDriven ? { angle: o.angle } : { intensity: o.specular, angle: o.angle }}
			onEngineResolved={(e) => (engine = e)}
			{@attach drag}
		>
			<strong>Liquid Glass</strong>
			<span>drag me</span>
		</GlassSurface>
	</main>

	<aside class="panel">
		<header>
			<h1>murano</h1>
			<div class="badges">
				<span class="badge" class:on={engine !== 'frost' && engine !== 'none'}>{engine}</span>
				<span class="badge">{fps} fps</span>
			</div>
		</header>

		<div class="scroll">
			<section>
				<h2>Preset</h2>
				<div class="chips">
					{#each Object.keys(PRESETS) as name (name)}
						<button onclick={() => preset(name)}>{name}</button>
					{/each}
				</div>
			</section>

			<section>
				<h2>Backdrop</h2>
				<div class="chips">
					{#each ['text', 'checker', 'gradient', 'photo'] as b (b)}
						<button class:sel={backdrop === b} onclick={() => (backdrop = b as Backdrop)}
							>{b}</button
						>
					{/each}
				</div>
			</section>

			<section>
				<h2>Engine</h2>
				<div class="chips">
					{#each ['auto', 'backdrop', 'lens', 'frost'] as e (e)}
						<button class:sel={forced === e} onclick={() => (forced = e as typeof forced)}
							>{e}</button
						>
					{/each}
				</div>
			</section>

			<section>
				<h2>Material</h2>
				<div class="chips">
					{#each ['regular', 'clear'] as v (v)}
						<button class:sel={variant === v} onclick={() => (variant = v as Variant)}>{v}</button>
					{/each}
					<button class:sel={interactive} onclick={() => (interactive = !interactive)}>
						interactive
					</button>
				</div>
				<label class="mt">
					intensity<b>{intensity.toFixed(2)}</b>
					<input type="range" min="0" max="1" step="0.01" bind:value={intensity} />
				</label>
				<label>
					tint<b><input type="color" bind:value={tint} /></b>
				</label>
			</section>

			<section class:muted={curveDriven}>
				<h2>
					Optics
					<button class="tiny" onclick={() => (curveDriven = !curveDriven)}>
						{curveDriven ? 'driven by intensity' : 'explicit'}
					</button>
				</h2>
				<label
					>displacement<b>{o.displacement}</b>
					<input type="range" min="-220" max="0" step="1" bind:value={o.displacement} /></label
				>
				<label
					>chromatic<b>{o.chromatic}</b>
					<input type="range" min="0" max="20" step="1" bind:value={o.chromatic} /></label
				>
				<label
					>edge<b>{o.edge.toFixed(2)}</b>
					<input type="range" min="0.02" max="0.6" step="0.01" bind:value={o.edge} /></label
				>
				<label
					>curvature<b>{o.curvature.toFixed(2)}</b>
					<input type="range" min="0" max="1" step="0.01" bind:value={o.curvature} /></label
				>
				<label
					>blur<b>{o.blur}</b>
					<input type="range" min="0" max="20" step="1" bind:value={o.blur} /></label
				>
				<label
					>saturation<b>{o.saturation.toFixed(2)}</b>
					<input type="range" min="0" max="3" step="0.05" bind:value={o.saturation} /></label
				>
				<label
					>radius<b>{o.radius}</b>
					<input type="range" min="0" max="95" step="1" bind:value={o.radius} /></label
				>
				<label
					>specular<b>{o.specular.toFixed(2)}</b>
					<input type="range" min="0" max="1" step="0.01" bind:value={o.specular} /></label
				>
				<label
					>light angle<b>{o.angle}°</b>
					<input type="range" min="0" max="360" step="5" bind:value={o.angle} /></label
				>
			</section>
		</div>
	</aside>
</div>

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		overflow: hidden;
	}
	:global(body) {
		font:
			13px/1.5 ui-sans-serif,
			system-ui,
			sans-serif;
		color: #e8e8ee;
		background: #08080c;
	}

	.app {
		display: grid;
		grid-template-columns: 1fr 268px;
		height: 100vh;
	}

	.stage {
		position: relative;
		overflow: hidden;
	}
	.fill {
		position: absolute;
		inset: 0;
	}
	.stage[data-backdrop='text'] {
		background: #0d0d14;
	}
	.text {
		padding: 24px 32px;
		columns: 3;
		column-gap: 32px;
		font-size: 11px;
		line-height: 1.65;
		color: #b9c0d6;
	}
	.text p {
		margin: 0 0 10px;
	}
	.stage[data-backdrop='checker'] {
		background-color: #fff;
		background-image:
			linear-gradient(45deg, #0a0a12 25%, transparent 25%, transparent 75%, #0a0a12 75%),
			linear-gradient(45deg, #0a0a12 25%, transparent 25%, transparent 75%, #0a0a12 75%);
		background-size: 44px 44px;
		background-position:
			0 0,
			22px 22px;
	}
	.stage[data-backdrop='gradient'] {
		background:
			radial-gradient(70% 70% at 20% 15%, #3b7dff, transparent 65%),
			radial-gradient(60% 60% at 85% 75%, #ff2fa0, transparent 65%),
			radial-gradient(50% 50% at 60% 95%, #ffb020, transparent 65%), #12061f;
	}
	.stage[data-backdrop='photo'] {
		background:
			conic-gradient(from 210deg at 30% 30%, #ff6b3d, #ffd23f, #3ddc97, #2f7cff, #b14aff, #ff6b3d),
			#000;
		background-size: 130% 130%;
		background-position: center;
	}

	:global(.card) {
		position: absolute;
		top: 28%;
		left: 50%;
		margin-left: -170px;
		width: 340px;
		height: 210px;
		display: grid;
		align-content: center;
		justify-items: center;
		gap: 4px;
		cursor: grab;
		touch-action: none;
		user-select: none;
		text-shadow: 0 1px 12px rgb(0 0 0 / 0.45);
	}
	:global(.card:active) {
		cursor: grabbing;
	}
	:global(.card strong) {
		font-size: 21px;
		letter-spacing: -0.01em;
	}
	:global(.card span) {
		font-size: 11px;
		opacity: 0.65;
	}
	label.mt {
		margin-top: 4px;
	}
	input[type='color'] {
		width: 34px;
		height: 18px;
		padding: 0;
		border: 1px solid #262634;
		border-radius: 4px;
		background: none;
	}

	.panel {
		display: grid;
		grid-template-rows: auto 1fr;
		min-height: 0;
		background: #0f0f16;
		border-left: 1px solid #1e1e2a;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 16px 16px 12px;
		border-bottom: 1px solid #1e1e2a;
	}
	h1 {
		margin: 0;
		font-size: 15px;
		letter-spacing: -0.01em;
	}
	.badges {
		display: flex;
		gap: 6px;
	}
	.badge {
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		padding: 3px 7px;
		border-radius: 999px;
		background: #1c1c28;
		color: #8b90a6;
	}
	.badge.on {
		background: #0f2f22;
		color: #4ade80;
	}

	.scroll {
		overflow-y: auto;
		min-height: 0;
		padding: 4px 16px 24px;
	}
	section {
		padding: 14px 0;
		border-bottom: 1px solid #1a1a25;
	}
	section:last-child {
		border-bottom: 0;
	}
	section.muted label {
		opacity: 0.42;
	}
	button.tiny {
		float: right;
		font-size: 9px;
		padding: 2px 6px;
		text-transform: none;
		letter-spacing: 0;
	}
	h2 {
		margin: 0 0 9px;
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: #6b7089;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	button {
		font: inherit;
		font-size: 11px;
		padding: 4px 9px;
		border-radius: 7px;
		border: 1px solid #262634;
		background: #16161f;
		color: #b9bdd0;
		cursor: pointer;
	}
	button:hover {
		border-color: #3a3a50;
		color: #e8e8ee;
	}
	button.sel {
		background: #1d3a6b;
		border-color: #2f6fe0;
		color: #dbe7ff;
	}

	label {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: baseline;
		gap: 2px 8px;
		margin-bottom: 9px;
		font-size: 11px;
		color: #8b90a6;
	}
	label b {
		color: #e8e8ee;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	input[type='range'] {
		grid-column: 1 / -1;
		width: 100%;
		height: 3px;
		margin: 3px 0 0;
		accent-color: #2f6fe0;
	}
</style>
