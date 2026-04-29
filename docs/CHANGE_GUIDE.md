# Change Guide

This is the practical "where do I edit?" guide for common work in this repo.

## First Places To Look

For most feature work, start with these files:

- `server.js`
  - gameplay rules, sockets, auth, progression, arenas, admin APIs
- `multiplayer-game.js`
  - lobby/game/shop/loadout UI, render loop, input, client-side state handling
- `index.html`
  - player-facing DOM structure and overlay markup

If the change is mostly visual, then also check:

- `js/SpriteRenderer.js`
- `js/ParticleSystem.js`
- `js/ParallaxBackground.js`

## If You Want To Change...

| Goal | Primary files | Notes |
| --- | --- | --- |
| Lobby flow, staging room UI, sign-in prompts | `index.html`, `multiplayer-game.js` | Room snapshots come from `roomState` |
| Match rules, damage, wave logic, enemy behavior | `server.js` | Server must stay authoritative |
| Enemy archetypes, hostile projectiles, boss waves | `server.js`, `multiplayer-game.js` | Server owns behavior; client owns readability, boss bar, labels, and minimap dots |
| Weapon balance | `server.js` | Tune `WEAPON_CONFIG` and any related player/bullet/ammo logic |
| Weapon visuals and feel | `multiplayer-game.js`, `js/SpriteRenderer.js`, `js/ParticleSystem.js` | Muzzle flash, recoil feel, shell ejection, crosshair |
| HUD overlays and tactical minimap | `multiplayer-game.js`, `index.html` | Minimap is drawn in the client canvas HUD and uses arena/player/enemy state already sent by the server |
| Between-wave shop behavior | `server.js`, `multiplayer-game.js`, `index.html` | Keep buy validation on the server |
| Persistent progression or auth | `server.js`, `multiplayer-game.js`, `data/users.json` | Auth token flow touches both REST and socket setup |
| Gear shop, cosmetics, and weapon unlocks | `server.js`, `multiplayer-game.js`, `index.html`, `assets/sprites/`, `assets/weapons/` | Unlocks are persistent, match upgrades are not |
| Arena themes, obstacle layouts, cover | `server.js`, `multiplayer-game.js`, `js/ParallaxBackground.js` | Generation is server-side; rendering is client-side |
| Particle effects | `js/ParticleSystem.js`, `multiplayer-game.js` | Shells, blood, muzzle flash, impacts |
| Background art style | `js/ParallaxBackground.js`, `assets/` | Keep it visually consistent with the arena palette |
| Admin tools or spectator view | `server.js`, `admin.html`, `spectator.html`, admin docs | Update admin docs when behavior changes |
| Asset pipeline | `server.js`, `asset-admin.html`, `sprite-forge.html`, `sprite-builder.html` | `/api/game-assets` reflects runtime-discoverable art |

## Common Workflows

### Add A New Skin

1. Add the SVG to `assets/sprites/`.
2. If it is a default built-in skin, also add it to `BUILT_IN_SKIN_CATALOG` in `server.js`.
3. If it should only be discoverable through assets, make sure the filename and metadata make sense.
4. Test:
   - loadout shop visibility
   - unlock cost
   - account persistence
   - in-match rendering

### Add Or Change A Match Upgrade

1. Update `UPGRADE_CONFIG` in `server.js`.
2. Update player application logic in `ServerPlayer`.
3. Mirror the UI config in `multiplayer-game.js`.
4. Make sure shop purchase results serialize the updated player state.
5. Verify shop overlay text and level display.

### Add A New Weapon Gameplay Type

1. Add a new entry in `data/catalog/weapons.json`.
2. Add or update the SVG in `assets/weapons/` and set `artPath`.
3. Reuse an existing `behaviorId` when possible:
   - `projectile`
   - `spread`
   - `charge_shot`
4. Only touch `server.js` and `multiplayer-game.js` if the weapon needs a brand-new behavior.
5. Verify:
   - gear shop visibility and unlock price
   - numeric hotkey order / mouse-wheel cycling
   - crosshair, spread guide, muzzle flash, shell ejection, ammo, and reload feel

Weapon art alone still does not create gameplay, but the catalog now handles most of the old boilerplate automatically.

### Add A New Arena Theme Or Layout

1. Add or edit theme entries in `ARENA_THEMES`.
2. Add or edit layout logic in the arena-generation helpers in `server.js`.
3. Make sure obstacles and decor serialize cleanly.
4. Update any theme-specific client visuals if needed in:
   - `multiplayer-game.js`
   - `js/ParallaxBackground.js`
5. Playtest obstacle collision, visibility, and spawn safety.

### Change Account Or Progression Data

1. Update normalization helpers in `server.js`.
2. Update `getPublicProfile()` if the client needs to see the new field.
3. Update auth/profile UI in `multiplayer-game.js`.
4. Consider backward compatibility for existing `data/users.json`.

## Safe Editing Rules For This Repo

### Keep gameplay authoritative on the server

If the change affects any of these, validate it in `server.js`:

- damage
- money
- upgrade levels
- unlock spending
- wave completion
- room permissions
- collisions

### Mirror config intentionally

Some values are duplicated on purpose for UI presentation:

- server owns truth
- client mirrors labels, colors, and copy

When changing a mirrored system like the shop, update both sides together.

### Remember browser cache debugging

When a browser-side change looks like it is not taking effect, check:

1. `CLIENT_BUILD` in `multiplayer-game.js`
2. visible build label in `index.html`
3. script query strings in `index.html` when needed
4. server restart status if `server.js` changed

This codebase has already had several "fixed in code, stale in browser" moments, so leaving a clear build marker is worth it.

## Best Starting Point For Future Work

If the requested change is unclear, use this order:

1. Read `README.md`
2. Read this file
3. Read `docs/ARCHITECTURE.md`
4. Read the relevant section in `docs/GAMEPLAY_SYSTEMS.md`
5. Then open the target file

That path is enough to get productive quickly without re-exploring the whole repo every time.
