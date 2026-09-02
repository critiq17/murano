# Accessibility

Glass is a material that reduces contrast by design. Treating accessibility as a mode to switch
on is how you ship an unreadable interface. It is a constraint on the default.

## Media queries

| Query                                  | Behaviour                                                                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prefers-reduced-transparency: reduce` | Engine forced to `frost`, backing opacity ~0.95, refraction off. This mirrors what Apple's own Reduced Transparency setting does: the material gets frostier and hides more of what is behind it. |
| `prefers-reduced-motion: reduce`       | Elastic press, specular pointer tracking and every spring disabled. Transitions collapse to opacity only.                                                                                         |
| `prefers-contrast: more`               | Border strengthened to a solid 1px, tint opacity raised, decorative gradients removed.                                                                                                            |
| `forced-colors: active`                | Effect off entirely. `forced-color-adjust: auto`, system colours through, borders from `CanvasText`.                                                                                              |

These are handled in CSS, so they apply before hydration and on the server-rendered output.

## Contrast

Text over glass must reach **4.5:1** in both themes. The tint layer exists for that reason
first and for looks second.

In dev, Murano computes the effective contrast from tint colour, tint opacity and the resolved
backdrop luminance, and warns when it falls short:

```
[murano] GlassCard: text contrast ≈ 3.1:1 against the resolved backdrop.
         Raise --glass-tint-opacity to ~0.24 or set variant="regular".
```

`variant="clear"` is the low-tint Apple variant. It is correct over uniform, low-detail
backdrops and wrong over photography. The warning fires either way.

## Structure

- Every decorative layer (`backdrop`, `lens`, `tint`, `specular`) is `aria-hidden="true"` with
  `pointer-events: none`.
- Under the `lens` engine the backdrop copy is also `inert`, so a cloned source cannot put
  duplicate focusable nodes in the tab order or duplicate text in the accessibility tree.
- The focus ring is its own layer above the specular layer. A ring drawn inside the content box
  gets visually swallowed by the highlight on light backdrops.
- Components carry real roles and keyboard behaviour: `GlassModal` traps focus and restores it,
  `GlassTabs` implements the tabs pattern with arrow keys, `GlassToggle` is a real `switch`.

## When not to use glass

The honest list. Every item here is a case where the material actively costs the user.

- **Long-form reading.** Body text over a moving, low-contrast backdrop is fatiguing at any
  contrast ratio that still looks like glass.
- **Data tables.** Row scanning depends on stable, high-contrast edges. Refraction at the rim
  works against exactly that.
- **Dense forms.** Input affordances need unambiguous boundaries. A translucent field over a
  varying backdrop has none.
- **Over high-detail photography.** The backdrop's own contrast swamps the material. This is the
  most common misuse, and it is the one that looks best in a screenshot and worst in use.
- **Anything that must be readable in sunlight**, or on a display whose calibration you do not
  control.

Glass belongs on chrome, not on content: navigation, docks, toolbars, controls over media,
transient surfaces like popovers and notifications. That is where Apple uses it, and the
reasoning in the [HIG Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
page is the same one.
