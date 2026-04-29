# API And Events

This file documents the main HTTP endpoints and Socket.IO events used by the game.

## HTTP Endpoints

### Public Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/game-assets` | Returns the runtime asset manifest used by the client for skins, weapons, and enemy sprites |
| `POST` | `/api/auth/register` | Creates a new account and returns auth state |
| `POST` | `/api/auth/login` | Logs into an existing account and returns auth state |
| `GET` | `/api/auth/session` | Returns the current authenticated session profile |
| `POST` | `/api/auth/logout` | Invalidates the current session |
| `POST` | `/api/profile/skin/select` | Selects an already unlocked skin |
| `POST` | `/api/profile/skin/unlock` | Spends meta currency to unlock a skin |
| `POST` | `/api/profile/weapon/select` | Selects an already unlocked starting weapon |
| `POST` | `/api/profile/weapon/unlock` | Spends meta currency to unlock a weapon permanently |

`GET /api/game-assets` also carries:

- `defaultWeaponId`
- weapon shop metadata
- normalized weapon `stats`, `fx`, and `presentation` fields used by the client runtime

### Admin Endpoints

These routes require admin auth. See `ADMIN_CONSOLE_ACCESS.md` for the access model.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/summary` | Returns live dashboard summary data |
| `GET` | `/api/admin/game-assets/catalog` | Returns the asset catalog used by the admin tools |
| `POST` | `/api/admin/game-assets/import` | Imports game asset metadata/content into the live catalog |
| `POST` | `/api/admin/game-assets/metadata` | Updates metadata for discoverable assets |
| `GET` | `/api/admin/assets` | Lists files/folders in `assets/` |
| `GET` | `/api/admin/assets/svg-templates` | Lists SVG templates for the art tools |
| `POST` | `/api/admin/assets/folders` | Creates folders inside `assets/` |
| `POST` | `/api/admin/assets/upload` | Uploads a file into `assets/` |
| `POST` | `/api/admin/assets/rename` | Renames a file or folder in `assets/` |
| `GET` | `/api/admin/rooms/:roomId` | Returns room-level admin details |
| `POST` | `/api/admin/server/connections` | Blocks or allows new incoming player connections |
| `POST` | `/api/admin/rooms/:roomId/lock` | Locks or unlocks a room |
| `POST` | `/api/admin/rooms/:roomId/players/:playerId/kick` | Removes a player from a room |
| `POST` | `/api/admin/ip-blocks` | Blocks or unblocks an IP address |

## Auth Payload Notes

The current auth system is custom and local to this project:

- Password hashing uses `crypto.scrypt`
- Session tokens are HMAC-signed
- The browser stores the token in `localStorage` as `authToken`
- Authenticated REST requests use the `Authorization: Bearer <token>` header
- Socket auth sends the token through `socket.handshake.auth.token`

## Socket.IO Events

### Client To Server

| Event | Payload | Purpose |
| --- | --- | --- |
| `getRooms` | none | Request fresh room list |
| `createRoom` | `roomName, playerName, skinTheme, selectedWeapon, roomMode?, roomOptions?` | Create a room and join it. `roomMode` supports `pve` (default) or `pvp_ffa`. `roomOptions` can include `killLimit` and `timeLimitMinutes` for FFA. |
| `spectateRoom` | `roomId` | Join a room as a spectator |
| `joinRoom` | `roomId, playerName, skinTheme, selectedWeapon` | Join an existing room |
| `startGame` | none | Host starts the match |
| `playerInput` | input object | Send movement/shooting intent and aim coordinates |
| `playerShoot` | `weaponType` | Request a server-authoritative shot |
| `reloadWeapon` | `weaponType, callback` | Start a reload for the active weapon, either from `R` or an empty-mag auto reload |
| `throwGrenade` | `options, callback` | Throw a grenade if the player has charges and the cooldown is ready. `options.chargeRatio` ranges from `0..1` and controls throw distance. |
| `buyUpgrade` | `upgradeType, callback` | Attempt a shop purchase (`damage`, `fireRate`, `health`, `speed`, `shield`, `grenade`) |
| `voteEndMatch` | `callback` | Toggle the player's between-wave end vote |
| `respawn` | none | Respawn after death |
| `endGame` | none | End the game / leave flow |
| `getLeaderboard` | none | Request leaderboard data |

### Server To Client

| Event | Payload | Purpose |
| --- | --- | --- |
| `authState` | auth session summary | Sent on connect and auth changes |
| `profileUpdated` | public profile | Updated account progression and cosmetics |
| `roomList` | rooms array | Lobby room browser data |
| `roomJoined` | room/player payload | Successful room join for a player |
| `spectatorJoined` | room payload | Successful spectator join |
| `roomState` | room snapshot | Staging lobby and room metadata |
| `joinRoomFailed` | error string | Join/create failure |
| `playerJoined` | player payload | Roster update |
| `playerLeft` | player id | Roster update |
| `gameStarted` | none | Match start signal |
| `arenaState` | arena definition | Theme/layout/obstacle payload |
| `gameState` | authoritative state snapshot | Main simulation sync. Includes `mode` and `match` for PvP rooms. |
| `waveStart` | wave data | Wave transition message |
| `shopStarted` | shop timing | Shop phase start |
| `shopError` | message | Shop or vote failure |
| `shopPurchaseResult` | result payload | Purchase confirmation/rejection |
| `grenadeExploded` | grenade position/radius | Shared explosion cue for client effects |
| `killFeed` | kill payload | Real-time kill feed entry for PvP FFA (`killerName`, `victimName`, `weaponType`) |
| `matchEnded` | PvP match payload | PvP end-of-match scoreboard (`scoreboard`, `winnerId`, `reason`) |
| `gameEnded` | final wave + leaderboard | Match over state |
| `gameEndedPersonal` | reward summary | Per-player post-match result |
| `leaderboard` | leaderboard array | Leaderboard refresh |

## Shop Purchase Contract

The buy flow now has two confirmation paths:

- Socket ack callback from `buyUpgrade`
- `shopPurchaseResult` event

The client should treat the server response as authoritative and refresh:

- money
- upgrade levels
- build summary
- shop notice text

## Persistence Files

### `data/users.json`

Stores:

- user id
- username
- password salt/hash
- session nonce
- created/last login timestamps
- progression
- meta currency
- unlocked skins
- selected skin
- unlocked weapons
- selected weapon
  - aggregate stats

### `data/auth-secret.txt`

Stores the secret for signing auth tokens. Rotating it invalidates current sessions.

## Asset Discovery Contract

`/api/game-assets` builds the runtime asset manifest from:

- built-in skin catalog
- auto-discovered SVGs in `assets/sprites/`
- auto-discovered SVGs in `assets/weapons/`
- optional asset metadata managed through the admin tooling

Important boundary:

- Adding weapon art does not automatically add new weapon gameplay behavior
- New gameplay types still require updates in `server.js` and `multiplayer-game.js`
