# Cinematic scene review

## Review state

- Repository: `https://github.com/wsg138/enthusia-site`
- Branch: `review/cinematic-occlusion`
- UI parent commit: `986349e` (`fix(ui): polish external navigation and page details`)
- Cinematic review commit: this document is tracked in the branch tip; use `git rev-parse HEAD` for the immutable full hash reported with the handoff.
- Restored cinematic asset state: `1a451f7` (`Unify mobile navigation color hierarchy`), with the already-accepted centered desktop starting X calculation and later return-navigation UI retained.
- Regressed commit retained for comparison: `8c72ccc` (`Repair celestial occlusion and add desktop return navigation`).
- Last experimental deployment before this review branch: Sites version 39, commit `8c72ccc6577052e46b1bcf5f1177333a09b236ea`.
- Scene coordinate system: `1672 × 941` pixels.
- Debug capture viewport override: `1440 × 900` CSS pixels. The browser backend's scrollbar/device scaling produced `1425 × 891` PNG files.

The branch deliberately does not make another terrain or foliage repair. It restores the less-damaged mask and records the remaining defects for external inspection.

## Render order

Actual back-to-front order in the homepage scene:

```text
Fixed world-effects container (z-index 0)
  → blurred edge-fill pseudo-elements (z-index 0)
  → crossfaded phase landscape images (runtime z-index 1–2)
  → CSS sun/moon inside .cinematic-celestial (z-index 4)
  → crossfaded phase foreground PNGs sharing terrain alpha (runtime z-index 6–7)
  → vignette (z-index 6; later DOM order when tied)
Homepage content and UI (.page-main / header / footer, z-index 2+ outside the scene)
```

The disabled `.cinematic-sky` element is not part of the active composition. Stars and the Milky Way are baked into `minecraft-night-valley-v3.png`; there is no separate star asset.

## Active assets

All active landscape, mask, and phase assets use the same `1672 × 941` intrinsic dimensions.

| Path | Dimensions | Mode | Purpose |
|---|---:|---|---|
| `public/assets/minecraft-day-valley-v1.png` | 1672×941 | RGB | Original/current daytime landscape and mask source |
| `public/assets/minecraft-sunset-right-v1.png` | 1672×941 | RGB | Active sunset phase |
| `public/assets/minecraft-night-valley-v3.png` | 1672×941 | RGB | Active night phase, including stars/Milky Way |
| `public/assets/minecraft-sunrise-left-v1.png` | 1672×941 | RGB | Active sunrise phase |
| `public/assets/minecraft-terrain-foreground-v1.png` | 1672×941 | RGBA | Established base foreground alpha used by the generator |
| `public/assets/minecraft-terrain-mask-v1.png` | 1672×941 | RGBA | Final shared terrain mask; white RGB, alpha carries solidity |
| `public/assets/minecraft-sky-mask-v1.png` | 1672×941 | RGBA | Inverse of final terrain alpha |
| `public/assets/minecraft-terrain-foreground-day-v1.png` | 1672×941 | RGBA | Day RGB with shared terrain alpha |
| `public/assets/minecraft-terrain-foreground-sunset-v1.png` | 1672×941 | RGBA | Sunset RGB with shared terrain alpha |
| `public/assets/minecraft-terrain-foreground-night-v1.png` | 1672×941 | RGBA | Night RGB with shared terrain alpha |
| `public/assets/minecraft-terrain-foreground-sunrise-v1.png` | 1672×941 | RGBA | Sunrise RGB with shared terrain alpha |
| `public/assets/minecraft-day-sun-v1.png` | 1672×941 | RGB | Earlier day-with-sun source, retained for review; not active |
| `public/assets/minecraft-sunset-sun-v1.png` | 1672×941 | RGB | Earlier sunset-with-sun source, retained; not active |
| `public/assets/minecraft-sunrise-sun-v1.png` | 1672×941 | RGB | Earlier sunrise-with-sun source, retained; not active |
| `public/assets/minecraft-night-valley-v1.png` | 1672×941 | RGB | Earlier night source, retained; not active |
| `public/assets/minecraft-night-valley-v2.png` | 1672×941 | RGB | Earlier night source, retained; not active |
| `public/assets/minecraft-golden-valley-v1.png` | 1672×941 | RGB | Earlier color study, retained; not active |
| `public/assets/minecraft-golden-valley-v2.png` | 1672×941 | RGB | Earlier color study, retained; not active |
| `public/assets/minecraft-golden-valley-v3.png` | 1672×941 | RGB | Earlier color study, retained; not active |
| `public/assets/minecraft-valley-v2.png` | 1672×941 | RGB | Earlier landscape source, retained; not active |

