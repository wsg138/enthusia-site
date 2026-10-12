# Leaderboard skins — manual SPEAR evidence

Spec: use the public leaderboard's valid UUID as the skin identity before the player's username. Preserve displayed names, scores, ranks, guild banners and legacy name-only feeds.

Prove: StepSoy's live balance/playtime feeds contain UUID `7402cfa7-ee57-41ba-8d65-f6d931547f11`; Mojang's public profile confirms the same account. MCHeads' username body URL returned Steve, while the UUID body URL returned StepSoy's custom skin. Both responses were HTTP 200, so an image error fallback cannot detect this failure. Saved images document the different renderings.

Engine: the player normalizer now prefers a validated dashed/compact UUID, with the existing name fallback when UUID data is absent or malformed. Row heads and podium bodies share that identity. The leaderboard controller URL is versioned to refresh previously cached JavaScript.

Arch: no player-specific override or database mutation; existing public UUID fields are used. No new server adapter, credential or identity lookup is introduced. MCHeads recommends UUIDs over usernames in its official documentation.

Refine: regression tests exercise UUID priority, unchanged display/stat values, alternate UUID field names, compact UUIDs and legacy/malformed fallbacks. Live source/provider proof is separate from local tests and deployment/browser acceptance. No project-local EARS/state helper exists; this is the manual evidence record. User requested no PR; changes start from canonical main `cdcd8aa` in an isolated checkout and must reach canonical main before a production deployment.
