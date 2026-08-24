# Enthusia Wiki Writing Guide

This guide records how player-facing Enthusia wiki content should be written and displayed. Use it before writing or rewriting any mechanics page.

## Core goal

Give players the most useful answer with the least unnecessary reading. Pages can be detailed, but every detail should help a player understand what a feature does, how to use it, what matters in practice, or what its important limits are.

## Writing rules

1. **Write for players, not developers.** Use normal Minecraft/server language. Do not describe repositories, classes, storage, implementation architecture, adapters, packet internals, migration details, or bug-fix history unless a player directly experiences the result.

2. **Lead with the useful answer.** The first paragraph should explain what the feature is and why a player cares. Do not begin with background, design history, or a long setup.

3. **Important systems deserve dedicated pages.** Major mechanics such as PieCloak, Warzone, Market, Guilds, Events, Playtime, Reputation, etc. should be easy to find directly rather than buried inside broad overview pages.

4. **Use progressive disclosure.** Keep the main page readable, then use dropdowns for long reference material such as protected entities, commands, reward lists, modifiers, or other exact inventories.

5. **Group variants that behave the same.** Do not list every color, wood type, wall variant, or cosmetic variation when one group name explains the behavior. Example: write `Shulker Boxes`, `Signs`, `Beds`, or `Heads and Skulls` instead of listing every variant.

6. **Do not list irrelevant negatives.** A "not protected" or "does not affect" section should only contain things a player might realistically expect the feature to cover or information that creates a real gameplay consequence. Do not fill it with unrelated Minecraft blocks/items just because the plugin does not manage them.

7. **Use practical limitations, not exhaustive exclusions.** For PieCloak, mentioning that particles can still expose information is useful. Listing ores, furnaces, barrels, and unrelated blocks is not.

8. **Combine command aliases with the main command.** Do not create one row for `/balance` and another for `/bal` or `/money`. Put the aliases in the same entry.

9. **Combine closely related command variants.** If `/deposit`, `/deposit <amount>`, and `/deposit all` are one action with different arguments, explain them together. Do the same for obvious subcommand families when separating them would only repeat information.

10. **Keep distinct actions distinct.** Do not over-compress genuinely different actions just to reduce row count. `/tpa` and `/tpahere`, for example, have different meanings and can remain separate.

11. **Avoid repeating the same explanation.** Explain a mechanic fully once, then link to that page from other places. Index pages should summarize and point deeper rather than restating whole sections.

12. **Prefer concise tables and lists.** A command table should be fast to scan. Descriptions should normally be one sentence. Long explanations belong on the feature's dedicated page.

13. **Do not give exact phase timings unless they help the player.** A player usually needs to know that an event has a join/countdown period, not the exact duration of every internal phase. Exact cooldowns, prices, limits, or timers should be included when they directly affect player decisions.

14. **Do not arbitrarily spotlight one peer feature.** If a page lists many events, do not add a large standalone BedWars section unless BedWars genuinely needs separate documentation. Put important event-specific facts, such as BedWars using 1.8-style PvP, in its event entry or a dedicated BedWars page.

15. **Use examples when they make a mechanic easier to understand.** Good examples show how a rule changes actual play. They should not repeat the preceding paragraph in different words.

16. **Use exact current behavior.** Public pages should describe what players can actually use now. Do not turn design documents, disabled configuration, planned features, old commands, or stale config into active server documentation.

17. **State unavailable features briefly.** If something important is in development or disabled, say that clearly near the top without spending a large part of the page documenting internal inactive behavior.

18. **Avoid implementation-style terminology.** Prefer `entity`, `block entity`, `player`, `menu`, `cooldown`, `region`, `reward`, etc. Avoid repeatedly using abstract terms such as `clue`, `managed target`, `runtime`, or other developer wording when a normal Minecraft term works.

19. **Use confident plain language.** Prefer `BedWars uses 1.8-style PvP.` over a long explanation of how the combat implementation reaches that result.

20. **Do not add filler.** Remove sentences that only restate the heading, explain obvious navigation, or add generic commentary without new information.

## Navigation and page structure

21. **Breadcrumbs should show the real information hierarchy.** Mechanics pages should follow `Home > Mechanics > Page`. The Mechanics index itself should be `Home > Mechanics`, not `Home > Gameplay`. Community pages should use `Home > Community > Page`.

22. **Do not use internal content groups as breadcrumbs.** Labels such as `Server`, `Economy`, `PvP`, or `Progression` can still be useful visual categories, but they should not replace the main Mechanics hierarchy when the page is reached through Mechanics.

23. **Keep top-level navigation intentional.** Do not keep a tab/card such as Templates unless players have a clear reason to use it. Prefer a smaller set of meaningful destinations.

24. **Make major information easy to discover in more than one sensible place.** A major mechanic can appear in the Mechanics index and relevant navigation/quick links, but avoid duplicating its full text.

25. **Use cards/fact grids only for real scan-friendly facts.** A card should contain a short label and a short fact. Do not use a large visual card for a heading such as `Both` followed by a sentence that would read better normally. Example: `Cross-platform — Java and Bedrock players can both join and play together.`

26. **Long lists should be collapsible.** Entity lists, command categories, modifiers, and other reference-heavy sections should not dominate the page before a player asks to see them.

## Detail level

27. **Be detailed where the detail changes behavior.** Include exact prices, cooldowns, ranges, requirements, losses, restrictions, rewards, and edge cases when players need them to make decisions.

28. **Be brief where the detail is merely procedural.** Do not enumerate internal event phases, backend state transitions, or every minor step when the player only needs the result.

29. **Explain unusual behavior.** If something differs from vanilla or from what the command name suggests, call it out clearly.

30. **Separate mechanic documentation from community history.** Player/guild history and lore belong in community pages. Current gameplay mechanics belong in mechanics pages.

## Quick test before publishing a section

Before keeping any paragraph, table row, card, dropdown, or list item, ask:

- Does this help a player do something or understand an important rule?
- Is this the shortest clear way to say it?
- Is the same information already explained elsewhere?
- Can aliases or variants be combined?
- Is this describing current live behavior rather than implementation or plans?
- Would this be easier to scan as a table, compact list, or dropdown?
- Is this important enough to deserve its own page or heading?
- Am I listing something only because it exists technically, rather than because a player needs to know it?

If the answer exposes unnecessary reading, simplify or remove it.
