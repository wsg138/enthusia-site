# Manually corrected cinematic mask review

These captures validate the authoritative `minecraft-occlusion-*-v2.png` repairs at the six review checkpoints. All frames use a 1440 × 900 Chrome viewport and the existing celestial paths and phase timing.

Each checkpoint includes:

- `final-glow`: corrected scene with the normal celestial glow;
- `final-no-glow`: corrected scene with disk shadow disabled for edge inspection;
- `before-after-split`: earlier review frame on the left and corrected scene on the right;
- `foreground`: corrected phase foreground by itself;
- `alpha`: final terrain alpha overlay;
- `disk-only`: physical celestial disk without foreground occlusion.

## Checkpoints

| Prefix | Progress | Target |
|---|---:|---|
| `progress-028` | 0.28 | Sun behind right trees |
| `progress-032` | 0.32 | Sun behind smaller tree |
| `progress-036` | 0.36 | Moon behind left tree |
| `progress-042` | 0.42 | Moon at upper-left mountain |
| `progress-045` | 0.45 | Mountain ridge with moon |
| `progress-068` | 0.68 | Moon behind right trees |

## Deterministic edge-color decontamination

The generator preserves the final alpha exactly. For foreground RGB only, fully opaque terrain pixels seed an eight-pixel propagation band. Each pass copies RGB from the previous pass in a fixed cardinal-then-diagonal neighbor order. This replaces sky-contaminated RGB beneath partial and nearby transparent edge pixels without expanding, thresholding, blurring, or otherwise changing alpha.

The four phase foregrounds use RGB from their matching day, sunset, night, and sunrise source images. Only their alpha channels are byte-identical.
