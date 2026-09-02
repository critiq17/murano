# Contributing

## Setup

```bash
pnpm install
pnpm dev              # docs site with the library linked live
```

## Layout

```
packages/murano/src/lib/
  core/         engine detection, displacement map generator, filter builder, cache
  components/   GlassSurface and everything built on it
  actions/      the `glass` attachment
  styles/       tokens.css, base.css, themes
sites/docs/     SvelteKit + MDsveX, dogfoods the library
docs/           research, architecture, optics, performance, accessibility
```

## Before a PR

```bash
pnpm lint
pnpm check
pnpm test          # Vitest, browser mode, three engines
pnpm test:e2e      # Playwright, visual regression, three engines
pnpm size
```

A change that touches optics needs a visual-regression snapshot update in all three engines,
and the diff has to be reviewed by eye. Snapshots are not a formality here: a wrong `scale` sign
still produces a plausible-looking image.

## Rules

- **Zero runtime dependencies.** The only peer is `svelte@^5`. A PR adding a runtime dependency
  to the library package will be closed.
- **No `document` or `window` at module scope.** SSR safety is a test, not a convention.
- **Every prop gets a mirror CSS custom property.** Theming without a rebuild is a feature, not
  an accident.
- **Every decorative layer is `aria-hidden` and `pointer-events: none`.**
- **No per-frame Svelte reactivity.** Interaction writes custom properties in `rAF`.
- Changesets for anything user-visible: `pnpm changeset`.

## Adding a component

Every component is built on `GlassSurface`. It never reimplements the optics. It adds
structure, roles, keyboard behaviour and defaults, and it forwards `...restProps`.

Checklist: types exported, `bind:` where it makes sense, correct ARIA role, keyboard support,
focus-visible ring above the glass, a docs page with a live example, and a visual-regression
snapshot.
