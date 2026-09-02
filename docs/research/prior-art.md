# Prior art

Phase 0 research. Every project below was read at source level, not from its README alone.
Sources fetched 2026-09-02.

The goal of this document is that you can understand the technique without opening anyone
else's repository.

---

## 1. The two mechanisms, and why the distinction decides the architecture

Every liquid-glass implementation on the web is one of two things. They are not variations
on a theme. They refract different pixels.

### Mechanism A: `backdrop-filter: blur() url(#f) saturate()`

The filter runs over the **backdrop**: whatever the page has already painted behind the
element. This is real, live refraction. Text scrolling underneath bends as it moves. Nothing
is duplicated.

It is Chromium-only, and this is not a temporary gap:

- WebKit bug [245510](https://bugs.webkit.org/show_bug.cgi?id=245510), "backdrop-filter:
  url(#some-svg-filter) doesn't work with SVG filters like feDisplacementMap", status NEW,
  unresolved.
- Mozilla bug [1961378](https://bugzil.la/1961378), "backdrop-filter gets ignored if it would
  fall back to a blob image (such like with some SVG)", status NEW.

Verified in Chrome: `CSS.supports('backdrop-filter','blur(5px) url(#f) saturate(1.5)')` is
`true` and the effect renders.

### Mechanism B: `filter: url(#f)` on the element

The filter's `SourceGraphic` is **the element and its own descendants**, rasterized. It works
in Chromium, WebKit and Gecko. It cannot see the page behind it.

The SVG 1.1 / Filter Effects 1 spec does define an input keyword for the backdrop:

> **BackgroundImage** This keyword represents the back drop defined by the current isolation
> group behind the filter region at the time that the filter element was invoked.
> (W3C Filter Effects 1, filter primitive `in` attribute)

No browser has ever implemented `BackgroundImage` or `BackgroundAlpha`. `backdrop-filter`
exists precisely because that input was abandoned. Treat it as unavailable forever.

### Consequence

A cross-browser lens cannot refract the live page. It can only refract pixels that live
**inside** the filtered element. So a cross-browser library has exactly one honest move:
put a copy of the backdrop inside the surface, filter the copy, and paint the content above
it unfiltered.

This single fact reorganizes the whole design, and it is where most published libraries
either stop or start UA-sniffing.

---

## 2. Project by project

### `samasante/liquid-glass` (511 stars, React) — the state of the art

**Technique.** Filters a _copy_. The public API is organized around one question: where does
the copy come from? A bare wrap frosts. `refract={node}` bends a passed node. `src`/`draw`
run a WebGL renderer over video or canvas. The live-page bend is offered separately and
labelled Blink-only in its own source comments.

The displacement map is generated on canvas at 512x512 and encodes three channels:

- **R** = X displacement, 0.5 neutral
- **G** = Y displacement, 0.5 neutral
- **B** = specular / glow mask, 128 none, 255 full

Optics are real, not gradient tricks. A spherical cap of chord half-width `a` and cap height
`h` has radius `R = (a² + h²) / 2h`; the surface gradient at distance `x` is `x / √(R² − x²)`,
normalized by the closed-form mean `∫₀ᴴ x/√(R²−x²) dx = R − √(R²−H²)` so average displacement
lands at 0.5. Edge feather is `erf(x) ≈ tanh(√π · x)`. Chromatic spread is a single constant
(0.22 for red, half that for green).

Only the top-left quadrant is computed; the other three are written by reflecting displacement
signs. A per-column dome LUT is reused across rows.

**Strong side.** Correct physics, one texture serving refraction and specular, genuinely
verified in WebKit via Playwright, and four documented Safari-specific fixes: no supersampling
in WebKit (a 2x source crosses WebKit's source-graphic size ceiling, past which it silently
drops the chroma and specular passes), shape-triggered map regeneration only (an `feImage`
href churning mid-drag makes Safari throttle and the shine vanishes), filter id version-bumped
per geometry change (WebKit caches filter output by id), and specular read pre-composite in
WebKit because `feComposite` ordering differs.

**Where we go further.** It is React, and it makes the refraction source the user's problem in
every case. We keep its optics and its WebKit hardening, and we remove the main DX cost by
resolving the refraction source automatically from the page background (see architecture.md,
`source: "auto"`). It also has no `prefers-reduced-transparency` / `forced-colors` story.

### `rizroze/liquid-glass` (17 stars, vanilla TS) — the trap catalogue

**Technique.** `backdrop-filter: url()`, Chromium only, explicit blur fallback elsewhere. Map
built on Canvas 2D: a neutral grey field, a red left-to-right linear gradient for X, a blue
top-to-bottom gradient for Y composited with `globalCompositeOperation = 'difference'`, then a
blurred grey rounded rect inset by `border` to neutralize the centre. Filter reads
`xChannelSelector="R" yChannelSelector="B"`.

**The Canvas-versus-feImage finding, which is load-bearing.** The original technique
(Jhey Tompkins) generates the map as an inline SVG data URI loaded through `feImage`. It does
not work: `feImage` renders an SVG data URI **as an image**, which restricts CSS property
evaluation. `mix-blend-mode` is ignored, `filter: blur()` is ignored, the centre never
neutralizes, and the whole element becomes a warped mess. Canvas 2D has no such problem because
`globalCompositeOperation` and `ctx.filter` are API calls, not CSS properties.

**We adopt this.** Generate on canvas, always.

**Also from here.** The filter region is synced to the displacement padding
(`maxDisplace = max(|scale| * 0.5, 20)`, floored at 20px so the region never collapses), and
the canvas is drawn **at full region size** with neutral padding so `feImage` with
`preserveAspectRatio="none"` cannot desynchronize the map from the element.

**Where we go further.** No Safari or Firefox refraction at all, and the fallback is bare
`blur(12px)`.

### `deepika-builds/liquid-glass` (256 stars, vanilla JS)

**Technique.** Same `backdrop-filter` family. Three staggered displacement passes,
`scales = [scale, scale + chroma, scale + 2*chroma]`, defaults `scale: -112, chroma: 6,
border: 0.07, mapBlur: 12`. Clean option naming (`scale`, `chroma`, `mapBlur`, `saturate`,
`fallbackBlur`) that we borrow directly.

**The problem.** Engine detection is UA sniffing:

```js
const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
if (isSafari || isFirefox) return false;
if (!CSS.supports('backdrop-filter', 'url(#lg)')) return false;
```

The `CSS.supports` line is there as a second gate because the first one is not trustworthy,
and the UA line is there because `CSS.supports` alone returns `true` in browsers that will not
render it. That combination is the whole detection problem in five lines. See §3.

### `LeonardSEO/liquid-glass-react` (React + a Python map generator)

**Technique.** The clearest written explanation of the SDF, and a build-time generator rather
than a runtime one. Closed-form rounded-rect SDF, central-difference gradient for the outward
normal, `smoothstep` rim falloff:

```python
qx = |x - cx| - (cx - r);  qy = |y - cy| - (cy - r)
sdf = ‖max(q,0)‖ + min(max(qx,qy),0) - r
nx, ny = normalize(∇sdf)
factor  = 1 - smoothstep(0, rim, clamp(-sdf, 0, ∞))
R = 128 + nx * factor * 127 ;  G = 128 + ny * factor * 127 ;  B = 128
```

It ships a `linear` mode purely to demonstrate the classic failure: a plain gradient map shears
the entire element uniformly instead of bending only the rim.

**Also from here.** The progressive-enhancement CSS pattern, which needs no `@supports`:

```css
backdrop-filter: blur(10px) saturate(180%); /* fallback */
backdrop-filter: blur(5px) url(#lens) saturate(180%) brightness(1.08);
```

A browser that rejects any value in a declaration drops that whole declaration and keeps the
previous one. We use this as a belt-and-braces layer under the JS detection, not instead of it.

**Where we go further.** A build-time PNG per element size does not survive responsive layout.
We generate at runtime and cache by shape key.

### `nikdelvin/liquid-glass` (98 stars, Astro)

**Technique.** Map is an SVG data URI built from two `linearGradient`s (`#F00` for X, `#0F0`
for Y) with `mix-blend-mode: screen`, over `#808080`, with a blurred grey inset rect for the
neutral centre. Automatic glassmorphism fallback in Safari, plus `LiquidText` / `LiquidButton`.

**Note the conflict with rizroze.** This is the SVG-data-URI-through-`feImage` path that
rizroze reports as broken. It works here because the blend and blur are applied inside the SVG
document itself rather than via CSS on the referencing element, but it is the fragile path.
Canvas remains the safe choice.

### `danilofiumi/liquid-glass-svelte` (71 stars, Svelte)

One 14 KB `GlassedButton.svelte` plus a 434 KB bundle. Web Component export, playground,
light/dark contrast handling. Useful as evidence that the Svelte audience wants this; not
useful as a technical reference.

### `Tozaburo/liquid-glass-svelte` (37 stars, Svelte) — the baseline to beat

Pure CSS layering: a main blur layer, an edge layer, a sheen layer, driven by an options object
of CSS lengths. **No displacement, no SVG filter, no refraction at all.** It also carries a
runtime dependency (`to-px`) for length parsing.

This is the current Svelte state of the art, and it is glassmorphism with extra layers.

### `kodlyft/liquid-ui` (Vue 3)

Reference for **breadth**, not for optics: 22 components, `data-theme` theming, everything on
CSS custom properties. Confirms the component list in the brief is the right shape and that
custom properties are the right theming surface.

### `DevSam7t3/liquid-glass` (`@avenra/liquid-glass`)

Snell's law framing, spring animations, specular. Mostly a demo (46 KB single HTML page) with
heavy repository scaffolding around it.

### Inspira UI `LiquidGlass` (Vue)

Good props API (`radius`, `border`, `lightness`, `blend`) and honest documentation of limits.
Nothing new at the optics level.

---

## 3. The detection problem, stated precisely

Measured in Chrome on 2026-09-02:

| check                                                               | Chrome result | useful?            |
| ------------------------------------------------------------------- | ------------- | ------------------ |
| `CSS.supports('backdrop-filter','blur(4px)')`                       | `true`        | yes, gates `frost` |
| `CSS.supports('backdrop-filter','url(#f)')`                         | `true`        | **no**             |
| `CSS.supports('backdrop-filter','blur(5px) url(#f) saturate(1.5)')` | `true`        | **no**             |
| `CSS.supports('filter','url(#f)')`                                  | `true`        | yes, gates `lens`  |

`url()` is valid `<filter-value-list>` grammar, so `CSS.supports` answers a parsing question,
not a rendering question. It returns `true` in engines that will not paint the result. This is
exactly why `deepika-builds` had to bolt UA sniffing on top of it.

There is also no way to read back the rendered result of a `backdrop-filter` from script: you
cannot draw a filtered DOM element into a canvas and sample it.

So the options are UA sniffing, or a structured client-hint check. We take the second:
`navigator.userAgentData.brands`, which is a typed, spec-defined API rather than a string to
regex, and which Firefox and Safari do not implement at all (so they resolve to `lens`/`frost`,
which is the correct failure direction). Details and the exact ladder are in
[architecture.md](../architecture.md).

---

## 4. What we take, and from whom

| Technique                                                         | Source              | Used for              |
| ----------------------------------------------------------------- | ------------------- | --------------------- |
| SDF rounded-rect map, normals from `∇sdf`, `smoothstep` rim       | LeonardSEO, rizroze | map generator         |
| Canvas 2D generation instead of `feImage`+SVG data URI            | rizroze             | map generator         |
| `difference` composite for the two-axis field                     | rizroze             | map generator         |
| Filter region synced to max displacement, floored                 | rizroze             | filter builder        |
| Map drawn at full region size with neutral padding                | rizroze             | alignment fix         |
| Spherical-cap dome, closed-form gradient mean, `erf` feather      | samasante           | curvature             |
| B channel carrying the specular mask                              | samasante           | specular, one texture |
| Quadrant mirroring + per-column LUT                               | samasante           | generation cost       |
| Four WebKit hardening rules                                       | samasante           | Safari correctness    |
| Refracting a copy instead of the backdrop                         | samasante           | `lens` engine         |
| Three-pass staggered `scale` + `feColorMatrix` + `feBlend screen` | rizroze, deepika    | chromatic aberration  |
| Option naming (`scale`, `chroma`, `mapBlur`, `saturate`)          | deepika             | public API            |
| Two-declaration CSS progressive enhancement                       | LeonardSEO          | fallback safety net   |
| Everything on CSS custom properties, `data-theme`                 | kodlyft             | theming               |

Credits go in the README and stay there.
