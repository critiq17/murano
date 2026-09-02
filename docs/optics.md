# Optics

How the displacement map is built and what each parameter physically means.
Read [research/prior-art.md](./research/prior-art.md) first for where these techniques come from.

---

## 1. What `feDisplacementMap` does

```xml
<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" scale="S"/>
```

For every output pixel at `(x, y)`, it samples the **map** at `(x, y)`, reads two channels, and
fetches the source pixel from a shifted position:

```
dx = S * (map.R / 255 - 0.5)
dy = S * (map.G / 255 - 0.5)
out(x, y) = in(x + dx, y + dy)
```

So `128` (0.5) in a channel means no shift. `255` shifts by `+S/2` px, `0` by `−S/2` px.
`scale` is in user-space pixels and is the only thing that carries physical magnitude.

### Sign of `scale`

The output pixel is _fetched from_ the offset position, so the image appears to move the
**opposite** way from the map vector.

- `scale > 0`: the rim pushes the image outward from the centre. Fish-eye, pinch, the edges
  look like they recede.
- `scale < 0`: the rim pulls the image inward. Magnifying lens, the edges bulge toward you.

**Apple's Liquid Glass is the magnifying case. `scale` must be negative.** If your map is
correct but the bend looks inverted or like a black hole, you have the sign wrong. Our
`displacement` prop keeps the raw sign, default `-112`.

---

## 2. The map must be a signed distance field, not a gradient

A plain linear gradient as the map shifts every pixel of the element by nearly the same vector.
That is a uniform shear, and it looks like a rendering glitch. This is the single most common
failure in published implementations, common enough that one of them ships it as a labelled
`linear` mode purely so you can see what wrong looks like.

Real glass only bends light where its surface is curved. A flat slab transmits the image
undistorted; the bevelled or domed rim is where refraction happens. So the map has to know the
element's **shape**.

### Rounded-rect SDF, closed form

For a box of size `w × h` with corner radius `r`, centre `(cx, cy)`:

```
qx = |x − cx| − (cx − r)
qy = |y − cy| − (cy − r)
sdf = ‖max(q, 0)‖₂ + min(max(qx, qy), 0) − r
```

Negative inside, zero on the border, positive outside. It is exact, branch-light, and cheap
enough to run per pixel.

### Direction: the gradient of the SDF is the outward normal

```
gx = sdf(x+1, y) − sdf(x−1, y)
gy = sdf(x, y+1) − sdf(x, y−1)
n  = (gx, gy) / ‖(gx, gy)‖
```

Near the top edge `n` points up. Near a rounded corner it points diagonally out of that corner.
That directionality is what makes the corners read as glass rather than as a smear.

### Magnitude: the rim band

`depth` (the brief calls it `edge`) sets how far the bend reaches inward, as a fraction of
`min(w, h)`:

```
edgeDist = clamp(−sdf, 0, ∞)          // px inward from the border
factor   = 1 − smoothstep(0, rim, edgeDist)
```

`factor` is 1 at the border and falls to 0 at `rim` px inward. The centre is untouched, which
is the point.

### Encoding

```
R = 128 + nx * factor * 127
G = 128 + ny * factor * 127
B = specular mask                      // see §5
A = 255
```

Outside the shape (`sdf ≥ 0`) write flat `128, 128, 128` so nothing outside the silhouette
displaces.

---

## 3. Curvature: from bevel to dome

`factor` above gives a bevelled edge with a flat centre. A real liquid bead is a **spherical
cap**, and that changes the profile across the whole surface.

For a cap of chord half-width `a` and height `h`, the sphere radius is

```
R = (a² + h²) / 2h
```

and the surface slope at distance `x` from the centre is

```
g(x) = x / √(R² − x²)
```

which is the actual refraction magnitude of a spherical surface, not an approximation.

Normalize so the average displacement lands at 0.5. The mean has a closed form, so no numeric
quadrature is needed:

```
∫₀ᴴ x/√(R²−x²) dx = R − √(R² − H²)
mean = (R − √(R² − H²)) / H
k    = 0.5 / mean
```

`curvature` is a 0..1 fraction: `capHeight = curvature * min(w, h) / 2`. At 0 the surface is a
flat window with a bevelled rim; at 1 it is a full hemisphere and the centre magnifies hard.

**Curvature is gated by `edge`.** The dome only contributes where the rim band reaches, so a
thin `edge` keeps the centre optically neutral no matter how high `curvature` goes. A thin-rim
control (a slider track) pairs low `edge` with high `curvature`; a magnifier pairs high `edge`
with high `curvature`.

### Edge feather

Hard `smoothstep` termination shows a visible contour ring. Use an error function instead:

```
erf(x) ≈ tanh(√π · x)
```

Monotone, smooth, one `tanh` call. The feather width spans the rim band, and `1/√2` absorbs the
erf scale so the falloff lands where you expect.

---

## 4. Chromatic aberration

Glass has a different refractive index per wavelength, so a real lens splits colour at high
contrast edges. Three passes, one per channel, at staggered `scale`:

```xml
<feDisplacementMap in="SourceGraphic" in2="map" scale="S + 0"        result="dR"/>
<feColorMatrix in="dR" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="R"/>

<feDisplacementMap in="SourceGraphic" in2="map" scale="S + c"        result="dG"/>
<feColorMatrix in="dG" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="G"/>

<feDisplacementMap in="SourceGraphic" in2="map" scale="S + 2c"       result="dB"/>
<feColorMatrix in="dB" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="B"/>

<feBlend in="R"  in2="G" mode="screen" result="RG"/>
<feBlend in="RG" in2="B" mode="screen"/>
```

