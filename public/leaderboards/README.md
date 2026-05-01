This directory is reserved for fallback/static leaderboard files.

Live playtime leaderboards are read from the Cloudflare R2 binding named:

- `PLAYTIME_LEADERBOARDS`

That binding should point to the `playtime-leaderboard` bucket. The active playtime objects are:

- `leaderboards/index.json`
- `leaderboards/playtime-active-all.json`

Live balance leaderboards are read from the Cloudflare R2 binding named:

- `BALANCE_LEADERBOARDS`

That binding should point to the `balance-leaderboard` bucket. The active balance objects are:

- `leaderboards/index.json`
- `leaderboards/balance-active-all.json`

The website endpoints are:

- `/api/leaderboards`
- `/api/leaderboards/playtime-active-all`
- `/api/leaderboards/balance-active-all`
