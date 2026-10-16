# Account security hardening, 16 October 2026

SPEAR continuation on PR 53 after fetching canonical main cf21ef2 and preserving
the existing worktree and private evidence. No project EARS/state helpers exist;
this document records requirements, proof and delivery boundaries instead.

## Spec and acceptance

1. Discord OAuth state remains random, hashed, short-lived and single-use. Bind
   the callback to a Secure/HttpOnly/SameSite=Lax __Host- cookie in the browser
   that began login. Missing, duplicate or mismatched cookies fail before token
   exchange or state consumption. Clear the transaction cookie on completion.
   Failed/expired attempts cannot create a session or overwrite an existing one.
2. Add same-origin POST logout-all: derive the Discord owner solely from the
   current unexpired hashed session, revoke all of that owner's sessions in one
   statement, and preserve other owners and Minecraft links. Do not require the
   network account service for emergency revocation. Database errors must not
   report successful revocation. Existing logout remains current-session only.
3. Discord staff authorization requires an OAuth login no older than eight
   hours, independently of the normal thirty-day player session. Keep the
   one-hour role freshness/authoritative refresh and Minecraft ownership checks.
   Role refresh must not renew the original authentication time. Cloudflare
   Access continues enforcing its independently verified JWT expiration.
4. All Pages API responses, including redirects, errors and streaming/media
   responses, receive consistent transport, framing, MIME, referrer and content
   security headers. Preserve repeated Set-Cookie, status, body and intentional
   public caching. OAuth routes are always no-store.
5. Add a themed, touch-friendly 'Sign out all devices' account control with
   explicit confirmation and failure feedback. Deliver an interactive preview;
   demo sign-outs are simulated locally and cannot revoke real accounts.

## Proof and refine plan

Use isolated SQLite and mocked Discord, never production OAuth codes, cookies or
tokens. Regress cross-browser/missing state, state replay/expiry, revocation
isolation, expired sessions, service outage, staff login age, and header/cookie
preservation. Then run the full website suite, static build, Pages compilation
and hosted checks for the exact PR head. Browser-check the account control at
mobile width. No production changes, migrations, secret changes, real logout
or Discord messages are authorized by this implementation work.

## Verification checkpoint

The isolated SQLite/Discord regression reproduced a callback minting a session
without a browser-bound cookie, and a fresh role snapshot extending an old staff
login. Both fail closed after the repair. Focused checks cover successful bound
login, malformed/duplicate/mismatched cookies, expiry/cancellation/replay,
OAuth-start throttling, owner-only all-device revocation, expired/cross-origin
requests, unchanged links/other owners, current-device logout and database errors.
Staff age tests preserve normal player sessions while rejecting privileged use.

604 website tests pass with lint, 130 page/asset checks and map layers. Static
build and Pages Functions compilation pass. API header tests preserve two
Set-Cookie values, redirect status/location, stream bytes and public cache policy;
unexpected errors are generic, private and carry the same security headers.

The preview uses the actual account renderer and only simulates sign-out for
sample personas. At 390px, document width is 375px with no horizontal overflow;
both actions measure 48px tall. Inline confirmation, cancellation and simulated
failure are exposed in the preview. A previous native demo dialog blocked browser
click testing; full post-dialog interaction confirmation remains to be completed.
Hosted checks and live provider acceptance are separate from these local results.

## Operator rollout

No schema migration is needed. Merge reviewed source before deployment. Existing
in-flight OAuth attempts started before this release lack a binding cookie and
must restart sign-in. Staff with logins older than eight hours must reauthenticate;
ordinary player browsing retains its existing expiration. Reverting the feature
does not restore sessions already revoked. Live acceptance must separately verify
OAuth round trip, mismatched-browser rejection and two-device revocation with
authorized disposable sessions, while retaining other players' sessions/links.
