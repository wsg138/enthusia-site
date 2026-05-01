Place public leaderboard JSON exports in this directory before deploying.

The playtime plugin currently exports:

- `playtime-active-all.json`

The website endpoint `/api/leaderboards/playtime-active-all` reads that static asset through the Cloudflare Pages Function and returns it to the frontend.
