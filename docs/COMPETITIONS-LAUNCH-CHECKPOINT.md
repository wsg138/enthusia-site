# Competition launch checkpoint, 15 October 2026

## Spec

Continue competition acceptance without changing production configuration,
publishing a competition, sending Discord messages or granting rewards. Reconcile
PR 53 with canonical main cf21ef2, retaining its verified punishment ownership,
WARNING/WARN handling and shared account unlink behavior.

Prove that the actual website signer is accepted by the actual Java bridge
authenticator and that tampering, missing authentication and replay are rejected.
Use synthetic identities, public test keys and a temporary local SQLite database;
never contact a real bridge or reward provider for this contract check.

No local EARS/state helpers are supplied. This record follows SPEAR at the scale
of this integration: spec, native cross-language proof, smallest supported
change, contract/architecture review, then full verification. Existing passing
tests are baseline evidence, not historical red/green results.

## Verified read-only production evidence

- Competitions page and health endpoint respond successfully; public list empty.
- Remote D1 SELECTs report zero competition records and zero published results.
- Competition schema marker is 27; all 19 required tables/triggers are present.
- A signed-out request to manager status is denied with HTTP 401.
- Encrypted Pages secret names include the dedicated website bot and Discord
  OAuth secret. They do not include `OPENAI_API_KEY`,
  `COMPETITION_BRIDGE_BEARER_TOKEN`, `COMPETITION_BRIDGE_HMAC_SECRET` or
  `COMPETITIONS_DISCORD_STAFF_WEBHOOK`. No secret values were read.
- A read-only download of the production Pages configuration confirms those
  absent credentials are not plaintext variables either. Bridge origin and
  bridge-specific Access configuration are absent too. The Founder role mapping
  is configured. Configuration copies and private metadata stay outside Git.
- Owner-disabled moderation remains unchanged. Submission publication must
  continue to fail closed while its provider is unavailable.

## Remaining launch gates

Founder access investigation: the stored account has the configured Founder
role and one linked account, but its role check is older than the one-hour staff
limit. Preserve that limit. Add a bounded server-to-Discord membership refresh
for stale staff requests using the already configured website bot; fail closed
on provider errors, invalid/mismatched responses, removed roles, departed users
or conflicting account updates. Never trust browser-supplied roles or extend a
stale role timestamp without a successful authoritative lookup.

1. Authorized founder/admin session: inspect `/api/competitions/admin/status`.
   A mobile login is separate from the agent's desktop browser session.
2. Verify Competition Bridge source/merged build, intended installed runtime,
   loopback listener, provider APIs and protected HTTPS connectivity. Configure
   distinct bridge bearer/HMAC credentials plus required Access service-token
   settings through an operator. Never substitute Staff API credentials.
3. Obtain an explicit moderation decision and operator-supplied OpenAI key if
   enabling it. No bypass or automatic enabling is part of this work.
4. Configure the staff-review webhook and verify notification delivery/opt-out
   with a specifically authorized recipient. Existing bot-token presence does
   not prove delivery.
5. On isolated test infrastructure, perform real player solo/group/guild entry,
   media review, vote and judge conflict checks, results publication and reward
   idempotency/provider acceptance. Synthetic proofs do not replace these.
6. Owner supplies the first competition's title, rules, entry types, schedule,
   judges/voting policy and rewards. Prepare a private draft for review before
   any separate approval to publish it.

## Verification

- Current-main reconciliation baseline: 580 website tests, lint, page references
  and map layers pass. Both default and Paper 26.2 bridge profiles pass 19 tests.
- Reproduced stale Founder rejection before the repair; refreshed membership
  tests now cover authorization, role removal, departure, outage, rate limiting,
  malformed/mismatched identity, missing credentials/ownership, optimistic-write
  conflicts, stalled requests and SQLite persistence. No stale-role bypass.
- Actual website signer -> shaded Java bridge verifier + SQLite contract passes
  three route payloads (including UTF-8). Body/path tampering, missing bearer,
  stale timestamps and durable replay after database reopen are rejected. This
  check is now part of CI after the supported Paper bridge builds.
- Final local verification: 593 website tests, lint, page/asset and map checks,
  static build and Pages Functions compilation pass. Both bridge API profiles
  pass 19 tests each and the native signature contract passes. Hosted results
  must be checked separately at the pushed PR head. No production bridge/provider
  or real delivery was exercised.
- Production changes, live rewards and Discord messages: none.
