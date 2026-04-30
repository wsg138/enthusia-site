Home page screenshots are controlled by:
`public/assets/site-config.js`

To add or change screenshots later:
1. Put your original image file in this folder.
2. Open `public/assets/site-config.js`.
3. Create an optimized main image and thumbnail version if you want the best load speed.
4. Edit the `home.screenshots` list.
4. For each image, set:
   - `src`: main slideshow image, for example `assets/screenshots/spawn-01.webp`
   - `thumb`: thumbnail image, for example `assets/screenshots/spawn-01-thumb.webp`
   - `alt`: short description of the image
   - `label`: short caption shown in the slideshow

Example:
{
  src: "assets/screenshots/spawn-01.webp",
  thumb: "assets/screenshots/spawn-01-thumb.webp",
  alt: "Screenshot of the server spawn.",
  label: "Spawn"
}

Staff members are also edited in `public/assets/site-config.js` under `home.staff`.
Each staff entry uses:
- `name`: display name shown on the site
- `username`: Minecraft username used for the skin/head image and profile link
- `role`: role badge text

Example:
{ name: "Fain", username: "FainNeito", role: "Founder" }
