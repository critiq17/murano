<div align="center">

# Murano

**Apple-grade Liquid Glass for Svelte 5. Refraction that survives Safari.**

[![npm](https://img.shields.io/npm/v/murano?color=%230a84ff)](https://npmjs.com/package/murano)
[![size](https://img.shields.io/bundlephobia/minzip/murano?label=core%20gzip)](https://bundlephobia.com/package/murano)
[![CI](https://img.shields.io/github/actions/workflow/status/critiq17/murano/ci.yml?branch=master)](https://github.com/critiq17/murano/actions)
[![license](https://img.shields.io/npm/l/murano)](./LICENSE)

<!-- 5s loop: a glass card dragged across a photo, edges bending, chroma at the rim -->
<!-- TODO(phase 7): docs/assets/hero.mp4 -->

**[Live playground](https://murano.dev/playground)** · [Docs](https://murano.dev/docs) · [Why it works in Safari](./docs/architecture.md)

</div>

---

## Install

```bash
pnpm add murano
```

```svelte
<script>
	import { GlassCard } from 'murano';
</script>

<GlassCard>Hello</GlassCard>
```

That is the whole setup. No provider, no config, no CSS import required.

---

## Not glassmorphism

|           | Glassmorphism             | Murano                                               |
| --------- | ------------------------- | ---------------------------------------------------- |
| Edges     | Uniform blur              | Light bends at the rim, centre stays optically clear |
| Colour    | Flat tint                 | Chromatic aberration at high-contrast edges          |
| Light     | Fixed `box-shadow`        | Specular highlight that tracks the pointer           |
| Shape     | Blur ignores the shape    | Displacement follows the rounded-rect SDF            |
| Motion    | Static                    | Elastic press, spring release                        |
| Technique | `backdrop-filter: blur()` | `feDisplacementMap` over a generated SDF map         |

## Not the other liquid-glass libraries

Nearly every published implementation is built on `backdrop-filter: url()`, which is
Chromium-only. In Safari and Firefox those libraries collapse to a plain blur, and most of them
decide that by regexing the user-agent string.

Murano ships three engines behind one component and picks between them at runtime:

| Engine     | Mechanism                            | Refracts                                               | Chromium | Safari | Firefox |
| ---------- | ------------------------------------ | ------------------------------------------------------ | -------- | ------ | ------- |
| `backdrop` | `backdrop-filter: blur() url(#f)`    | the live page behind, anything moving                  | ✅       | ❌     | ❌      |
| `lens`     | `filter: url(#f)` on a backdrop copy | a resolved source: page background, image, video, node | ✅       | ✅     | ✅      |
| `frost`    | `backdrop-filter: blur() saturate()` | nothing, blur only                                     | ✅       | ✅     | ✅      |

Safari and Firefox get **real refraction**, not a consolation blur, whenever a refraction
source can be resolved. `source="auto"` resolves it from the page background with no
configuration and no DOM cloning.

Two things we will not pretend about:

- `backdrop-filter: url()` will not work in Safari or Firefox. The bugs are open and unresolved
  ([WebKit 245510](https://bugs.webkit.org/show_bug.cgi?id=245510),
  [Mozilla 1961378](https://bugzil.la/1961378)).
- The `lens` engine bends its resolved source, not everything on the page. A card sitting
  between the source and the glass will not bend. In Chromium `backdrop` has no such limit.

Full reasoning: [docs/architecture.md](./docs/architecture.md).

---

## API

```svelte
<!-- 1. just works -->
<GlassSurface>Hello</GlassSurface>

<!-- 2. tokens -->
<GlassSurface variant="regular" intensity={0.8} tint="#0a84ff" radius={28} interactive />
<!-- `intensity` drives displacement, blur, tint and specular together.
     Any optics prop you pass explicitly wins over the curve. -->

<!-- 3. full optics -->
<GlassSurface
	engine="auto"
	source="auto"
	displacement={-112}
	chromatic={6}
	edge={0.12}
	curvature={0.35}
	blur={3}
	saturation={1.5}
	specular={{ angle: 135, intensity: 0.5 }}
	fallback={{ blur: 16, opacity: 0.72 }}
	onEngineResolved={(e) => console.log(e)}
/>

<!-- 4. headless -->
<div {@attach glass({ displacement: -90 })}>your element</div>
```

Every prop has a mirror CSS custom property, so a theme is a stylesheet:

```css
:root {
	--glass-tint: 255 255 255;
	--glass-tint-opacity: 0.1;
	--glass-blur: 12px;
	--glass-radius: 24px;
	--glass-displacement: -112;
	--glass-chromatic: 6;
	--glass-ease: cubic-bezier(0.32, 0.72, 0, 1);
}
```

Non-Svelte projects use the imperative core:

```ts
import { createGlass } from 'murano/core';
const g = createGlass(el, opts);
g.update(opts);
g.destroy();
g.engine;
```

---

## Performance

Numbers enforced in CI, not claimed in a README:

- One displacement map per unique **shape**, cached across every instance on the page. Moving a
  surface never regenerates it; squash and stretch ride an `feColorMatrix` axis scale.
- Pointer interaction writes CSS custom properties inside `requestAnimationFrame`. No Svelte
  re-render per frame.
- `contain: layout paint style` and `isolation: isolate` on every surface. `will-change` is set
  on interaction and cleared after.
- `chromatic: 0` emits a one-pass filter graph instead of three.
- Budgets: core ≤ 8 KB gzip, core plus five components ≤ 14 KB, full barrel ≤ 28 KB.
  Tree-shaking is asserted by a test: importing `GlassButton` must not pull in `GlassModal`.
- Benchmark: 20 surfaces on screen at 60 fps, measured per browser in Playwright.

## Accessibility

- `prefers-reduced-transparency: reduce` drops refraction and raises opacity, the way Apple's
  own Reduced Transparency does.
- `prefers-reduced-motion: reduce` disables every spring.
- `prefers-contrast: more` strengthens the border and the backing.
- `forced-colors: active` turns the effect off and hands over to system colours.
- Every decorative layer is `aria-hidden` with `pointer-events: none`. The focus ring is its own
  layer above the glass, never under it.
- Dev-mode warning when tint opacity leaves text below 4.5:1.

[When not to use glass](./docs/accessibility.md) is a page in the docs, because the honest
answer is sometimes "don't".

---

## Docs

[Architecture](./docs/architecture.md) ·
[Optics](./docs/optics.md) ·
[Performance](./docs/performance.md) ·
[Accessibility](./docs/accessibility.md) ·
[Prior art](./docs/research/prior-art.md) ·
[Contributing](./docs/contributing.md)

## Credits

Murano is an independent implementation, and it stands on published technique. Full breakdown
in [docs/research/prior-art.md](./docs/research/prior-art.md).

- [samasante/liquid-glass](https://github.com/samasante/liquid-glass) — refracting a copy
  instead of the backdrop, the spherical-cap dome, the specular mask in the map's blue channel,
  and the four WebKit hardening rules.
- [rizroze/liquid-glass](https://github.com/rizroze/liquid-glass) — Canvas 2D generation instead
  of `feImage`, the `difference` composite, filter-region and alignment fixes.
- [LeonardSEO/liquid-glass-react](https://github.com/LeonardSEO/liquid-glass-react) — the
  clearest write-up of the rounded-rect SDF and its normals.
- [deepika-builds/liquid-glass](https://github.com/deepika-builds/liquid-glass) — option naming.
- [nikdelvin/liquid-glass](https://github.com/nikdelvin/liquid-glass) — fallback behaviour.
- [Tozaburo/liquid-glass-svelte](https://github.com/Tozaburo/liquid-glass-svelte) — the Svelte
  baseline this project set out to beat.
- [kodlyft/liquid-ui](https://github.com/kodlyft/liquid-ui) — component breadth and custom-property theming.
- Jhey Tompkins, for the original displacement-map pen the whole genre descends from.
- [Liquid Glass in the Browser](https://specy.app/blog/posts/liquid-glass-in-the-web),
  [ekino](https://medium.com/ekino-france/liquid-glass-in-css-and-svg-839985fcb88d),
  [LogRocket](https://blog.logrocket.com/how-create-liquid-glass-effects-css-and-svg/),
  and Apple's [WWDC25 "Meet Liquid Glass"](https://developer.apple.com/videos/play/wwdc2025/219/)
  plus the [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials) page.

## License

MIT
