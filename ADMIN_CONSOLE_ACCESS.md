# Admin Console Access

For a feature-by-feature record of what is already implemented in the admin center and how it maps to the main game, see `ADMIN_MAIN_GAME_SYNC.md`.

The admin console for this game is available at:

- `http://localhost:3000/admin.html`
- `http://localhost:3000/asset-admin.html` for asset management
- `http://localhost:3000/progress-admin.html` for account and leaderboard editing
- `http://localhost:3000/sprite-forge.html` for sprite generation
- `http://localhost:3000/sprite-builder.html` for procedural sprite creation

If you are opening the game from another device on your network, use the same host or IP address as the game server:

- `http://YOUR_SERVER_IP:3000/admin.html`
- `http://YOUR_SERVER_IP:3000/asset-admin.html`
- `http://YOUR_SERVER_IP:3000/progress-admin.html`
- `http://YOUR_SERVER_IP:3000/sprite-forge.html`
- `http://YOUR_SERVER_IP:3000/sprite-builder.html`

## Admin Account Access

The admin pages and admin APIs now require a signed-in account with admin access.

- On a brand-new install, the first account ever created becomes the first admin automatically.
- On an existing install, grant admin access once with:

```powershell
node tools/admin-account.js grant YOUR_USERNAME
```

- To see who already has admin access:

```powershell
node tools/admin-account.js list
```

Only signed-in admin accounts can open the admin pages, use the admin APIs, or see the `Open Admin Console` button in the main lobby.

## Fastest Way To Open It

Sign in to the main game with an admin account, then click `Open Admin Console`. It opens the dashboard in a new browser tab.

From the admin dashboard, click `Asset Manager` to open the asset page.
From the admin dashboard, click `Accounts + Leaderboards` to open the progression editor.
From the admin dashboard, click `Sprite Forge` to open the SVG recolor/export tool.
From the admin dashboard, click `Sprite Builder` to generate brand new SVG sprites from procedural presets.

## What The Admin Console Shows

- Connected clients
- Active rooms
- Active matches
- Players in each room
- Current wave and enemy counts
- Bullets, power-ups, and particles
- Basic server memory usage
- Leaderboard entries

## Asset Manager

The asset page can:

- Browse folders inside `assets/`
- Import new game assets through a guided SVG form
- Set or update the display name, description, and unlock cost for each asset
- Preview files safely without exposing delete buttons by default
- Unlock advanced file management only when you explicitly enable it
- Upload a raw file, create folders, rename files, and delete files and folders in advanced mode

Deletes are now gated twice:

- the page hides destructive file actions until `Enable File Management` is turned on
- deleting a file or folder requires typing the exact name to confirm

The asset manager is restricted to the project `assets/` directory. It does not edit files outside that folder.

## Accounts And Leaderboards

The progression page can:

- Edit saved account usernames, permanent credits, unlocked skins, selected skin, unlocked weapons, selected weapon, and lifetime stats
- Grant or remove admin access on saved accounts
- Set a new password for an account from the admin center
- Use quick credit shortcut buttons to stage common permanent credit changes before saving
- Delete an account with typed-name confirmation
- Add, edit, delete, and clear leaderboard entries
- Persist leaderboard edits to the project data folder so they survive restarts
- Runtime leaderboard updates now keep one personal-best entry per player identity and only replace that entry when the new run is better

## Sprite Forge

The Sprite Forge page can:

- Load any SVG template found in `assets/`
- Detect editable hex colors from fills, strokes, and gradient stops
- Preview the original and generated sprite side by side
- Shuffle or reset the palette
- Export a generated SVG variant back into `assets/`

This first version is best for recoloring and variant generation based on your current SVG art style.

## Sprite Builder

The Sprite Builder page can:

- Generate new `operator`, `enemy`, and `drone` sprites
- Change silhouette options like body shape, visor style, horns, wings, legs, and weapon outline
- Change palette colors for each archetype
- Preview a preset base next to the generated result
- Export the generated SVG directly into `assets/`

This is the page to use when you want a genuinely different sprite instead of just a recolor.

## Moderation Controls

The admin console can now:

- Open a live spectator view for any room without taking a player slot
- Kick a player from a room
- Lock or unlock a room so no new players can join it
- Block or unblock IP addresses
- Temporarily block new incoming game connections at the server level

Inside the spectator view, admins can:

- Keep the camera in `Auto Action` mode
- Switch to `Follow Player`
- Pick a player from the target list
- Reset the spectator zoom

Important:

- The server-level connection lock does not close your Windows firewall port or router port-forward rule.
- It only tells the game server to reject new player connections while it stays online.
- Blocking an IP can affect multiple players if they share the same network.

## Notes

- Admin pages now use the same signed-in account system as the game and are no longer protected by a separate shared key field.
- Login and session requests also set an auth cookie so direct visits to admin pages can be checked server-side.
- For real firewall or router port changes, use your operating system firewall settings or router admin page.