Each `feColorMatrix` zeroes every channel but one, so `screen` recombination adds them without
double-counting: screening against black is identity on the other channels.

`chromatic` is `c`. Values around 4 to 8 read as glass. Above ~16 it reads as a broken display.
`chromatic: 0` collapses the graph to a single pass, which we do at build time rather than
paying for three passes that produce the same pixels.

Physical ordering note: shorter wavelengths refract more, so blue should get the largest
magnitude. With a negative `S`, `S + 2c` is the smallest magnitude, which inverts the physics.
We stagger as `[S − c, S, S + c]` applied to `[B, G, R]` so blue bends hardest. It is a small
difference and most implementations get it backwards.

---

## 5. Specular in the blue channel

The map's B channel is unused by displacement (we select R and G). Rather than pay for an
`feSpecularLighting` pass with its own light source and normal map, encode the highlight
directly:

```
B = 128 + 127 * specularMask     // 128 = none, 255 = full
```

The mask combines a directional edge sheen (a band hugging the rim, pooled toward `sheenAngle`)
and a soft all-around inner glow. Lift it out of the filter result with an `feColorMatrix` that
routes B into a white alpha, and composite over the refracted image.

One texture, one generation pass, refraction and lighting both. This is the single biggest
performance idea in the whole design, and it comes from `samasante/liquid-glass`.

---

## 6. Filter region and alignment, the two failures that kill the effect

### Filter region

A filter's processing area defaults to `x="-10%" y="-10%" width="120%" height="120%"` around
the element. At `displacement: -112` pixels are pulled from up to 56 px outside the box. On a
48 px tall element, 10% is 4.8 px. Everything beyond gets clipped and the edges go transparent.
The effect appears to die at exactly the settings where it should look best.

Compute the region from the displacement:

```
pad    = max(|displacement| * 0.5 + |chromatic|, 20)      // px, floored so it never collapses
region = { x: -pad, y: -pad, width: w + 2*pad, height: h + 2*pad }   // then expressed as %
```

The 20 px floor matters: on a small element a percentage-derived region can round to nothing.

### Alignment

Having widened the region, `feImage` with `preserveAspectRatio="none"` stretches the map across
the **whole region**, not across the element. The map's rim now sits `pad` px outside the
element's rim and the bend happens in the wrong place.

Fix: **draw the canvas at full region size**, `(w + 2*pad) × (h + 2*pad)`, with the rounded-rect
shape inset by `pad` and neutral grey `128,128,128` filling the padding. The map and the region
are the same box by construction, so nothing can drift.

### Do not use `display: none` on the defs SVG

Filters inside a `display: none` subtree do not apply. Use:

```css
position: absolute;
width: 0;
height: 0;
overflow: hidden;
```

### Shadow DOM

`url(#id)` resolves against the element's own tree scope. A filter defined in the light DOM is
not reachable from inside a shadow root, and vice versa. The defs SVG must live in the same
tree as the surface.

### `color-interpolation-filters`

Default is `linearRGB`. Every implementation here sets `sRGB` on the `<filter>`. Without it the
displacement is correct but the chromatic recombination and the specular lift both shift
brightness, and tints come out wrong.

---

## 7. Generation cost and caching

The map is a pure function of shape, not of position:

```
key = `${w}×${h}:${radius}:${edge}:${curvature}:${sheenAngle}:${dpr}`
```

Moving an element does not change the map. Resizing does. Cache by that key in a module-level
`Map` shared across every instance on the page, so twenty cards of the same size generate one
texture.

Two optimizations make regeneration cheap enough to run inside a resize:

- **Quadrant mirroring.** Compute the top-left quadrant only; write the other three by
  reflecting the signs of `dx` and `dy`. Four times less work.
- **Per-column dome LUT.** `g(x)` depends only on the column, so compute `size/2` values once
  per shape and index them in the inner loop.

Live squash and stretch do not need a new map. `feColorMatrix` can scale the map's axes around
0.5 before it reaches `feDisplacementMap`:

```
values = `${sx} 0 0 0 ${0.5*(1-sx)}   0 ${sy} 0 0 ${0.5*(1-sy)}   0 0 1 0 0   0 0 0 1 0`
```

That is how an elastic press animates at 60 fps without touching the canvas.

---

## 8. Parameter reference

| Parameter            | Symbol | Range    | Meaning                                                     |
| -------------------- | ------ | -------- | ----------------------------------------------------------- |
| `displacement`       | `S`    | −200..0  | `feDisplacementMap` scale, px. Negative magnifies.          |
| `chromatic`          | `c`    | 0..16    | Per-channel scale stagger. 0 collapses to one pass.         |
| `edge`               | `rim`  | 0.01..1  | Rim band width as a fraction of `min(w,h)`.                 |
| `curvature`          | `h/a`  | 0..1     | Spherical cap height as a fraction of the half-extent.      |
| `blur`               |        | 0..20 px | Frost applied to the backdrop before displacement.          |
| `saturation`         |        | 0..3     | Backdrop saturation. Apple's veil is slightly _under_ 1.    |
| `specular.angle`     |        | 0..360°  | Where the sheen pools. 0 is left, 135 is the Apple default. |
| `specular.intensity` |        | 0..1     | Gain on the B-channel mask.                                 |

Two defaults worth stating: `displacement: -112`, `edge: 0.07`, `chromatic: 6`, `curvature: 12`
is the shape most published implementations converge on, and it is a reasonable place to start.