The sun and moon are CSS-rendered in `public/assets/styles.css`; there are no raster sun, moon, or separate glow files. Each disk is a 132×132 CSS box using gradients, a 10px border, and box shadows. Mobile uses the same landscape assets and camera transform; there is no separate mobile background asset. The physical sun element is explicitly hidden for the portrait mobile camera.

## Archived regression-only assets

These files came from `8c72ccc`, are preserved for comparison, and are **not referenced by the restored runtime**:

| Path | Dimensions | Purpose in regressed commit |
|---|---:|---|
| `docs/cinematic-review/assets/regression/minecraft-occlusion-add-v1.png` | 1672×941 | Manual opacity additions that created the hard/pale mountain edge |
| `docs/cinematic-review/assets/regression/minecraft-occlusion-subtract-v1.png` | 1672×941 | Empty subtraction overlay in that pass |
| `docs/cinematic-review/assets/regression/minecraft-foliage-light-mask-v1.png` | 1672×941 | Above-terrain foliage-light mask from the regressed pass |

No repair-add, repair-subtract, or foliage-light overlay is active after restoration.

## SHA-256 hashes

Hashes are of complete PNG files, not decoded pixels.

| File | SHA-256 |
|---|---|
| `minecraft-terrain-mask-v1.png` | `7f8d949fd3e76c06be08dc3161fb564235a3cdcc7e6695dd4793422ae252dd26` |
| `minecraft-sky-mask-v1.png` | `912163db5533f11270d27cc3b4be60fb1796e66b631afddc3e199863cc9b00ec` |
| `minecraft-terrain-foreground-v1.png` | `d10121a9be75d5449dd2d1171e2de92c79272f50856e73f9784e2746f0cd0699` |
| `minecraft-terrain-foreground-day-v1.png` | `f684d1e997658a174da3fac83f9e6c83cecd3d328bf9aa9f938f2eed6a495872` |
| `minecraft-terrain-foreground-sunset-v1.png` | `43bacad2239bb347c4d00bec03535029f73bdeedcb7e1f293aacb346252d67db` |
| `minecraft-terrain-foreground-night-v1.png` | `568aef28998c7ada42fffa1101bdeec2649d06f81ba05ac218683aa834b82b8d` |
| `minecraft-terrain-foreground-sunrise-v1.png` | `380791a70cf60bc2811628ffdffac21080608cdf0ca0551feaaabc01ca533504` |
| archived `minecraft-occlusion-add-v1.png` | `e2a50eaafd28c3027202316f61576a0c6837beb493298eb6cff2b7234d8a0fb9` |
| archived `minecraft-occlusion-subtract-v1.png` | `7cff2af858dec1deb7a501f1222d9b1c33af0726659cb5d4af9a897bff489028` |
| archived `minecraft-foliage-light-mask-v1.png` | `13cd0dc9161787296a2b0ff1b03095b0557f69cefa0e30d85e61e5f9e6847fec` |

## Terrain alpha construction

`scripts/generate-terrain-mask.py` is the existing generator restored from `1a451f7`. It was **not run during this restoration**. Its reproducible command is:

```powershell
python scripts/generate-terrain-mask.py
```

The generator starts from the alpha channel of `minecraft-terrain-foreground-v1.png`, performs two localized morphological closes, reopens only selected pixels that were already transparent in the established source alpha, then applies a `GaussianBlur(0.65)` to form `soft_alpha`. It writes:

- white RGB + `soft_alpha` to `minecraft-terrain-mask-v1.png`;
- white RGB + `255 - soft_alpha` to `minecraft-sky-mask-v1.png`;
- each phase image's RGB + the identical `soft_alpha` to every phase foreground.

Therefore opaque/white mask pixels mean solid terrain; transparent pixels mean sky. Alpha is inverted only for the sky-mask output. No active CSS luminance mask, SVG mask, canvas composite operation, or clip-path determines terrain solidity. The active foreground PNG alpha itself occludes the CSS celestial disks.

The four phase foreground alpha channels must remain byte-identical. RGB changes between phases; alpha must not.

## Scaling and camera

Implementation: `initWorldEffects()` in `public/assets/script.js`.

- Desktop/non-portrait scale: `sceneScale = viewportHeight / 941`.
- Desktop origin: centered in both axes: `((viewportWidth - 1672×scale)/2, (viewportHeight - 941×scale)/2)`.
- Portrait mobile condition: `innerWidth <= 620 && innerHeight > innerWidth`.
- Mobile scale: `clamp((viewportWidth / 1672) × 2.05, 0.43, 0.56)`.
- Mobile origin: horizontally centered and bottom aligned: `((viewportWidth - 1672×scale)/2, viewportHeight - 941×scale)`.
- The same transform is applied to background phases, celestial elements, and phase foregrounds. No mask is scaled independently.
- Browser image interpolation handles scaled PNGs; the code sets no custom image-rendering mode.
- At aspect ratios wider than `2/1`, the whole scene receives a horizontal linear-gradient mask fading the outer 4% on each side. This is an edge treatment, not terrain alpha.

## Scroll phases and celestial paths

Normalized progress is `scrollY / (documentElement.scrollHeight - innerHeight)`, clamped to `[0,1]`. `celestial-test.html?phase=N` overrides it through `body.dataset.celestialProgress`.

Phase ranges:

| Progress | Background/foreground transition |
|---:|---|
| `0.00–0.28` | day → sunset; eased subrange begins at `0.06` |
| `0.28–0.40` | sunset → night |
| `0.40–0.66` | night hold |
| `0.66–0.82` | night → sunrise |
| `0.82–1.00` | sunrise → day |

Transitions use `smooth(t) = t²(3−2t)`. The outgoing phase stays at opacity `1`; the incoming phase opacity is the eased amount. Runtime z-indices place the incoming image one level above the outgoing image.

Sun path:

- Start: rendered center of `.cinematic-logo`, converted to scene coordinates after scaling.
- Desktop end: `(0.88×1672, 0.69×941)`.
- Desktop controls: `A=(max(startX+210,0.52×1672), max(68,startY−190))`; `B=(0.73×1672,0.08×941)`.
- Path: cubic Bézier evaluated at `smooth(clamp(progress/0.34,0,1))`.
- Visible on desktop through progress `0.38`.
- On portrait mobile, the physical sun is never positioned or rendered; `sun.hidden=true` and its transform is cleared.

Moon path:

- Desktop start/end: `(0.08×1672,0.66×941)` → `(0.92×1672,0.69×941)`.
- Desktop controls: `(0.24×1672,0.06×941)` and `(0.68×1672,0.06×941)`.
- Mobile start/end: `(470,610)` → `(1200,585)` with control points derived from viewport coordinates `(24% width,16% height)` and `(70% width,12% height)` converted into scene coordinates.
- Path: cubic Bézier evaluated at `smooth(clamp((progress−0.29)/0.47,0,1))`.
- Visible from progress `0.27` through `0.78`.

## CSS compositing details

- Phase images and foregrounds: opacity crossfades; no blend mode or filter on the images during normal rendering.
- Edge-fill pseudo-elements: `filter: blur(18px) brightness(.82) saturate(.92)`, opacity up to `.88`, scaled to `1.035`.
- Sun disk: CSS gradients, `10px` pale border, two warm box shadows. Idle-only animation changes `translateY`, `rotate`, and `brightness` while at the top and motion is allowed.
- Moon disk: CSS gradients, `10px` pale border, two cool box shadows.
- `.cinematic-sky`: `mix-blend-mode: normal`, but `display:none`.
- Vignette: transparent dark vertical gradient at z-index 6.
- Main UI panels use backdrop blur independently of the terrain/celestial composition.
- Restored runtime has no foliage-light layer and no above-terrain sun/moon layer.

