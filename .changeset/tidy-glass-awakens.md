---
'murano': minor
---

Core optics and the `GlassSurface` primitive.

Three rendering engines behind one component, resolved at runtime: `backdrop` refracts the live
page in Chromium, `lens` refracts a copy of the resolved source and works in WebKit and Gecko,
and `frost` is the honest fallback everywhere. Accessibility preferences override an explicit
engine request, and an unsupported request degrades through the ladder rather than failing.

`source="auto"` resolves the refraction source from the nearest painted ancestor, so the
cross-browser lens needs no configuration.
