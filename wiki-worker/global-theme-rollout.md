# Enthusia global wiki theme

The public Miraheze Vector 2022 shell now uses the design that was previously staged and reviewed on `User:P2wn/common.css` and `User:P2wn/common.js`.

The rollout preserves pre-existing `MediaWiki:Common.css` / `MediaWiki:Common.js` content and installs the Enthusia redesign inside managed blocks. The approved behavior includes the dark/light/automatic palette, Vector shell styling, navigation groups, TOC/tab polish, full-header collapsibles, and whole-card navigation.

## Approved source

- Private CSS source revision: `683`
- Private CSS source SHA-256: `e5f9d2a42a9fe098d13768ee729108db6c02c9c93bb6a271f0803e45fa9a0c87`
- Private JS source revision: `670`
- Private JS source SHA-256: `5f8cb551c64f614efb0e97110eb9b22227108f494a193deec4af0aa42200e13a`

## Public publication

The first guarded rollout captured all 205 then-existing wiki pages and all 205 page histories before editing.

- `MediaWiki:Common.css`: revision `694` -> `699`
- `MediaWiki:Common.js`: created as revision `700`
- Pre-edit backup artifact: `9546747804`
- Pre-edit backup digest: `ca46db370c2669f8a477c1ccadbaea4b5c50057a8e589cb1bdae9cf182b00a64`
- Publication evidence artifact: `9546751079`
- Publication evidence digest: `601add798fa7559406ea4528dd7e91a106e46711963e2fd5649b228b5e184a28`

A verification pass then backed up 206 pages/histories. `Common.css` was already current at revision `699`. `Common.js` received a one-time wrapper-whitespace normalization from revision `700` to `701`; the approved private source revision and SHA-256 were unchanged.

- Verification backup artifact: `9546817768`
- Verification backup digest: `467d35da8bc65a118c8bd2071262d460c2e80781b923198ca486ffa614fd27d5`
- Verification evidence artifact: `9546820587`
- Verification evidence digest: `75b0c76916c53b3b5d7c543612be24c7b2822074d4eb0f47a87ef25058765260`

The final idempotency pass captured another complete 206-page / 206-history backup and made zero edits:

- `MediaWiki:Common.css`: `already_current`, revision `699`
- `MediaWiki:Common.js`: `already_current`, revision `701`
- CSS source remained revision `683` with the same SHA-256
- JS source remained revision `670` with the same SHA-256
- Final backup artifact: `9546868844`
- Final backup digest: `f88d7ff4f2c188796359a70b276b06e4938c5c3ea551ea06ef3b922b98d851ea`
- Final evidence artifact: `9546870837`
- Final evidence digest: `50375c08983a87a3e2925df87bfeb28ddbafbc2181a23890c3d10f0474bee027`

The account used for publication had `editinterface`, `editsitecss`, and `editsitejs`. Existing community content and history were preserved throughout the rollout, including the independent `SonOfBlood` revision `604`.
