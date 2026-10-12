# Hall background replacement

Requirement: every public background using the brown lectern hall shown in the user's screenshot must use the exact supplied purple council-hall image instead. Preserve text, controls, overlays, cropping, and the Christmas publication boundary.

Spec/proof: current canonical main remains cdcd8aa. The ongoing removal base is ad22f59, with production at 01d2d9b. Source inspection and visual inspection identify assets/design/a9386f825341.jpg as the old hall, referenced by 13 public HTML backgrounds. No project-local EARS or SPEAR state helpers exist; evidence is recorded manually. This is a reversible static presentation change; behavioral regression tests are unnecessary.

Implementation/architecture: reuse a shared local asset for all affected HTML backgrounds, including combined previews and design references. Preserve the original image as source material. No backend, authentication, database, payment, or delivery changes.

Delivery: no PR requested. Production publication is pending separate authorization; the preceding Cloudflare approval applied only to Christmas removal. Supply a responsive interactive preview from the contributor fork.

Verification: all 13 references were replaced; a scan of public HTML/CSS/JS finds no old image reference. Duplicate-image hash scan found only the original asset. The replacement SHA-256 is ACE98E77C418EBEBE1F09B3F1016D1EC329B4BABB90057E9034ABD16BDF1A85E, matching the supplied PNG. Existing site validation passed for 115 HTML pages and local references; static build and cinematic deployment validation passed. Mobile browser preview at 390px renders the replacement hero background, with document width 375px and no horizontal overflow. Preview uses sample data and does not save actions. Source change: 5d2264df522f2e505149e524c066ed2e250f1a86. Production remains at Christmas-only deployment 75d3f49f.
