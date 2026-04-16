# Testing Checklist

## Status Summary

- Site type: static multi-page marketing/info site with shared CSS/JS.
- Pages in scope: `public/index.html`, `public/plugins.html`, `public/rules.html`.
- Key external dependencies: Google Fonts, Minecraft server status API, Discord widget API, Tebex store link, Discord invite link.
- Release goal: verify updated content, logo branding, navigation, rules accuracy, and safe behavior before final push/live validation.

## Known Acceptable Limitations

- The live player count and Discord member widget depend on third-party services and may temporarily show fallback states.
- The About page still uses the filename `plugins.html`; this is acceptable because links are consistent and working.
- No automated browser test suite exists for this repo. Final confidence depends on manual checks below.

## Recommended Testing / Release Approach

1. Test locally on desktop first.
2. Repeat a focused pass on a narrow mobile viewport.
3. Confirm all third-party links and widgets behave acceptably.
4. Re-read the Rules page once after visual testing to confirm the published copy matches the intended policy.
5. If all critical checks pass, approve release. If only external widget data is flaky but fallback behavior is correct, release is still acceptable.

## Ordered Manual Testing Checklist

### 1. Smoke Check

- Open `index.html` and confirm the page loads without obvious layout breakage.
- Open `plugins.html` and confirm the About page loads with the updated content cards.
- Open `rules.html` and confirm the full new ruleset appears.
- Confirm there are no missing images, broken styles, or obvious console errors.

### 2. Header / Branding

- Confirm the new logo appears in the header on all three pages.
- Confirm the black/background area of the logo is transparent and only the intended star mark is visible.
- Confirm the logo size feels aligned with the `Enthusia SMP` wordmark and does not look blurry or stretched.
- Confirm the sticky header remains usable while scrolling on desktop and mobile widths.

### 3. Navigation / Links

- On each page, verify the nav links go to the correct page:
  - `Home` -> `index.html`
  - `About` -> `plugins.html`
  - `Rules` -> `rules.html`
- Verify the active nav state is correct on each page.
- Verify all `Store` links open `https://enthusia-shop.tebex.io/`.
- Verify all `Discord` links open `https://discord.gg/5ccgDCmNSc`.
- On the home page, verify `Join Discord` and `Open Store` buttons go to the same correct destinations.
- Verify the `Copy IP` button copies `play.enthusia.info`.

### 4. Home Page Checks

- Confirm the hero copy reflects the current positioning:
  - semi-anarchy
  - PvP outside Spawn and Market
  - player-driven economy
- Confirm the three feature cards match the current rules and do not mention outdated mechanics.
- Confirm the server IP displays correctly.
- Confirm the server status area handles these states acceptably:
  - online
  - offline
  - fallback / `TBA`
- Confirm the Discord card either shows member info or a clean fallback state with an `Open Discord` button.

### 5. About Page Checks

- Confirm the page title and intro describe the server accurately.
- Confirm the cards do not mention old/outdated features like guilds/events if those are no longer intended site claims.
- Confirm the cards match the current ruleset:
  - wilderness gameplay
  - protected Spawn/Market
  - TNT duping allowed / other dupes banned
  - market stall limits
  - mod restrictions
  - account integrity
  - tickets / staff handling
- Confirm the closing paragraph about English chat and future rule updates reads clearly.

### 6. Rules Page Checks

- Confirm the top heading is `Enthusia Rules`.
- Confirm the intro sentence is present and reads correctly.
- Confirm the TOC links scroll to the correct sections:
  - General Conduct
  - Account Security
  - Gameplay & Mechanics
  - Player Market
  - Reputation System
  - Mods & Clients
  - Enforcement & Tickets
  - Bottom Line
- Confirm each section contains the intended updated rule text and no old rules remain.
- Confirm the `Bottom Line` section reads `Trust and fairness keep the community alive.`
- Confirm the `Back to top` link works.

### 7. Mobile Checks

- Test at a narrow mobile width around `375px`.
- Confirm the header wraps cleanly and navigation pills remain tappable.
- Confirm the logo stays visible and proportionate in the mobile header.
- Confirm hero buttons stack cleanly and do not overflow.
- Confirm status cards wrap without clipping text.
- Confirm About page cards collapse into a readable single-column layout.
- Confirm Rules page TOC and section content remain readable without horizontal scrolling.

### 8. Desktop Checks

- Test at a standard desktop width around `1280px` or wider.
- Confirm the home hero layout uses two columns cleanly.
- Confirm the Discord widget card aligns correctly beside the hero copy.
- Confirm the Rules page TOC remains sticky and readable.
- Confirm long rules lines do not overflow their cards.

### 9. Accessibility / Keyboard Basics

- Use `Tab` from the top of each page and confirm the skip link appears.
- Confirm keyboard focus is visible on nav links, buttons, and major interactive elements.
- Confirm the nav can be used entirely by keyboard.
- Confirm the Rules page anchor links can be reached and activated by keyboard.
- Confirm there is no keyboard trap in the page.
- Confirm the header logo does not create redundant spoken noise for screen readers because the adjacent text already names the brand.

### 10. External Dependency / Fallback Checks

- Temporarily consider how the page behaves if the Minecraft status API fails:
  - status should not break layout
  - fallback text should still look acceptable
- Confirm the Discord widget fallback card looks intentional if Discord widget data is unavailable.
- Confirm the site still works if JS is partially blocked:
  - page navigation should still work
  - direct Store/Discord links should still work
  - only dynamic status/widget behavior should be affected
- Confirm Google Fonts failure does not break layout severely.

### 11. Performance / Load Checks

- Confirm initial page load feels appropriate for a small static site.
- Confirm the logo asset loads cleanly and is not obviously oversized in the rendered header.
- Confirm there are no unnecessary large media assets besides the logo.
- Confirm no page visibly shifts or jumps in a distracting way after load.

## Final Release Decision

- Release if:
  - all page links work
  - rules copy is correct
  - logo/header visuals are acceptable
  - mobile layout is usable
  - external widget fallbacks behave cleanly
- Hold release if:
  - the logo renders incorrectly
  - any nav or external links are wrong
  - the Rules page still contains outdated text
  - mobile layout clips or overflows core content
  - the home page widget/status area breaks layout when external data fails
