# Admin And Main Game Sync

This document tracks what has already been implemented in the admin center and how it connects to the main multiplayer game.

Last reviewed: 2026-03-21

## Purpose

Use this file as the quick reference for:

- what the admin center can already do
- which main-game systems it reflects
- which parts are read-only visibility versus active controls
- which areas still need code when new gameplay systems are added

## Implemented Admin Pages

- `admin.html`
  - Main operations dashboard
  - Room and player monitoring
  - Moderation controls
  - Spectator launch

- `asset-admin.html`
  - Asset browser and file manager for the `assets/` folder

- `sprite-forge.html`
  - SVG recolor and variant generator

- `sprite-builder.html`
  - Procedural sprite generator for new SVG assets

- `progress-admin.html`
  - Saved account editor and persistent leaderboard editor, including permanent credits plus skin and weapon loadouts

- `spectator.html`
  - Admin-only watch view that does not consume a player slot

## Admin Access Model

The admin center is now account-gated instead of using a separate shared key field.

Implemented:

- admin pages require a signed-in account with `isAdmin`
- admin APIs require the same account auth
- login/session responses set an auth cookie so direct page visits can be checked server-side
- the main lobby only shows `Open Admin Console` for admin accounts
- the first account on a brand-new install becomes the initial admin automatically
- existing installs can promote an account with `node tools/admin-account.js grant USERNAME`

## Main Game Systems Already Reflected In Admin

### Room And Match State

The admin dashboard is already synced to the live room state from `server.js`.

Visible in admin:

- room name and room id
- room locked/unlocked state
- player count and spectator count
- live match versus lobby state
- host player
- match duration
- current wave
- enemies alive
- enemies spawned this wave
- bullet count
- power-up count
- particle count
- current enemy spawn rate

### Arena System

The newer arena-generation system is now reflected in the admin dashboard.

Visible in admin:

- arena name
- arena theme id
- arena layout id
- obstacle count
- decor count

The spectator and live game views use the actual `arenaState` feed from the server, while the admin dashboard shows a summary view of that same arena definition.

### Between-Wave Shop And Run State

The between-wave shop flow is now reflected in admin.

Visible in admin:

- whether the room is currently in shop phase
- shop countdown / remaining time
- number of rooms currently in shop phase
- player money
- per-player upgrade levels
- end-run vote totals
- whether each player has voted to end the run

### Player State

Visible in admin for each player:

- alive/down state
- current weapon
- selected skin
- health
- shield
- score
- money
- upgrade build summary
- IP address
- blocked-IP status

### Spectator Support

Admins can watch a live room through `spectator.html` without joining as a player.

Implemented behavior:

- no player slot is consumed
- live game state is received from the server
- waiting-room state is visible before the match starts
- spectator camera can auto-follow action or follow a chosen player

### Asset Pipeline

The admin center already supports asset management for the current asset-driven game systems.

Implemented:

- browse assets in a safe default mode inside `assets/`
- guided SVG import for player skins, enemy sprites, and weapon art
- metadata-backed labels, descriptions, and per-asset costs from the admin center
- advanced file operations for upload, rename, folder creation, and delete after explicitly enabling file management
- typed delete confirmation on asset removal
- saved account editing for usernames, permanent credits, skins, weapons, stats, and password resets
- saved account editing for admin access
- persistent leaderboard editing from the admin center
- runtime leaderboard results now update a player to their personal best instead of stacking duplicate runs
- generate sprite variants in Sprite Forge
- generate new procedural sprites in Sprite Builder
- export generated assets directly into `assets/`

### Runtime Asset Discovery

The main game now auto-discovers eligible SVG assets from `assets/` at runtime through `/api/game-assets`.

Already synced with the game:

- player skin assets added to `assets/sprites`
- enemy sprite variants added to `assets/sprites` with enemy-style naming
- weapon art assets listed from `assets/weapons`
- player skin costs and labels flow through `/api/game-assets` without further code changes

Important boundary:

- new weapon art can appear as an asset, and its catalog metadata can be managed from admin, but a brand-new weapon gameplay type still needs gameplay config/code

## Active Admin Controls

These are not just informational. They change live server behavior.

- watch a room
- lock/unlock a room
- kick a player
- block/unblock an IP
- block/allow new incoming server connections
- asset file operations inside `assets/`
- account progression, permanent credit, loadout, and password edits
- admin-role assignment on accounts
- leaderboard entry edits and resets

## Not A Full Replacement For OS-Level Admin

The admin center does not:

- close Windows firewall ports
- change router port forwarding
- create brand-new weapon gameplay rules from art files alone

Those still require system configuration or gameplay code/config updates.

## Main Files Involved

- `server.js`
  - authoritative room state
  - admin summary API
  - moderation APIs
  - spectator support
  - asset APIs
  - runtime asset manifest

- `admin.html`
  - main admin dashboard

- `progress-admin.html`
  - account and leaderboard editing page

- `spectator.html`
  - watch-only room view

- `multiplayer-game.js`
  - spectator client mode
  - arena-state handling
  - shop/end-vote state
  - runtime asset loading

- `asset-admin.html`
  - asset manager page

- `sprite-forge.html`
  - recolor/variant generation

- `sprite-builder.html`
  - procedural sprite generation

## When To Update This Document

Update this file when:

- the main game adds a new gameplay system that admin should monitor
- the admin dashboard gains new controls
- the spectator view starts supporting new match data
- asset workflows change
- account or leaderboard workflows change
- a new gameplay feature is intentionally not exposed to admin and that boundary should be documented
