<svelte:head>
	<title>Murano Docs</title>
	<meta
		name="description"
		content="Apple-grade Liquid Glass for Svelte 5, with real refraction that survives Safari."
	/>
</svelte:head>

<main>
	<p class="eyebrow">MURANO</p>
	<h1>Liquid Glass for Svelte 5.</h1>
	<p class="lede">Real refraction, chromatic aberration, and honest fallbacks across browsers.</p>
	<a href="https://github.com/critiq17/murano"
		>Read the documentation on GitHub <span aria-hidden="true">↗</span></a
	>
</main>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		min-width: 320px;
		background: #0d1017;
		color: #f5f7fb;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	main {
		display: grid;
		min-height: 100svh;
		place-content: center;
		padding: 2rem;
		background:
			radial-gradient(circle at 30% 20%, rgb(76 133 255 / 0.22), transparent 35rem),
			radial-gradient(circle at 80% 80%, rgb(183 93 255 / 0.16), transparent 32rem);
	}

	.eyebrow {
		margin: 0 0 1.5rem;
		color: #9ebcff;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.2em;
	}

	h1 {
		max-width: 12ch;
		margin: 0;
		font-size: clamp(3rem, 10vw, 7rem);
		line-height: 0.95;
		letter-spacing: -0.06em;
	}

	.lede {
		max-width: 34rem;
		margin: 2rem 0;
		color: #b8c0d1;
		font-size: clamp(1.1rem, 2vw, 1.35rem);
		line-height: 1.5;
	}

	a {
		width: fit-content;
		color: #fff;
		font-weight: 650;
		text-underline-offset: 0.25em;
	}
</style>
