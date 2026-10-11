# Combined feature integration — SPEAR record

## Spec
One reviewable branch based on current canonical main must retain the competition/account/appeal platform, moderation/events, market layers, red/gold visual design, and native wiki fixes. Public navigation must expose all public pages. Private/admin controls retain authentication and authorization. Backend feature flags, migrations, signed Staff/Competition Bridge requests, and rollback/publication guards must remain intact.

## Prove
Canonical main inspected at 79160e35fb110640a1a29dc92b8cff068d78d221 on 2026-10-11. Existing six feature repair heads are verified; original worktrees are preserved. The redesign branch omits competitions/account/punishments/events/moderation navigation and pages that live in other branches. This integration resolves that split. Existing repository tests establish contracts; no historical red/green proof is fabricated. No EARS/state helper tooling exists; this is the manual requirement/task/evidence record.

## Acceptance
- [ ] All six repaired feature branches incorporated with overlapping contracts resolved.
- [ ] Home and navigation reach competitions, events, market, leaderboards, gallery, account, appeals and moderation.
- [ ] Existing meaningful tests and build pass; added integration regressions cover missing feature discovery and script/page contracts.
- [ ] Responsive combined preview uses actual assets and labels simulated APIs; verified phone and desktop interactions.
- [ ] Source pushed in a PR; hosted checks/review findings inspected at its exact head.

## Boundaries
Local integration and reviewable PR authorized. No production merge/deployment, Cloudflare resource provisioning, database migration application, live wiki publication, or messages to other chats. Static preview requires fixtures to demonstrate authenticated/backend states; production acceptance remains separate.
