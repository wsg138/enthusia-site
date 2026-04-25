Home page screenshots are controlled by:
`public/assets/site-config.js`

To add or change screenshots later:
1. Put your image file in this folder.
2. Open `public/assets/site-config.js`.
3. Edit the `home.screenshots` list.
4. For each image, set:
   - `src`: file path, for example `assets/screenshots/spawn-01.png`
   - `alt`: short description of the image
   - `label`: short caption shown in the slideshow

Example:
{
  src: "assets/screenshots/spawn-01.png",
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
