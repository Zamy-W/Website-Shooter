# Architecture

This file explains how the current game is put together so gameplay and UI changes can be made without rediscovering the codebase each time.

## Top-Level Shape

The project is a single Node.js server plus a browser client:

- `server.js`
  - Serves the site with Express
  - Hosts the Socket.IO connection
  - Owns room state, game simulation, combat, upgrades, progression rewards, and admin APIs
- `index.html` + `multiplayer-game.js`
  - Render the main lobby, overlays, and match view in the browser
- `js/*.js`
  - Break out rendering and support systems used by the main client controller

## Runtime Flow

### 1. Browser loads the site

- Express serves static files from the repo root.
- HTML, JS, CSS, and SVG responses are set to `no-store` to reduce stale browser builds during local development.

### 2. Client restores identity

- `multiplayer-game.js` loads:
  - `authToken` from `localStorage`
  - `selectedSkin` from `localStorage`
- The client calls the auth session API and then reconnects the socket with the current token.

### 3. Lobby and room flow

- Room creation/joining is done over Socket.IO.
- The server sends room snapshots through `roomState`.
- The staging lobby uses that room snapshot to show roster, host, room name, and current setup before the match starts.

### 4. Match starts

- `GameRoom.startGame()` in `server.js` generates a new arena definition.
- The server resets match state and spawns players.
- The server emits:
  - `gameStarted`
  - `arenaState`
  - ongoing `gameState`

### 5. Match simulation runs on the server

- `GameRoom.update()` is the authoritative loop.
- It updates:
  - players
  - bullets
  - enemies
  - particles
  - power-ups
  - wave progression
  - shop timing
  - obstacle collision

### 6. Client renders and handles feel

- `multiplayer-game.js` consumes `gameState` and `arenaState`.
- Rendering is split between:
  - the main game controller
  - `CameraSystem`
  - `ParallaxBackground`
  - `SpriteRenderer`
  - `ParticleSystem`
  - `UIManager`

### 7. Progression persists after the run

- If the player is authenticated, the server awards persistent meta currency and updates saved stats.
- The browser receives `profileUpdated` and refreshes the lobby/profile UI.

## Main Server Structures

### Configuration

Most balance and content knobs live near the top of `server.js`:

- `GAME_CONFIG`
  - world size, player stats, enemy defaults, power-up timing, room size, tick rate
- `data/catalog/weapons.json`
  - source-of-truth weapon registry for gameplay, shop metadata, art paths, and presentation values
- `WEAPON_CONFIG`
  - normalized runtime map derived from `data/catalog/weapons.json`
- `UPGRADE_CONFIG`
  - cost scaling and max levels
- `ARENA_THEMES`
  - palette definitions
- `ARENA_LAYOUTS`
  - layout types
- `BUILT_IN_SKIN_CATALOG`
  - built-in cosmetic catalog

### Classes

- `Vector2D`
  - basic math helper
- `ServerParticle`
  - server-side transient visual state
- `ServerPowerUp`
  - health/speed/damage/shield pickups
- `ServerPlayer`
  - movement, combat stats, power-up effects, money, upgrades, serialization
- `ServerBullet`
  - bullet travel and collision data
- `ServerEnemy`
  - simple enemy behavior
- `GameRoom`
  - the main match container

### `GameRoom` responsibilities

`GameRoom` is the most important server type. It owns:

- room membership
- host assignment
- spectator list
- current arena
- wave state
- between-wave shop state
- early-end voting state
- player spawn slots
- all active entities

If a new gameplay feature changes actual game rules, it usually belongs in `GameRoom`, `ServerPlayer`, or the config section above them.

## Main Client Structures

### `MultiplayerGame`

`multiplayer-game.js` is the central client orchestrator. It owns:

- socket lifecycle
- local input capture
- auth and session UI
- lobby and room UI
- loadout shop UI
- between-wave upgrade shop UI
- spectator controls
- render loop
- state application from the server

### Client support modules

- `AssetManager`
  - fetches and caches images/audio/json
- `CameraSystem`
  - follow target, zoom, bounds, shake
- `ParallaxBackground`
  - back-layer environment visuals driven by arena theme palette
- `SpriteRenderer`
  - sprite animation states and drawing helpers
- `ParticleSystem`
  - visual particles, including shell casings and muzzle effects
- `UIManager`
  - canvas-side UI helpers

## Persistence Model

### Runtime files under `data/`

- `users.json`
  - local JSON user database
  - stores accounts, password hash/salt, session nonce, progression, unlocked skins, and selected skin
- `auth-secret.txt`
  - secret used to sign auth tokens
  - changing or deleting it invalidates existing sessions

### Auth model

- Passwords are stored as salted `crypto.scrypt` hashes.
- The server signs a custom token with HMAC.
- The client stores the token in `localStorage` as `authToken`.
- Socket auth is tied to the same token, so reconnecting the socket after login matters.

### Guest vs authenticated play

- Guests can still play matches.
- Persistent progression, credits, and saved cosmetics belong to authenticated accounts.

## Pages And Tools

- `index.html`
  - player-facing experience
- `admin.html`
  - monitoring, moderation, room control
- `asset-admin.html`
  - edit the `assets/` directory from the browser
- `spectator.html`
  - watch rooms without taking a player slot
- `sprite-forge.html`
  - recolor/generate SVG variants
- `sprite-builder.html`
  - build new procedural SVG sprites

## Important Working Rules

### Server-authoritative first

For anything that affects fairness or correctness, update the server first:

- money
- upgrades
- damage
- progression rewards
- collisions
- wave logic
- room permissions

### Then wire the client

After the server behavior exists:

- expose it through a route or socket event
- render it in the UI
- make the overlay/state transitions obvious to the player

### Keep the docs current

When adding a system, update:

- `README.md`
- one or more files in `docs/`
- admin docs if the feature appears in admin or spectator views
