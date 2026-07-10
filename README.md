# enthusia-site

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/b32c17176ee24992b3ae8569e84ab3a1)](https://app.codacy.com/gh/wsg138/enthusia-site/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)

Static public site and Cloudflare Pages Functions for Enthusia.

## Local development

The public site has no runtime package dependencies. Serve `public/` with any static file server.

```bash
npm run check
npm run build
```

`npm run check` validates page metadata, duplicate IDs, and local asset references. `npm run build` copies the deployable site to `dist/`.

The original GitHub remote is treated as read-only in the Sites workspace. Production publishing for this copy uses the separate project recorded in `.openai/hosting.json`.
