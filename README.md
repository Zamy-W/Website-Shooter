# Website Shooter

Website Shooter is a browser-based co-op top-down shooter with real-time multiplayer, server-authoritative combat, randomized arena layouts, between-wave upgrades, account-backed progression, unlockable skins, and admin/spectator tools.

The project has grown well beyond the original simple prototype, so this README is now the front door to the rest of the documentation.

## Quick Start

### Prerequisites

- Node.js 14+
- npm

### Install and Run

```bash
npm install
npm start
```

For development with auto-restart:

```bash
npm run dev
```

Open the game at:

- `http://localhost:3000`

For LAN play, other devices on the same network can use:

- `http://YOUR_LOCAL_IP:3000`

## Documentation Map

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  - How the server, client, pages, data files, and rendering modules fit together
- [`docs/GAMEPLAY_SYSTEMS.md`](docs/GAMEPLAY_SYSTEMS.md)
  - Weapons, waves, money, upgrades, progression, arenas, power-ups, and match flow
- [`docs/API_AND_EVENTS.md`](docs/API_AND_EVENTS.md)
  - HTTP endpoints, Socket.IO events, auth flow, and persistence details
- [`docs/CHANGE_GUIDE.md`](docs/CHANGE_GUIDE.md)
  - Fast "where do I change X?" guide for common edits
- [`ADMIN_CONSOLE_ACCESS.md`](ADMIN_CONSOLE_ACCESS.md)
  - How to access and use the admin, asset, forge, and builder tools
- [`ADMIN_MAIN_GAME_SYNC.md`](ADMIN_MAIN_GAME_SYNC.md)
  - What the admin tools already reflect from the live game

## Current Game Features

- Up to 4 players per room
- Host-controlled staging lobby before a match starts
- Server-authoritative wave survival combat
- Optional PvP Free For All rooms with kill limit, time limit, auto-respawn, kill feed, and end-of-match scoreboard
- Manual shooting with a starter pistol plus unlockable shotgun, rifle, and sniper laser
- Between-wave upgrade shop with match-only upgrades
- Consent vote to end a run early between waves
- Randomized arena themes and obstacle layouts
- Multiple enemy archetypes with a boss wave every 5 rounds
- Tactical minimap showing players, enemies, cover, and current viewport
- Power-ups for health, speed, damage, shield, and grenade stock
- Persistent accounts with saved progression, unlockable skins, and unlockable weapons
- Unified gear shop for cosmetics, weapons, and misc account items
- Leaderboard, admin dashboard, spectator mode, and asset tools

## Controls

- `WASD`: Move
- `Mouse`: Aim
- `Left Click`: Fire, or arm the sniper laser charge shot
- `Hold G`: Charge grenade throw distance, then release to throw
- `Mouse Wheel`: Cycle unlocked weapons
- `R`: Reload early
- `1-9`: Swap to unlocked weapons in locker order
- `Space`: Respawn when dead
- `+`, `-`, `0`: Zoom controls / reset zoom

## Main URLs

- `http://localhost:3000/`
  - Main player lobby and game
- `http://localhost:3000/admin.html`
  - Admin dashboard
- `http://localhost:3000/asset-admin.html`
  - Asset manager for `assets/`
- `http://localhost:3000/spectator.html`
  - Spectator view
- `http://localhost:3000/sprite-forge.html`
  - SVG recolor / variation tool
- `http://localhost:3000/sprite-builder.html`
  - Procedural sprite generator

## Project Map

### Core Runtime Files

- `server.js`
  - Main Node/Express/Socket.IO server
  - Owns gameplay authority, rooms, waves, enemy archetypes, upgrades, auth, persistence, and admin APIs
- `multiplayer-game.js`
  - Main browser client controller
  - Owns lobby flow, auth UI, shops, rendering, input, and socket wiring
- `index.html`
  - Main player page and overlays

### Client Support Modules

- `js/AssetManager.js`
  - Loads and caches image/audio/json assets
- `js/CameraSystem.js`
  - Camera follow, bounds, zoom, and shake
- `js/ParallaxBackground.js`
  - Theme-aware background layers behind the arena
- `js/ParticleSystem.js`
  - Client particle simulation and rendering
- `js/SpriteRenderer.js`
  - Animated sprite rendering helpers
- `js/UIManager.js`
  - Canvas UI helpers and loading/HUD support

### Other Pages and Tools

- `admin.html`
  - Live admin dashboard
- `asset-admin.html`
  - File manager for the `assets/` folder
- `spectator.html`
  - Watch matches without taking a player slot
- `sprite-forge.html`
  - Generate SVG variants from existing assets
- `sprite-builder.html`
  - Create new procedural SVG sprites
- `game.js`
  - Older standalone prototype file; not used by the current multiplayer entry pages

### Content And Data

- `assets/sprites/`
  - Player and enemy SVGs
- `assets/weapons/`
  - Weapon SVGs
- `data/catalog/weapons.json`
  - Shared weapon registry for gameplay stats, shop metadata, and presentation tuning
- `data/users.json`
  - Account, progression, and unlock data
- `data/auth-secret.txt`
  - Secret used to sign auth tokens

## Development Notes

- The server is authoritative for gameplay state. If a value affects combat, money, upgrades, progression, or collisions, it should be validated or owned in `server.js`.
- The client is responsible for feel and presentation: overlays, rendering, particle visuals, sprite loading, and input capture.
- If you change player-facing JS or HTML, remember that the project intentionally disables caching for those files during development, but it is still a good habit to bump visible build markers when debugging browser-side issues.
- If you add a new gameplay feature, update the docs in `docs/` at the same time. This project moves fastest when the file map stays current.

## Troubleshooting

### Cannot Connect To Server

- Make sure `npm start` is running
- Confirm port `3000` is free
- Open `http://localhost:3000` instead of loading `index.html` directly as a file

### UI Looks Outdated After A Change

- Hard refresh the browser
- Make sure the visible build marker matches the version you expect
- Restart the local Node server if the change touched `server.js`

### LAN Players Cannot Join

- Share the host machine's local IP address
- Make sure the host firewall allows port `3000`
- Keep players on the same network for the simplest setup

## License

MIT
