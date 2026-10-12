# Hall background replacement

Requirement: every public background using the brown lectern hall shown in the user's screenshot must use the exact supplied purple council-hall image instead. Preserve text, controls, overlays, cropping, and the Christmas publication boundary.

Spec/proof: current canonical main remains cdcd8aa. The ongoing removal base is ad22f59, with production at 01d2d9b. Source inspection and visual inspection identify assets/design/a9386f825341.jpg as the old hall, referenced by 13 public HTML backgrounds. No project-local EARS or SPEAR state helpers exist; evidence is recorded manually. This is a reversible static presentation change; behavioral regression tests are unnecessary.

Implementation/architecture: reuse a shared local asset for all affected HTML backgrounds, including combined previews and design references. Preserve the original image as source material. No backend, authentication, database, payment, or delivery changes.

Delivery: no PR requested. Production publication is pending separate authorization; the preceding Cloudflare approval applied only to Christmas removal. Supply a responsive interactive preview from the contributor fork.
