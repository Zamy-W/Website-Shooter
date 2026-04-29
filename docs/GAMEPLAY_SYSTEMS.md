# Gameplay Systems

This file documents the live gameplay rules and the main places to tune them.

## Match Loop

Rooms can run in two modes:

- `pve` (default): co-op survival waves with between-wave shop.
- `pvp_ffa`: Free For All PvP with kill and time limits.

The current co-op survival flow is:

1. Player signs in or continues as a guest.
2. Player creates or joins a room.
3. Players wait in the staging lobby.
4. Host starts the match.
5. Server generates a random arena theme/layout.
6. Players survive enemy waves.
7. When a wave ends, the between-wave shop opens.
8. Players buy match-only upgrades or vote to end the run early.
9. The next wave starts when the shop timer ends unless everyone consents to end early.
10. The server awards persistent progression for authenticated players when the run ends.

## PvP Free For All (FFA)

FFA rooms are created with `roomMode = pvp_ffa` (see the lobby mode selector).

Rules:

- No enemies, waves, or between-wave shop.
- Player bullets can damage other players (no self-hit from bullets, but grenades can hit anyone in range).
- First player to reach `killLimit` wins.
- Match also ends automatically when the `timeLimitMs` timer expires.
- The server emits `killFeed` for real-time HUD kill feed updates.
- The server emits `matchEnded` with a kills/deaths scoreboard and winner id.
- Players auto-respawn after a short delay (`PVP_CONFIG.respawnDelayMs`).

## Weapons

Weapon rules start in `data/catalog/weapons.json`. The server normalizes that file into `WEAPON_CONFIG` in `server.js`, and the client reads the same registry through `/api/game-assets` so unlocks, runtime stats, and weapon presentation stay aligned.

Current weapons:

- `shotgun`
  - multiple pellets
  - high spread
  - slower fire rate
- `pistol`
  - balanced single-shot sidearm
- `rifle`
  - fastest fire rate
  - longest range
- `sniper`
  - click-to-charge single laser shot
  - blue projectile visuals
  - heavy recoil and slower follow-up

Important notes:

- Combat is manual-fire only.
- Auto-shoot has been removed.
- Weapons auto-reload when their magazine reaches zero, and `R` forces an early reload.
- Hold `G` to charge grenade throw distance, then release to throw it along the current aim direction.
- Grenades are server-authoritative, have a short cooldown, damage enemies in an area, and refill up to the base stock during respawn / between-wave armory breaks.
- Players can buy `grenade` charges in the between-wave shop and collect grenade power-ups to increase their current stock.
- The server uses the weapon type sent by the client but still owns the actual shot creation and damage.
- Client visuals such as muzzle flashes and shell ejection are handled in `multiplayer-game.js`.
- Weapons refill automatically during the between-wave armory break.
- Weapon order, number-key mapping, crosshair colors, and spread guides are now catalog-driven.

## Money And Match-Only Upgrades

The between-wave shop is server-authoritative.

### How players earn match money

- Enemy kill reward:
  - `30 + wave * 5`
- Wave clear reward:
  - `75 + wave * 25`

### Upgrade categories

Defined in `UPGRADE_CONFIG` in `server.js` and mirrored in the client shop UI:

- `damage`
- `fireRate`
- `health`
- `speed`
- `shield`
- `grenade` (buys +1 grenade charge for $100)

### Current upgrade model

- Upgrades only last for the current match.
- Purchases are only valid during shop phase.
- Costs scale per level.
- The server checks:
  - shop is open
  - upgrade exists
  - player exists
  - level is not maxed
  - player has enough money

## Persistent Progression

Persistent progression is account-based.

### What is saved

- meta currency
- unlocked skins
- selected skin
- matches played
- best wave
- total score
- total meta currency earned

### How meta currency is awarded

The reward formula is in `calculateMetaCurrencyReward()` in `server.js`:

- `floor(score / 20) + max(0, wave - 1) * 25`

### Guest behavior

- Guests can play normally.
- Guest progress is not saved to `users.json`.

## Gear Shop, Skins, And Weapon Unlocks

The lobby gear shop is separate from the between-wave upgrade shop.

### Skin sources

