# Performance

Budgets, mechanisms and the measurements that enforce them. Optics background in
[optics.md](./optics.md).

## Budgets

| Entry                                | Budget       | Enforced by            |
| ------------------------------------ | ------------ | ---------------------- |
| `murano/core`                        | 8 KB gzip    | `size-limit` in CI     |
| Core + `GlassSurface` + 4 components | 14 KB gzip   | `size-limit` in CI     |
| Full barrel                          | 28 KB gzip   | `size-limit` in CI     |
| 20 surfaces on screen                | 60 fps       | Playwright, per engine |
| Interaction                          | INP < 200 ms | Playwright, per engine |

The barrel number is the least meaningful of the three. The package is tree-shakable and a real
app imports a handful of components, which is what the middle row measures. A test asserts that
importing `GlassButton` does not pull `GlassModal` into the bundle.

## The cost model

An SVG filter costs roughly **area × passes**, and it costs it on the GPU during compositing.
It does not scale with the complexity of the filter graph, so three chroma passes are cheap next
to the blur they sit beside. What is expensive is a large surface, and what is catastrophic is
regenerating the map.

That gives three rules in priority order:

1. Never regenerate the map when you do not have to.
2. Keep surfaces content-sized.
3. Never let per-frame work reach Svelte's reactivity.

## 1. Map caching

The map is a pure function of shape:

```
key = `${w}×${h}:${radius}:${edge}:${curvature}:${sheenAngle}:${dpr}`
```

Cached in a module-level `Map` shared by every instance on the page. Twenty cards of the same
size generate one texture and share it.

- **Moving does not regenerate.** Position is a `transform`. The map does not depend on it.
- **Squash and stretch do not regenerate.** An `feColorMatrix` scales the map's axes around 0.5
  before `feDisplacementMap` reads it, so an elastic press animates without touching canvas.
- **Resize regenerates once.** `ResizeObserver` debounced ~100 ms, with a shape-equality guard
  in front of the generator so a debounce that fires on an unchanged shape costs nothing.

Generation itself is made cheap by quadrant mirroring (compute the top-left quadrant, reflect
the signs for the other three) and a per-column dome LUT.

## 2. Surface size

Filter cost scales with area. Above roughly 800 px wide:

- dev-mode warning,
- `displacement` tapers automatically.

A single stretched displacement lens across a wide dock also blooms into an oval, because one
rounded-rect SDF over a 6:1 box has no good rim. Wide bars should use `frost`, and the docs say
so rather than shipping a bad default.

## 3. Per-frame work

Pointer tracking and elastic press write CSS custom properties from inside
`requestAnimationFrame`:

```ts
el.style.setProperty('--glass-specular-x', x.toFixed(3));
```

No `$state` write, no component re-render, no diff. Svelte only ever sees the props.

`will-change: transform, filter` is set on pointer or focus enter and cleared on the
`transitionend` after leave. A permanent `will-change` promotes every surface to its own layer
and costs memory on pages with many of them.

`contain: layout paint style` and `isolation: isolate` on the host keep the compositing scope
bounded and the stacking context correct.

## 4. Filter graph

- `chromatic: 0` emits a single `feDisplacementMap`, not three passes plus two `feBlend`s.
- `color-interpolation-filters="sRGB"` on the filter, always. The default `linearRGB` costs
  conversions and shifts the chroma recombination.
- The filter region is computed, not guessed. See [optics.md §6](./optics.md).

## 5. WebKit specifics

Safari drops the expensive passes silently rather than failing loudly, so it needs four
behaviours the other engines do not:

| Rule                                           | Why                                                                                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| No supersampling in WebKit                     | A 2x source crosses WebKit's source-graphic size ceiling; past it the chroma and specular passes are dropped while the core bend survives |
| Regenerate on shape change only                | An `feImage` href churning mid-drag makes WebKit throttle, and the shine vanishes until motion stops                                      |
| Version-bump the filter id per geometry change | WebKit caches filter output by id; without the bump the lens freezes                                                                      |
| Sample specular pre-composite                  | WebKit's `feComposite` ordering differs from Blink's                                                                                      |

All four come from `samasante/liquid-glass`, which verified them against real WebKit.

## Measurement

Playwright, three engines, on every PR:

- `bench/twenty-surfaces` renders 20 surfaces over a scrolling photo background and records fps.
- Visual regression snapshots per engine, `maxDiffPixelRatio: 0.01`.
- `size-limit` fails the build on a regression.