## Source ownership map

| Concern | Source |
|---|---|
| Main cinematic container and DOM construction | `public/assets/script.js`, `initWorldEffects()` |
| Scroll progress and phase selection | `public/assets/script.js`, `render()` inside `initWorldEffects()` |
| Sun path | `public/assets/script.js`, `cubicPoint()` and sun block in `render()` |
| Moon path | `public/assets/script.js`, moon block in `render()` |
| Scene scaling/camera | `public/assets/script.js`, `measureScene()` |
| Foreground phase blending | `public/assets/script.js`, `setTransition()` and phase branches |
| Terrain alpha generation | `scripts/generate-terrain-mask.py` |
| Terrain mask/foreground rendering | `public/assets/styles.css` `.cinematic-foreground`; phase PNG alpha |
| Celestial disks and glow | `public/assets/styles.css` `.cinematic-orb*`, `.cinematic-sun`, `.cinematic-moon` |
| Foliage lighting | Not active; archived regression mask is under `docs/cinematic-review/assets/regression/` |
| Mobile sun suppression | `public/assets/script.js`, `if (mobileCamera) { sun.hidden = true; … }` |
| Debug mode | `public/celestial-test.html`, query parameters, and the debug block in `public/assets/script.js`/`styles.css` |

## Debug exports

All captures use a `1440 × 900` CSS viewport override and export at `1425 × 891` pixels in the test browser. Approximate fixed progress values:

| Moment | Progress | Files |
|---|---:|---|
| Sun behind right trees | `.28` | `debug/sun-right-trees-{normal,alpha,disk-only,foreground}.png` |
| Sun behind smaller tree | `.32` | `debug/sun-small-tree-{normal,alpha,disk-only,foreground}.png` |
| Moon behind left tree | `.36` | `debug/moon-left-tree-{normal,alpha,disk-only,foreground}.png` |
| Moon behind right trees | `.68` | `debug/moon-right-trees-{normal,alpha,disk-only,foreground}.png` |
| Moon at upper-left mountain | `.42` | `debug/moon-upper-left-mountain-{normal,alpha,disk-only,foreground}.png` |
| Mountain ridge without moon crossing | `.24` | `debug/mountain-ridge-no-moon-{normal,alpha,disk-only,foreground}.png` |
| Mountain ridge with moon crossing | `.45` | `debug/mountain-ridge-with-moon-{normal,alpha,disk-only,foreground}.png` |

`alpha` uses the final shared terrain mask as a high-contrast magenta overlay. `disk-only` disables the CSS box shadow and hides foreground occlusion for inspection. `foreground` hides the background/celestial layers and displays the normal phase-foreground crossfade over a neutral dark field. The archived repair PNGs listed above are the repair layers themselves; they are inactive and therefore are not composited into the restored debug frames.

## Known defects and restoration rationale

- Some solid foliage pixels still have incorrect alpha, allowing the sun or moon to replace parts of trees.
- The moon can expose inconsistent tree pixels and holes near the upper-left mountain.
- Celestial disks are geometric CSS squares by design and can make mask defects especially obvious.
- The regressed `8c72ccc` addition polygon filled a broad upper-left mountain area and blurred that new boundary into the final alpha, creating the pale-blue/hard-edged ridge. It also added branch rectangles and a foliage-light overlay without resolving the core foliage silhouette.
- This branch restores the masks, phase foregrounds, generator, and runtime composition from `1a451f7`; it does not attempt a new segmentation, threshold, fill, morphology, blur, or path adjustment.

External review should treat `minecraft-terrain-foreground-v1.png` and the restored final mask as the baseline, compare all four phase alpha channels, and use the archived regression overlays only as evidence of the failed approach—not as proposed fixes.
