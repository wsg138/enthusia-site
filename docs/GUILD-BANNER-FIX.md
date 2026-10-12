# Guild leaderboard banners — manual SPEAR evidence

Spec: guild rows and podiums display actual public guild banner designs, and use a neutral banner where a design is unavailable. A guild must never be represented by a member's player skin. Preserve guild identity, rank, level, scores and membership counts.

Prove: the live guild leaderboard returns ten guilds without banner fields. The podium falls through to an MCHeads player body because each guild has topMemberUuids. The public Market snapshot supplies LumaGuilds banner designs for Vibe, WeOnTop and Asgard under the same guild UUIDs. It does not expose designs for Everlights or BelovedOnes. A guild-owned stall can have a player-head avatar; that is not a guild banner.

Engine: enrich the server guild proxy from the fixed public Market endpoint, matching UUIDs rather than names. Validate and project banner colors/patterns with the existing guild contract. A direct guild design takes precedence; conflicting market designs are not selected. The optional request has a three-second timeout and cannot break guild ranking availability. Its headers never include guild bearer or Access credentials. Guild podiums now always use the banner renderer, including the neutral missing-design state.

Arch: no invented guild designs, name-based association, credential changes or server/database mutations. This reuses already-public authoritative LumaGuilds designs; a complete guild producer export is still needed for the seven guilds without public banners. No project-local EARS/state helper exists, so this is the manual record.

Refine: tests cover UUID matching, preservation of guild statistics, privacy projection, invalid designs, player-head exclusion, conflicts, source precedence, network/JSON failures, credential isolation, server route enrichment and guild podium behavior. The labeled interactive preview uses captured public rankings with the real Market designs. Production remains blocked by canonical repository write access; no PR is created and no unmerged code is deployed to production.
