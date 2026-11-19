# Bedrock wiki update and parser connectivity

Requirement: update the Bedrock hostname to `bedrock.enthusia.net` while keeping Java's `enthusia.net` and port 19132. Preserve unrelated wiki edits. The website wiki demo and separately published wiki source are updated in this branch.

Local verification: all 30 generated wikitext pages passed the real Enthusia Miraheze `action=parse` endpoint. A separate read-only preflight fetched current Main Page revision 815, Server Information revision 817, and Java & Bedrock revision 618, prepared only the address substitutions, and parsed all three proposed pages successfully. Re-read and revision-check before any edit; these revision numbers are evidence, not write authorization.

Hosted failure: GitHub Actions run 41548528701 received HTTP 403 from Miraheze for both GET and POST siteinfo requests. The same API returned 200 for both methods locally. Repeating the hosted validation did not resolve the denial. Do not ignore the parser gate, change hosts, relay around the denial, or trigger the full wiki publisher as a workaround. Miraheze access from GitHub-hosted runners needs an authorized service-side resolution.

Publication: GitHub holds encrypted bot secrets, but their values are not available locally. Do not overwrite unrelated pages or export credentials from GitHub. A wiki operator can supply a fresh BotPassword securely or perform the three exact revision-guarded changes. No live wiki edit was performed.

SPEAR record: this repository has no local EARS/state helpers. The evidence above records the requirement, bounded change, actual remote parser result, hosted failure, and remaining work. No production approval or validation is inferred from a passing local test.