- Built-in catalog from `BUILT_IN_SKIN_CATALOG` in `server.js`
- Auto-discovered SVG assets from `assets/sprites/`

### Selection rules

- Authenticated users save their selected skin to their account
- Guests fall back to local browser storage

### Unlock rules

- Skins can have a credit cost
- The server validates unlocks before changing progression

### Weapon locker

- Every player starts with the pistol unlocked
- Rifle and shotgun are permanent account unlocks bought with meta currency
- Authenticated users save their selected starting weapon to their account
- Guests can only use zero-cost weapons, which currently means the pistol
- Mouse wheel and hotkey weapon swapping only cycle through unlocked weapons

### Misc lane

- The same gear shop overlay also reserves a misc section for future account-wide items
- These items are intentionally separate from between-wave combat upgrades

## Waves And Enemies

Core wave logic lives in `GameRoom.update()`, `GameRoom.spawnEnemy()`, and `GameRoom.startNextWave()` in `server.js`.

Current wave behavior:

- wave number increases after each completed round
- enemy counts and spawn pacing ramp with wave progression
- wave compositions are built from archetype queues instead of one generic zombie pool
- every 5th wave is a boss wave
- a shop phase opens between waves

### Enemy archetypes

- `grunt`
  - baseline melee pressure unit
- `scout`
  - faster, lighter melee flanker
- `brute`
  - slower, larger, higher-health frontline unit
- `marksman`
  - ranged pressure unit that fires hostile projectiles
- `boss`
  - large elite used on boss waves with a dedicated boss health bar

Enemy visuals are rendered client-side, but enemy movement, archetype stats, hostile shots, damage, and kill rewards are server-owned.

## Power-Ups

Power-up logic lives in `ServerPowerUp` and `ServerPlayer.applyPowerUp()` in `server.js`.

Current types:

- `health`
  - instant heal
- `speed`
  - temporary speed boost for 10 seconds
- `damage`
  - temporary damage boost for 8 seconds
- `shield`
  - temporary shield effect for 15 seconds

Server timing and spawning come from `GAME_CONFIG.powerup`.

## Arenas, Obstacles, And Cover

Arena content is generated on the server and rendered on the client.

### Arena content model

Each generated arena includes:

- id
- name
- theme id
- layout id
- width and height
- palette
- obstacles
- decor
- spawn points
- power-up spawn points

### Content sources

- `ARENA_THEMES` in `server.js`
- `ARENA_LAYOUTS` in `server.js`
- arena helper functions near the top of `server.js`

### Important behavior

- obstacle collision is handled server-side
- bullets can impact obstacles
- client rendering uses the same obstacle/decor payload for visuals
- background color and environment styling are driven by the arena palette

## Consent-Based Early End

Between waves, players can vote to end the run early.

Rules:

- voting is only available during shop phase
- every active player must consent
- if all players vote yes, the run ends and normal rewards are processed

Server logic lives in:

- `GameRoom.resetEndMatchVotes()`
- `GameRoom.getEndMatchVoteState()`
- `GameRoom.toggleEndMatchVote()`

## Visual Systems

### Main rendering ownership

- `multiplayer-game.js`
  - world rendering, players, enemies, bullets, overlays
- `js/SpriteRenderer.js`
  - sprite animation state and stylized sprite drawing
- `js/ParticleSystem.js`
  - particles, shell casings, bounce, lifetime
- `js/ParallaxBackground.js`
  - skyline and themed background layers

### Visual details already in place

- shell casings eject from weapon anchor points
- shell bounce uses arena-aware ground height
- randomized arena themes and obstacle silhouettes
- upgraded SVG player/enemy/weapon art
- crosshair and muzzle feedback tied to manual fire
- tactical minimap showing players, enemies, cover, pickups, and current viewport

## Fast Balance Knobs

If the goal is tuning feel quickly, start here:

- `server.js`
  - `GAME_CONFIG`
  - `WEAPON_CONFIG`
  - `UPGRADE_CONFIG`
  - `ARENA_THEMES`
  - `ARENA_LAYOUTS`
- `multiplayer-game.js`
  - shop UI copy and presentation
  - weapon visual profiles
  - crosshair behavior
  - particle spawn timing
  - draw routines and camera feel
