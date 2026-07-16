Minecraft Java Edition banner cloth masks used by `assets/guild-banner-renderer.js`.

Each PNG is a self-hosted monochrome entity-banner texture from the same vanilla asset set used by the Market item renderer. The shared canvas renderer crops the 20×40 cloth face, preserves mask shading with multiply compositing, and applies the API's ordered dye layers without contacting a third-party service.

`base.png` is the cloth mask; every other PNG maps directly to a normalized Java banner pattern key. Do not replace these masks with SVG approximations or use them as a pointed pennant.
