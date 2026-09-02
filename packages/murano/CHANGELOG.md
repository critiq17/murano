# murano

## 0.1.0

### Minor Changes

- [`e4a4e54`](https://github.com/critiq17/murano/commit/e4a4e54150536915b55e1992f0c59c005043bcd8) Thanks [@critiq17](https://github.com/critiq17)! - Core optics and the `GlassSurface` primitive.

  Three rendering engines behind one component, resolved at runtime: `backdrop` refracts the live
  page in Chromium, `lens` refracts a copy of the resolved source and works in WebKit and Gecko,
  and `frost` is the honest fallback everywhere. Accessibility preferences override an explicit
  engine request, and an unsupported request degrades through the ladder rather than failing.

  `source="auto"` resolves the refraction source from the nearest painted ancestor, so the
  cross-browser lens needs no configuration.
