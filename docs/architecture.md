# Architecture

Decisions for `murano`. Where this document contradicts the original brief, the contradiction
is called out and argued, not silently applied.

---

## 1. The correction that reshapes everything

The brief's engine table describes `engine: "lens"` as `filter: url()` on the element giving
"refraction of live DOM", while §5 also states the iron rule that content must never pass
through the displacement filter.

Those two cannot both hold. `filter: url()` operates on the element's own rasterized pixels.
It has no access to the backdrop, in any browser, and never will: the spec input that would
have provided it (`BackgroundImage`) was never implemented anywhere and `backdrop-filter`
exists because of that. If the element's only pixels are its content, then either the content
gets filtered (breaking the iron rule) or nothing visible gets filtered at all.

Evidence in [research/prior-art.md §1](./research/prior-art.md).

**What is actually true:**

- Refracting the **live page behind** an element requires `backdrop-filter: url()`. Chromium
  only, with open unresolved bugs in both WebKit and Gecko.
- Cross-browser refraction is possible, but only of pixels **inside** the surface. So we put a
  copy of the backdrop inside, filter the copy, and paint content above it clean.

The iron rule survives intact. The "lens refracts live DOM" claim does not.

---

## 2. Three engines

```
                          <GlassSurface>
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
  engine: "backdrop"      engine: "lens"          engine: "frost"
  backdrop-filter:        filter: url(#f) on      backdrop-filter:
    blur() url(#f)          a backdrop-COPY         blur() saturate()
    saturate()              layer inside
  ─────────────────       ─────────────────       ─────────────────
  Refracts the LIVE       Refracts a resolved     No refraction.
  page. Anything          source: page bg,        Frost, tint, edge,
  behind it, moving.      image, video, node.     specular.
  ─────────────────       ─────────────────       ─────────────────
  Chromium                Chromium, WebKit,       Everywhere
                          Gecko
```

### `backdrop`

Highest fidelity and cheapest, because nothing is duplicated and the filter rides the
compositing pass that `backdrop-filter: blur()` already requires. Text scrolling underneath
bends live. Preferred whenever available.

### `lens`

The cross-browser path, and the reason this library exists.

A `[1] lens` layer inside the surface holds a copy of the refraction source, positioned so it
lines up pixel-for-pixel with the real backdrop:

```
lensLayer.style.transform = `translate(${sourceRect.left - hostRect.left}px,
                                       ${sourceRect.top  - hostRect.top}px)`
lensLayer.style.width  = sourceRect.width  + 'px'
lensLayer.style.height = sourceRect.height + 'px'
lensLayer.style.filter = `url(#${filterId})`
```

Inside the surface's bounds the copy _is_ the backdrop, so the seam is invisible. The layer is
`aria-hidden`, `pointer-events: none`, and clipped to the surface radius.

**Where the copy comes from** is the one new question this engine introduces, and answering it
automatically is our main DX advantage over the prior art:

| `source`                      | Behaviour                                                                                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"auto"` (default)            | Walk ancestors to the nearest element with a painted `background-image` or non-transparent `background-color`. Replicate that paint on the lens layer as CSS. No DOM cloning, no observers on foreign subtrees. |
| `"none"`                      | Skip `lens`, fall to `frost`.                                                                                                                                                                                   |
| `HTMLElement` \| CSS selector | Clone that node into the lens layer, `aria-hidden`, and mirror it on mutation.                                                                                                                                  |
| `{ image: string }`           | Use an image or video URL directly.                                                                                                                                                                             |

`"auto"` covers the overwhelmingly common case (glass sitting over a gradient or photo page
background) with zero configuration and zero cloning, because a CSS background can be replicated
by copying computed values rather than nodes. Every prior-art project that achieves cross-browser
refraction makes this the user's problem.

**What `lens` cannot do, stated in the docs and not hidden:** it bends the resolved source only.
A card sitting between the source and the glass will not bend. In Chromium `backdrop` has no such
limit, so the same component can look slightly different across engines. That is a real
trade-off, and pretending otherwise would be the dishonest version of this library.

### `frost`

`backdrop-filter: blur() saturate()` plus tint, edge and specular, all of which are plain CSS.
Ships in Chrome 76, Safari 9 (`-webkit-`) and Firefox 103. This is also the server-rendered
state and the `prefers-reduced-transparency` state.

### Resolution ladder

```
engine === 'auto'
  ├─ prefers-reduced-transparency: reduce  → frost   (hard stop, no probing)
  ├─ forced-colors: active                 → none    (effect off entirely)
  ├─ supportsBackdropUrl()                 → backdrop
  ├─ supportsFilterUrl() && source resolves → lens
  └─ otherwise                             → frost
```

Resolved once per document, cached in a module-level singleton, exposed per instance through
`onEngineResolved`.

---

## 3. Feature detection, and why `CSS.supports` is not enough

Measured in Chrome, 2026-09-02:

```js
CSS.supports('backdrop-filter', 'url(#f)'); // true
CSS.supports('backdrop-filter', 'blur(5px) url(#f) saturate(1.5)'); // true
```

`url()` is valid `<filter-value-list>` grammar. `CSS.supports` answers a **parsing** question.
It returns `true` in engines that will never paint the result, so it cannot distinguish
Chromium from Safari here. There is also no way to read back a rendered `backdrop-filter`:
a filtered DOM element cannot be sampled into a canvas.

The brief asks for a real render probe rather than UA sniffing. A real render probe for this
specific capability does not exist. The options are UA string sniffing (what
`deepika-builds/liquid-glass` does) or a structured API. We take the structured one:

```ts
const isBlink = navigator.userAgentData?.brands?.some((b) => b.brand === 'Chromium') ?? false;
export const supportsBackdropUrl = () => isBlink && CSS.supports('backdrop-filter', 'blur(1px)');
```

`navigator.userAgentData` is User-Agent Client Hints: a typed, spec-defined object, not a string
to regex. Firefox and Safari do not implement it, so they return `undefined` and fall through to
`lens`. **The failure direction is correct**: an unknown engine degrades rather than breaks.

Under it sits the two-declaration CSS safety net, which needs no JS at all:

```css
.murano[data-engine='backdrop'] {
	backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturation));
	backdrop-filter: blur(var(--glass-blur)) url(var(--glass-filter))
		saturate(var(--glass-saturation));
}
```

A browser that rejects any value in a declaration drops that entire declaration and keeps the
one before it. If detection is ever wrong, the worst outcome is frost, never a broken box.

CI verifies the matrix in real WebKit, Gecko and Chromium via Playwright (Phase 6). The
detection code is one 12-line module precisely so it can be replaced when WebKit 245510 closes.

---

## 4. Layers

```
z  layer        contents                                     a11y
─────────────────────────────────────────────────────────────────────────────
0  backdrop     backdrop engine: nothing (the real page)      —
                lens engine: the resolved source copy         aria-hidden, inert
1  lens         filter: url(#f)  |  backdrop-filter: url(#f)  aria-hidden, no pointer
2  tint         colour + gradient, carries text contrast      aria-hidden, no pointer
3  specular     B-channel highlight, 1px inner edge, shadow   aria-hidden, no pointer
4  content      {@render children()}                          the real content
5  focus        focus-visible ring                            above everything
─────────────────────────────────────────────────────────────────────────────
```

Two amendments to the brief's list. Layer 0 is in the DOM under the `lens` engine (the brief
assumed it never is). And the focus ring is its own layer at the top rather than a property of
the content layer, because a ring drawn inside the content box gets visually swallowed by the
specular layer on light backgrounds.

`contain: layout paint style` and `isolation: isolate` on the host.

---

## 5. Public API

The brief's API in §6 is good and survives nearly unchanged. Four amendments, each argued.

### Kept as-is

Four levels (`<GlassCard>` → presets → full optics → headless `glass` attachment), the
`variant` / `intensity` / `tint` / `radius` / `interactive` token set, the full optics set
(`displacement`, `chromatic`, `edge`, `curvature`, `blur`, `saturation`, `specular`,
`fallback`), `engine` + `onEngineResolved`, the imperative `createGlass` core, and a mirror CSS
custom property for every prop.

### Amendment 1: add `source`

Required by §2. Without it the `lens` engine has nothing to refract.

```svelte
<GlassSurface source="auto" />
<!-- default -->
<GlassSurface source="#wallpaper" />
<GlassSurface source={{ image: '/bg.avif' }} />
<GlassSurface source="none" />
<!-- force frost -->
```

### Amendment 2: `specular.followPointer` defaults to `false`, and `interactive` turns it on

The brief shows `followPointer: true` inside a `specular` object while `interactive` separately
promises "elastic press + specular tracking". Two switches for one behaviour is a bug waiting to
be filed. `interactive` is the switch; `specular.followPointer` is the override.

### Amendment 3: `intensity` is a curve, not a multiplier, and it is documented as such

`intensity={0.8}` maps through a preset curve onto `displacement`, `blur`, `tintOpacity` and
`specular.intensity` simultaneously. Any explicitly passed prop wins over the curve. Without
that precedence rule, `intensity` and the level-3 props silently fight.

