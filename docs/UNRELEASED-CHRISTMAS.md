# Christmas skin publication boundary

Spec: remove the unreleased seasonal homepage from public navigation and public deployment files, while preserving its source for a future launch. Canonical main was fetched at cdcd8aa. This isolated change excludes the pending skin/guild/theme/analysis fixes. The user specifically authorized removing the Christmas skin from the live website; no new PR is requested.

Prove: public footers link `home-christmas.html`, and the build copies the public seasonal page, preview copy, reference page and controllers. A regression must fail before removing that publication path. No local EARS/state helpers exist; this is manual SPEAR evidence.

Engine/architecture: retain seasonal source under `designs/unreleased/christmas`, outside the public copy boundary. Remove Christmas navigation from public templates and reference previews. The normal homepage and Minecraft item textures remain available. Do not erase repository history or deploy unrelated prepared feature branches.

Verification: the navigation/public-file regression failed against canonical main, then passed after removal. All 491 tests, lint, site validation and static build pass. The compiled public bundle contains none of the three Christmas HTML pages or two seasonal controllers. Archived controllers use `.js.txt` to retain exact source as non-executable reference material outside the public build.

Immediate live containment: Cloudflare custom rule `1e13e777e6e140338771b73be1cd51bc`, “Hide unreleased Christmas website skin”, is Active with action Block. Expression: `(http.host in {"enthusia.info" "www.enthusia.info"}) and (lower(http.request.uri.path) contains "/home-christmas")`. The zone previously had zero custom rules; no existing rule was altered. Default and `.html` Christmas URLs, public preview/reference copies and the production controller return 403 after this change; the normal homepage remains 200. This is a scoped edge configuration change, not an application deployment. Rollback for a future authorized Christmas launch is to disable this specific rule and restore/revalidate the archived sources through the normal release process.

The current live footer still contains its old link. Removing that link and excluding the originals on the Pages deployment hostname requires publishing this isolated source change. No other prepared feature branch has been deployed.
