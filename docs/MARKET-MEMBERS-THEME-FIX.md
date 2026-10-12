# Market members panel — manual SPEAR evidence

Spec: the market stall Members section shall use the same cream, red and gold card treatment as adjacent stall details. Member names must remain legible and wrap inside the phone-width sheet. Data, map interactions and shop behavior remain unchanged. Production deployment remains on hold; no new PR is requested.

Prove: current canonical main was fetched at cdcd8aa; the ongoing prepared repair branch was clean at 502f0ad. The production renderer creates `.member-list`, but active `market/site-theme.css` omits it from the shared card selector. At 390px, the actual preview rendered background rgb(36,17,8), heading rgb(58,13,10), and names rgb(107,58,42). The older `market-theme.css` contains a card override but is not the stylesheet used by this page.

Engine/architecture: add `.member-list` to the active theme's shared cream card rule. Set a red heading, dark text, matching gold/white inset trim, square red borders and bounded wrapping/padding. Cache-bust the active stylesheet. No data, endpoints, permissions or JavaScript behavior is changed.

Refine: browser rendering/contrast and phone/desktop layout are the appropriate proof for this reversible CSS change. No implementation-mirroring unit test is added. Site validation/build and an interactive public preview are required. There are no project-local EARS/state helpers; this file is the manual requirement/evidence record.

Verified: lint, 122-page reference validation and the static build passed. The actual market renderer at 390px and 1440px shows cream rgb(255,248,230), red heading rgb(179,32,26), and dark member text rgb(58,13,10), with no page or member-panel horizontal overflow. Heading contrast is 6.32:1 and member-name contrast is 15.96:1 against the cream background. Desktop close/reopen works and no browser console errors were observed. Mobile screenshot is saved with the evidence artifacts.

The dedicated `public/preview/market-members-check.html` opens stall13 and uses a captured public market feed dated 12 October 2026, with the same three members from the user's screenshot. It runs the actual production markup, stylesheet and controller. Its preview-only adapter blocks writes and suppresses live streaming; unavailable sales/website backend data is labeled unavailable. Production pages never load those capture adapters. This is captured server data, not current live acceptance or deployment.