### Amendment 4: size budget restated

The brief asks for core < 8 KB gzip and full package < 25 KB gzip. Core ≤ 8 KB is achievable.
The 25 KB figure for roughly twenty components is not, at a realistic ~0.8 to 1.2 KB gzip per
compiled Svelte component on top of an 8 KB core. Since the package is tree-shakable, a single
number for the whole barrel is also the least useful thing to measure. Budgets enforced in CI:

| Entry                                                     | Budget     |
| --------------------------------------------------------- | ---------- |
| `murano/core` (`createGlass` + map + detect)              | 8 KB gzip  |
| Typical app import (core + `GlassSurface` + 4 components) | 14 KB gzip |
| Full barrel `murano`                                      | 28 KB gzip |

Tree-shaking is asserted by a test, not by a claim: importing `GlassButton` must not pull
`GlassModal` into the bundle.

---

## 6. SSR

No `document` or `window` at module scope. Map generation happens in `$effect` only.

The server renders `data-engine="frost"` with the fallback tint and blur already applied from
CSS custom properties, so the first paint is a finished-looking frosted surface. After
hydration the detector runs and upgrades the attribute to `backdrop` or `lens`. Because frost
and the real engines share the same tint, radius, edge and shadow, the upgrade adds refraction
without moving or resizing anything. No FOUC, no layout shift.

Filter ids come from `$props.id()`, which is stable across server and client.

The `<GlassFilterDefs />` element is rendered once per document by the first surface that
mounts, refcounted, and removed when the last unmounts.

---

## 7. Performance

Rules, with the mechanism that enforces each:

| Rule                                | Mechanism                                                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| One map per unique shape            | Module-level `Map` keyed `w×h:radius:edge:curvature:angle:dpr`, shared across instances                                                               |
| No regeneration on move             | Map depends on shape only; position is a `transform`                                                                                                  |
| No regeneration on squash           | `feColorMatrix` axis scaling around 0.5                                                                                                               |
| Resize does not thrash              | `ResizeObserver` debounced ~100 ms, plus a shape-equality guard before generating                                                                     |
| Interaction never re-renders Svelte | Pointer handlers write CSS custom properties inside `requestAnimationFrame`                                                                           |
| Compositing stays contained         | `contain: layout paint style`, `isolation: isolate`                                                                                                   |
| `will-change` is not permanent      | Set on pointer/focus enter, cleared on the transition-end after leave                                                                                 |
| Large surfaces do not melt the GPU  | Above ~800 px wide, warn in dev and taper `displacement`. A single stretched lens over a wide dock blooms into an oval; wide bars should use `frost`. |
| Chroma is not paid for when off     | `chromatic: 0` emits a one-pass filter graph, not three                                                                                               |
| WebKit keeps its expensive passes   | No supersampling in WebKit, shape-triggered regeneration only, filter id version-bumped per geometry change, specular sampled pre-composite           |

Measured in CI: twenty surfaces on screen, Playwright, fps and INP recorded per browser.

---

## 8. Accessibility

| Query                                  | Behaviour                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `prefers-reduced-transparency: reduce` | Engine forced to `frost`, opacity to ~0.95, refraction off. Matches what Apple's own Reduced Transparency does. |
| `prefers-reduced-motion: reduce`       | Elastic press, specular tracking and every spring disabled.                                                     |
| `prefers-contrast: more`               | Border strengthened, tint opacity raised, gradients removed.                                                    |
| `forced-colors: active`                | Effect off entirely, system colours through.                                                                    |

Every decorative layer is `aria-hidden="true"` with `pointer-events: none`. The focus ring is
its own top layer. Text over glass must reach 4.5:1 in both themes; a dev-mode check computes
the effective contrast from tint, tint opacity and the resolved backdrop luminance, and warns
when it falls short.

`docs/accessibility.md` carries a page on when **not** to use glass: long-form text, data
tables, dense forms, and anything over high-detail photography.

---

## 9. Repository

```
packages/murano/          the library
sites/docs/               SvelteKit + MDsveX docs and playground, built on the library
docs/                     research, architecture, optics, performance, accessibility
```

pnpm workspaces, Vite, `@sveltejs/package`, TypeScript strict, ESLint, Prettier, Vitest in
browser mode, Playwright across three engines, `size-limit`, Changesets, npm provenance.

Package name: `murano`, unscoped, verified available on the npm registry 2026-09-02, as are
`murano-glass`, `murano-svelte` and `@murano/glass` as fallbacks. MIT.
