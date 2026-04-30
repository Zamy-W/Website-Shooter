'use strict';

const { v4: uuidv4 } = require('uuid');
const { GAME_CONFIG, ROOM_MODES, PVP_CONFIG, buildWaveSpawnProfile, getEnemyArchetype } = require('../config');
const { WEAPON_CONFIG, getWeaponConfig, getSafeWeaponType } = require('../weapons');
const { UPGRADE_CONFIG, generateArenaDefinition, serializeArena, findOpenArenaPoint, isCircleCollidingWithObstacle, createArenaSpawn } = require('../upgrades');
const { getUpgradeCost } = require('../utils');
const Vector2D = require('./Vector2D');
const ServerParticle = require('./ServerParticle');
const ServerPowerUp = require('./ServerPowerUp');
const ServerGrenade = require('./ServerGrenade');
const ServerBullet = require('./ServerBullet');
const { ServerPlayer } = require('./ServerPlayer');
const { ServerEnemy } = require('./ServerEnemy');

// Injected by entry point after all modules load
let _io;
let _emitRoomState;
let _emitRoomList;
let _getUserById;
let _saveUserStore;
let _awardProgressionToUser;
let _getGameAssetCatalog;
let _normalizeSkinTheme;
let _normalizeWeaponType;
let _normalizeRoomMode;
let _sanitizeUnlockedSkins;
let _sanitizeUnlockedWeapons;
let _addToLeaderboard;
let _getLeaderboard;

function initGameRoomDeps(deps) {
    _io = deps.io;
    _emitRoomState = deps.emitRoomState;
    _emitRoomList = deps.emitRoomList;
    _getUserById = deps.getUserById;
    _saveUserStore = deps.saveUserStore;
    _awardProgressionToUser = deps.awardProgressionToUser;
    _getGameAssetCatalog = deps.getGameAssetCatalog;
    _normalizeSkinTheme = deps.normalizeSkinTheme;
    _normalizeWeaponType = deps.normalizeWeaponType;
    _normalizeRoomMode = deps.normalizeRoomMode;
    _sanitizeUnlockedSkins = deps.sanitizeUnlockedSkins;
    _sanitizeUnlockedWeapons = deps.sanitizeUnlockedWeapons;
    _addToLeaderboard = deps.addToLeaderboard;
    _getLeaderboard = deps.getLeaderboard;
}

// Open flat arena for the social lobby — no obstacles, just a large empty floor
function generateOpenArena() {
    const playerSpawns = [
        { x: 400, y: 400 }, { x: 1200, y: 400 }, { x: 2000, y: 400 },
        { x: 400, y: 1200 }, { x: 1200, y: 1200 }, { x: 2000, y: 1200 },
        { x: 400, y: 2000 }, { x: 1200, y: 2000 }, { x: 2000, y: 2000 }
    ];
    return {
        id: 'lobby-arena', name: 'Social Lobby', themeId: 'lobby', layoutId: 'open',
        width: 2400, height: 2400,
        palette: { ground: '#0d1820', accent: '#1a4060', glow: '#7ee8ff' },
        obstacles: [],
        decor: [],
        playerSpawns,
        spawnPoints: playerSpawns,
        enemySpawns: []
    };
}

class GameRoom {
    constructor(id, name, options = {}) {
        this.id = id;
        this.name = name;
        this.mode = _normalizeRoomMode(options?.mode);
        const requestedPvp = options?.pvpSettings && typeof options.pvpSettings === 'object' ? options.pvpSettings : {};
        const rawKillLimit = Number(requestedPvp.killLimit);
        const killLimit = Math.max(5, Math.min(150, Math.floor(Number.isFinite(rawKillLimit) ? rawKillLimit : PVP_CONFIG.killLimit)));
        const rawTimeLimitMs = Number(requestedPvp.timeLimitMs);
        const rawTimeLimitSeconds = Number(requestedPvp.timeLimitSeconds);
        const rawTimeLimitMinutes = Number(requestedPvp.timeLimitMinutes);
        let timeLimitMs = Number.isFinite(rawTimeLimitMs) && rawTimeLimitMs > 0
            ? rawTimeLimitMs
            : (Number.isFinite(rawTimeLimitSeconds) && rawTimeLimitSeconds > 0
                ? rawTimeLimitSeconds * 1000
                : (Number.isFinite(rawTimeLimitMinutes) && rawTimeLimitMinutes > 0
                    ? rawTimeLimitMinutes * 60 * 1000
                    : PVP_CONFIG.timeLimitMs));
        timeLimitMs = Math.max(60_000, Math.min(60 * 60 * 1000, Math.floor(timeLimitMs)));
        this.pvpState = { killLimit, timeLimitMs, respawnDelayMs: PVP_CONFIG.respawnDelayMs, startedAt: 0, endsAt: 0 };
        this.locked = false;
        this.hostId = null;
        this.players = new Map();
        this.spectators = new Set();
        this.bullets = new Map();
        this.grenades = new Map();
        this.enemies = new Map();
        this.particles = new Map();
        this.powerUps = new Map();
        this.gameStarted = false;
        this.lastUpdateTime = Date.now();
        this.enemySpawnTimer = 0;
        this.powerUpSpawnTimer = 0;
        this.wave = 1;
        this.enemiesThisWave = 0;
        this.maxEnemiesPerWave = 5;
        this.waveSpawnQueue = [];
        this.waveProfile = { bossWave: false, label: 'Wave 1', bossType: null, summary: [] };
        this.waveStartTime = 0;
        this.gameStartTime = 0;
        this.shopPhase = false;
        this.shopEndTime = 0;
        this.shopDurationMs = 15000;
        this.endMatchVotes = new Set();
        this.chatLog = []; // lobby chat history (last 50 messages)
        // Lobby: use an open arena with no obstacles so players can freely roam
        this.arena = this.mode === ROOM_MODES.LOBBY ? generateOpenArena() : generateArenaDefinition();
    }

    isPvpMode() { return this.mode === ROOM_MODES.PVP_FFA; }
    isLobbyMode() { return this.mode === ROOM_MODES.LOBBY; }

    getMatchState(now = Date.now()) {
        if (!this.isPvpMode()) return { mode: ROOM_MODES.PVE };
        return {
            mode: ROOM_MODES.PVP_FFA,
            killLimit: this.pvpState.killLimit,
            timeLimitMs: this.pvpState.timeLimitMs,
            startedAt: this.pvpState.startedAt,
            endsAt: this.pvpState.endsAt,
            timeLeftMs: this.pvpState.endsAt ? Math.max(0, this.pvpState.endsAt - now) : null
        };
    }

    getArenaState() { return serializeArena(this.arena); }

    getCurrentSpawnRate() {
        const baseSpawnRate = Math.max(800, GAME_CONFIG.enemy.spawnRate - (this.wave - 1) * GAME_CONFIG.enemy.spawnRateDecrease);
        return this.waveProfile?.bossWave ? Math.max(950, Math.round(baseSpawnRate * 1.15)) : baseSpawnRate;
    }

    configureWavePlan() {
        const nextProfile = buildWaveSpawnProfile(this.wave, this.players.size);
        this.waveProfile = {
            bossWave: Boolean(nextProfile.bossWave),
            label: nextProfile.label || `Wave ${this.wave}`,
            bossType: nextProfile.bossType || null,
            summary: Array.isArray(nextProfile.summary) ? nextProfile.summary : []
        };
        this.waveSpawnQueue = Array.isArray(nextProfile.queue) ? [...nextProfile.queue] : [];
        this.maxEnemiesPerWave = this.waveSpawnQueue.length;
    }

    getWaveInfo() {
        const bossEnemy = Array.from(this.enemies.values()).find((enemy) => enemy.isBoss) || null;
        const bossType = bossEnemy?.type || this.waveProfile?.bossType || null;
        const bossProfile = bossType ? getEnemyArchetype(bossType) : null;
        return {
            bossWave: Boolean(this.waveProfile?.bossWave),
            label: this.waveProfile?.label || `Wave ${this.wave}`,
            bossType,
            composition: Array.isArray(this.waveProfile?.summary) ? this.waveProfile.summary : [],
            bossAlive: Boolean(bossEnemy),
            bossId: bossEnemy?.id || null,
            bossName: bossEnemy?.label || bossProfile?.label || null,
            bossHealth: bossEnemy?.health || 0,
            bossMaxHealth: bossEnemy?.maxHealth || 0
        };
    }

    spawnWaveFrontline(count = 1) {
        const burstCount = Math.max(0, Math.round(Number(count) || 0));
        for (let index = 0; index < burstCount; index++) {
            if (this.enemiesThisWave >= this.maxEnemiesPerWave) break;
            if (this.spawnEnemy()) this.enemiesThisWave += 1;
        }
    }

    emitWaveStart() {
        _io.to(this.id).emit('waveStart', {
            wave: this.wave,
            enemyCount: this.maxEnemiesPerWave,
            spawnRate: this.getCurrentSpawnRate(),
            ...this.getWaveInfo()
        });
    }

    spawnEnemyProjectile(enemy, shot) {
        if (!enemy || !shot?.direction) return null;
        const direction = shot.direction.normalize();
        const bulletStart = enemy.position.add(direction.multiply(enemy.size + 8));
        const bullet = new ServerBullet(
            uuidv4(), bulletStart.x, bulletStart.y,
            direction.x * shot.speed, direction.y * shot.speed,
            enemy.id, shot.damage, shot.range, 'pistol',
            {
                hostile: true,
                style: shot.style || (enemy.isBoss ? 'boss-bolt' : 'enemy-bolt'),
                color: shot.color || enemy.accentColor,
                impactColor: shot.impactColor || shot.color || enemy.accentColor,
                size: shot.size || 4
            }
        );
        this.bullets.set(bullet.id, bullet);
        this.createImpactParticles(bulletStart.x, bulletStart.y, shot.color || enemy.accentColor, enemy.isBoss ? 5 : 3);
        return bullet;
    }

    getPlayerSpawnPointByIndex(index = 0) {
        const preferredPoint = this.arena?.playerSpawns?.[index % Math.max(1, this.arena?.playerSpawns?.length || 1)];
        return findOpenArenaPoint(this.arena, preferredPoint ? [preferredPoint] : [], GAME_CONFIG.player.size);
    }

    getPlayerSpawnPoint(player) {
        const spawnIndex = Number.isFinite(player?.spawnSlot) ? player.spawnSlot : 0;
        return this.getPlayerSpawnPointByIndex(spawnIndex);
    }

    addPlayer(socket, playerName, skinTheme = null, selectedWeapon = null) {
        const maxPlayers = this.isLobbyMode() ? 50 : GAME_CONFIG.maxPlayersPerRoom;
        if (this.players.size >= maxPlayers) return false;

        const spawnIndex = this.players.size;
        const spawnPoint = this.getPlayerSpawnPointByIndex(spawnIndex);
        const authUser = socket.data?.authUserId ? _getUserById(socket.data.authUserId) : null;
        const { defaultSkinId, defaultWeaponId } = _getGameAssetCatalog();
        const unlockedSkins = authUser ? _sanitizeUnlockedSkins(authUser.progression.unlockedSkins) : _sanitizeUnlockedSkins([]);
        const unlockedWeapons = authUser ? _sanitizeUnlockedWeapons(authUser.progression.unlockedWeapons) : _sanitizeUnlockedWeapons([]);
        const requestedSkin = _normalizeSkinTheme(skinTheme);
        const requestedWeapon = _normalizeWeaponType(selectedWeapon);
        const resolvedSkin = unlockedSkins.includes(requestedSkin)
            ? requestedSkin
            : _normalizeSkinTheme(authUser?.progression?.selectedSkin || defaultSkinId);
        const resolvedWeapon = unlockedWeapons.includes(requestedWeapon)
            ? requestedWeapon
            : _normalizeWeaponType(authUser?.progression?.selectedWeapon || defaultWeaponId);

        if (authUser) {
            authUser.progression.selectedSkin = resolvedSkin;
            authUser.progression.unlockedWeapons = unlockedWeapons;
            authUser.progression.selectedWeapon = resolvedWeapon;
            _saveUserStore();
        }

        const player = new ServerPlayer(
            socket.id, playerName, spawnPoint.x, spawnPoint.y,
            resolvedSkin, socket.data?.clientIp,
            authUser ? { userId: authUser.id, username: authUser.username } : null,
            { unlockedWeapons, selectedWeapon: resolvedWeapon }
        );
        player.spawnSlot = spawnIndex;
        this.players.set(socket.id, player);
        if (!this.hostId) this.hostId = socket.id;
        socket.join(this.id);
        return true;
    }

    removePlayer(socketId) {
        this.players.delete(socketId);
        this.endMatchVotes.delete(socketId);
        if (this.shopPhase) this.endMatchVotes.clear();
        if (this.hostId === socketId) {
            this.hostId = this.players.size > 0 ? Array.from(this.players.keys())[0] : null;
        }
        if (this.players.size === 0) this.gameStarted = false;
    }

    addSpectator(socket) { this.spectators.add(socket.id); socket.join(this.id); }
    removeSpectator(socketId) { this.spectators.delete(socketId); }

    awardPersistentProgress(player, waveOverride = this.wave) {
        if (!player || player.matchRewardGranted || !player.accountUserId) return null;
        const user = _getUserById(player.accountUserId);
        if (!user) return null;
        const rewardSummary = _awardProgressionToUser(user, player.score, waveOverride, player.skinTheme);
        player.matchRewardGranted = true;
        player.lastRewardSummary = rewardSummary;
        return rewardSummary;
    }

    resetEndMatchVotes() { this.endMatchVotes.clear(); }

    getEndMatchVoteState() {
        return { votes: this.endMatchVotes.size, required: this.players.size, playerIds: Array.from(this.endMatchVotes) };
    }

    toggleEndMatchVote(socketId) {
        if (!this.shopPhase) return { ok: false, reason: 'End-match voting is only available between waves.' };
        if (!this.players.has(socketId)) return { ok: false, reason: 'Player not found.' };
        if (this.endMatchVotes.has(socketId)) {
            this.endMatchVotes.delete(socketId);
        } else {
            this.endMatchVotes.add(socketId);
        }
        return {
            ok: true,
            hasVoted: this.endMatchVotes.has(socketId),
            completed: this.players.size > 0 && this.endMatchVotes.size === this.players.size,
            voteState: this.getEndMatchVoteState()
        };
    }

    updatePlayerInput(socketId, inputState) {
        if (!this.gameStarted) return;
        const player = this.players.get(socketId);
        if (!player) return;

        player.inputState = { ...inputState };
        const requestedWeaponType = inputState.weaponType && WEAPON_CONFIG[inputState.weaponType]
            ? inputState.weaponType
            : player.currentWeapon;
        if (requestedWeaponType && WEAPON_CONFIG[requestedWeaponType]) player.setCurrentWeapon(requestedWeaponType);

        const now = Date.now();
        player.completeReloadIfReady(now);

        if (!inputState.shooting || this.shopPhase || !player.alive) { player.clearWeaponCharge(); return; }

        const weapon = getWeaponConfig(player.currentWeapon);
        if (!weapon.chargeTime) { player.clearWeaponCharge(); return; }

        if (player.isReloadingWeapon(player.currentWeapon, now) || player.getAmmoForWeapon(player.currentWeapon) <= 0) {
            player.clearWeaponCharge(); return;
        }

        const effectiveCooldown = weapon.cooldown * player.getFireRateMultiplier();
        if (now - player.lastShotTime < effectiveCooldown) { player.clearWeaponCharge(); return; }

        const currentCharge = player.getChargeSnapshot(now);
        if (!currentCharge.active || currentCharge.weaponType !== player.currentWeapon) {
            player.startWeaponCharge(player.currentWeapon, now);
        }
    }

    playerShoot(socketId, weaponType = null) {
        const player = this.players.get(socketId);
        if (!this.gameStarted || !player || !player.alive || this.shopPhase) {
            return { ok: false, reason: 'Cannot fire right now' };
        }

        const selectedWeaponType = getSafeWeaponType(weaponType || player.currentWeapon);
        player.setCurrentWeapon(selectedWeaponType);
        const weapon = getWeaponConfig(player.currentWeapon);
        const now = Date.now();
        player.completeReloadIfReady(now);

        if (player.isReloadingWeapon(player.currentWeapon, now)) {
            player.clearWeaponCharge(); return { ok: false, reason: 'Reloading' };
        }
        if (player.getAmmoForWeapon(player.currentWeapon) <= 0) {
            player.clearWeaponCharge(); return { ok: false, reason: 'Magazine empty' };
        }

        const effectiveCooldown = weapon.cooldown * player.getFireRateMultiplier();
        if (now - player.lastShotTime < effectiveCooldown) return { ok: false, reason: 'Weapon cooling down' };

        const chargeDuration = weapon.chargeTime || 0;
        if (chargeDuration > 0) {
            const currentCharge = player.getChargeSnapshot(now);
            if (!currentCharge.active || currentCharge.weaponType !== player.currentWeapon) {
                return { ok: false, charging: true, weaponType: player.currentWeapon, charge: player.startWeaponCharge(player.currentWeapon, now), player: player.serialize() };
            }
            if (!currentCharge.ready) {
                return { ok: false, charging: true, weaponType: player.currentWeapon, charge: currentCharge, player: player.serialize() };
            }
        }

        player.lastShotTime = now;
        player.clearWeaponCharge();
        player.consumeAmmo(player.currentWeapon, 1);

        const liveAimDirection = new Vector2D(player.inputState.mouseX, player.inputState.mouseY).subtract(player.position);
        if (liveAimDirection.length() > 0.001) player.angle = Math.atan2(liveAimDirection.y, liveAimDirection.x);

        const centerDirection = new Vector2D(Math.cos(player.angle), Math.sin(player.angle));
        const bulletStart = player.position.add(centerDirection.multiply(GAME_CONFIG.player.size + 5));
        const baseDamage = weapon.damage * player.getDamageMultiplier() * player.damageBoost;
        let projectileRange = weapon.range;
        const impactColor = this.getWeaponImpactColor(player.currentWeapon);
        let sniperTarget = null;
        let sniperBlockDistance = weapon.range;
        const usesChargeShotRaycast = weapon.behaviorId === 'charge_shot';

        if (usesChargeShotRaycast) {
            sniperBlockDistance = this.getNearestObstacleRayDistance(bulletStart, centerDirection, weapon.range, weapon.hitRadius || GAME_CONFIG.bullet.size);
            sniperTarget = this.isPvpMode()
                ? this.findPlayerAlongRay(bulletStart, centerDirection, sniperBlockDistance, weapon.hitRadius || GAME_CONFIG.bullet.size, socketId)
                : this.findEnemyAlongRay(bulletStart, centerDirection, sniperBlockDistance, weapon.hitRadius || GAME_CONFIG.bullet.size);

            if (sniperTarget) {
                if (this.isPvpMode()) {
                    this.applyPlayerHit(sniperTarget.playerId, baseDamage, socketId, { weaponType: player.currentWeapon, impactPoint: sniperTarget.hitPoint, scoreAward: 150 });
                } else {
                    this.applyEnemyHit(sniperTarget.enemyId, baseDamage, socketId, sniperTarget.hitPoint);
                }
                projectileRange = Math.max(28, sniperTarget.distance);
                this.createImpactParticles(sniperTarget.hitPoint.x, sniperTarget.hitPoint.y, impactColor, 8);
            } else {
                projectileRange = sniperBlockDistance;
                if (sniperBlockDistance < weapon.range - 1) {
                    const obstacleImpact = bulletStart.add(centerDirection.multiply(sniperBlockDistance));
                    this.createImpactParticles(obstacleImpact.x, obstacleImpact.y, impactColor, 7);
                }
            }
        }

        for (let i = 0; i < weapon.pelletCount; i++) {
            const spreadAngle = (Math.random() - 0.5) * weapon.spread;
            const pelletAngle = player.angle + spreadAngle;
            const direction = new Vector2D(Math.cos(pelletAngle), Math.sin(pelletAngle));
            const bullet = new ServerBullet(
                uuidv4(), bulletStart.x, bulletStart.y,
                direction.x * weapon.speed, direction.y * weapon.speed,
                socketId, usesChargeShotRaycast ? 0 : baseDamage,
                usesChargeShotRaycast ? projectileRange : weapon.range,
                player.currentWeapon
            );
            if (usesChargeShotRaycast) { bullet.canHitEnemies = false; bullet.canHitPlayers = false; }
            this.bullets.set(bullet.id, bullet);
        }

        for (let i = 0; i < 3; i++) {
            const particle = new ServerParticle(
                uuidv4(), bulletStart.x, bulletStart.y,
                centerDirection.x * 50 + (Math.random() - 0.5) * 100,
                centerDirection.y * 50 + (Math.random() - 0.5) * 100,
                '#ffff00', GAME_CONFIG.particles.muzzleLifetime, Math.random() * 3 + 1
            );
            this.particles.set(particle.id, particle);
        }

        return { ok: true, weaponType: player.currentWeapon, player: player.serialize() };
    }

    throwGrenade(socketId, options = {}) {
        const player = this.players.get(socketId);
        if (!this.gameStarted || !player || !player.alive || this.shopPhase) {
            return { ok: false, reason: 'Cannot throw a grenade right now' };
        }
        const now = Date.now();
        if (!player.canThrowGrenade(now)) {
            const grenadeState = player.getGrenadeSnapshot(now);
            if (grenadeState.count <= 0) return { ok: false, reason: 'Out of grenades', player: player.serialize() };
            return { ok: false, reason: `Grenade cooling down ${(grenadeState.remainingCooldownMs / 1000).toFixed(1)}s`, player: player.serialize() };
        }

        const aimDirection = new Vector2D(player.inputState.mouseX, player.inputState.mouseY).subtract(player.position);
        const throwDirection = aimDirection.length() > 0.001
            ? aimDirection.normalize()
            : new Vector2D(Math.cos(player.angle), Math.sin(player.angle));
        const rawChargeRatio = Number(options?.chargeRatio);
        const chargeRatio = Math.max(0, Math.min(1, Number.isFinite(rawChargeRatio) ? rawChargeRatio : 0));
        const throwScale = GAME_CONFIG.grenade.minThrowScale + ((GAME_CONFIG.grenade.maxThrowScale - GAME_CONFIG.grenade.minThrowScale) * chargeRatio);
        const spawnPoint = player.position.add(throwDirection.multiply(GAME_CONFIG.player.size + 12));

        player.consumeGrenade(now);
        const grenade = new ServerGrenade(
            uuidv4(), spawnPoint.x, spawnPoint.y,
            throwDirection.x * GAME_CONFIG.grenade.speed * throwScale,
            throwDirection.y * GAME_CONFIG.grenade.speed * throwScale,
            socketId
        );
        this.grenades.set(grenade.id, grenade);
        return { ok: true, chargeRatio, throwScale, player: player.serialize(), grenade: grenade.serialize() };
    }

    detonateGrenade(grenade) {
        if (!grenade) return;
        this.grenades.delete(grenade.id);

        const impactedEnemyIds = [];
        for (const [enemyId, enemy] of this.enemies) {
            const distance = grenade.position.distance(enemy.position);
            if (distance > grenade.radius + (enemy.size || GAME_CONFIG.enemy.size)) continue;
            const proximity = Math.max(0, 1 - (distance / Math.max(1, grenade.radius)));
            const damage = Math.max(20, Math.round(grenade.damage * (0.35 + proximity * 0.65)));
            this.applyEnemyHit(enemyId, damage, grenade.ownerId, grenade.position);
            impactedEnemyIds.push(enemyId);
        }

        const impactedPlayerIds = [];
        if (this.isPvpMode()) {
            for (const [playerId, player] of this.players) {
                if (!player.alive) continue;
                const distance = grenade.position.distance(player.position);
                if (distance > grenade.radius + GAME_CONFIG.player.size) continue;
                const proximity = Math.max(0, 1 - (distance / Math.max(1, grenade.radius)));
                const damage = Math.max(25, Math.round(grenade.damage * (0.25 + proximity * 0.75)));
                this.applyPlayerHit(playerId, damage, grenade.ownerId, { weaponType: 'grenade', impactPoint: grenade.position, scoreAward: 125 });
                impactedPlayerIds.push(playerId);
            }
        }

        this.createImpactParticles(grenade.position.x, grenade.position.y, '#7fd8ff', 10);
        this.createImpactParticles(grenade.position.x, grenade.position.y, '#ff9f43', 14);
        this.createBloodParticles(grenade.position.x, grenade.position.y, 6);

        _io.to(this.id).emit('grenadeExploded', {
            x: grenade.position.x, y: grenade.position.y,
            radius: grenade.radius, ownerId: grenade.ownerId,
            impactedEnemyIds, impactedPlayerIds
        });
    }

    spawnPowerUp() {
        const shuffledSpawns = Array.isArray(this.arena?.powerUpSpawns)
            ? [...this.arena.powerUpSpawns].sort(() => Math.random() - 0.5)
            : [];
        const openPoint = findOpenArenaPoint(this.arena, shuffledSpawns, GAME_CONFIG.powerup.size + 14);
        const types = ['health', 'speed', 'damage', 'shield', 'grenade'];
        const type = types[Math.floor(Math.random() * types.length)];
        const powerUp = new ServerPowerUp(uuidv4(), openPoint.x, openPoint.y, type);
        this.powerUps.set(powerUp.id, powerUp);
    }

    createBloodParticles(x, y, count = 5) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 150 + 50;
            const particle = new ServerParticle(uuidv4(), x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, '#ff0000', GAME_CONFIG.particles.bloodLifetime, Math.random() * 4 + 2);
            this.particles.set(particle.id, particle);
        }
    }

    createImpactParticles(x, y, color = '#ffffff', count = 4) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 140 + 30;
            const particle = new ServerParticle(uuidv4(), x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, 260, Math.random() * 3 + 1.5);
            this.particles.set(particle.id, particle);
        }
    }

    getWeaponImpactColor(weaponType) {
        return WEAPON_CONFIG[weaponType]?.impactColor || this.arena?.palette?.wallTrim || '#ffffff';
    }

    getRayObstacleIntersectionDistance(origin, direction, obstacle, padding = 0) {
        if (!obstacle?.solid) return null;
        const minX = obstacle.x - padding, maxX = obstacle.x + obstacle.width + padding;
        const minY = obstacle.y - padding, maxY = obstacle.y + obstacle.height + padding;
        let tMin = 0, tMax = Infinity;

        if (Math.abs(direction.x) < 0.00001) {
            if (origin.x < minX || origin.x > maxX) return null;
        } else {
            const tx1 = (minX - origin.x) / direction.x, tx2 = (maxX - origin.x) / direction.x;
            tMin = Math.max(tMin, Math.min(tx1, tx2));
            tMax = Math.min(tMax, Math.max(tx1, tx2));
        }

        if (Math.abs(direction.y) < 0.00001) {
            if (origin.y < minY || origin.y > maxY) return null;
        } else {
            const ty1 = (minY - origin.y) / direction.y, ty2 = (maxY - origin.y) / direction.y;
            tMin = Math.max(tMin, Math.min(ty1, ty2));
            tMax = Math.min(tMax, Math.max(ty1, ty2));
        }

        if (tMax < tMin || tMax < 0) return null;
        return Math.max(0, tMin);
    }

    getNearestObstacleRayDistance(origin, direction, maxRange, padding = 0) {
        let nearest = maxRange;
        for (const obstacle of (this.arena?.obstacles || [])) {
            const hitDistance = this.getRayObstacleIntersectionDistance(origin, direction, obstacle, padding);
            if (hitDistance !== null && hitDistance < nearest) nearest = hitDistance;
        }
        return nearest;
    }

    findEnemyAlongRay(origin, direction, maxRange, hitPadding = 0) {
        let closestHit = null;
        for (const [enemyId, enemy] of this.enemies) {
            const toEnemy = enemy.position.subtract(origin);
            const projectedDistance = (toEnemy.x * direction.x) + (toEnemy.y * direction.y);
            if (projectedDistance < 0 || projectedDistance > maxRange) continue;
            const closestPoint = origin.add(direction.multiply(projectedDistance));
            const missDistance = enemy.position.distance(closestPoint);
            if (missDistance > (enemy.size || GAME_CONFIG.enemy.size) + hitPadding) continue;
            if (!closestHit || projectedDistance < closestHit.distance) closestHit = { enemyId, distance: projectedDistance, hitPoint: closestPoint };
        }
        return closestHit;
    }

    findPlayerAlongRay(origin, direction, maxRange, hitPadding = 0, excludePlayerId = null) {
        let closestHit = null;
        for (const [playerId, player] of this.players) {
            if (!player.alive || playerId === excludePlayerId) continue;
            const toPlayer = player.position.subtract(origin);
            const projectedDistance = (toPlayer.x * direction.x) + (toPlayer.y * direction.y);
            if (projectedDistance < 0 || projectedDistance > maxRange) continue;
            const closestPoint = origin.add(direction.multiply(projectedDistance));
            if (player.position.distance(closestPoint) > GAME_CONFIG.player.size + hitPadding) continue;
            if (!closestHit || projectedDistance < closestHit.distance) closestHit = { playerId, distance: projectedDistance, hitPoint: closestPoint };
        }
        return closestHit;
    }

    applyEnemyHit(enemyId, damage, ownerId, impactPoint = null) {
        const enemy = this.enemies.get(enemyId);
        if (!enemy) return { ok: false, reason: 'Enemy not found' };
        enemy.takeDamage(damage);
        this.createBloodParticles(impactPoint?.x ?? enemy.position.x, impactPoint?.y ?? enemy.position.y, enemy.isBoss ? 6 : 3);

        if (enemy.isDead()) {
            const shooter = this.players.get(ownerId);
            if (shooter) {
                shooter.score += enemy.rewardScore || 100;
                shooter.addMoney(enemy.rewardMoney || (30 + this.wave * 5));
            }
            this.createBloodParticles(enemy.position.x, enemy.position.y, enemy.isBoss ? 16 : 8);
            if (enemy.isBoss) this.createImpactParticles(enemy.position.x, enemy.position.y, enemy.accentColor || '#ffd166', 10);
            this.enemies.delete(enemyId);
            return { ok: true, killed: true };
        }
        return { ok: true, killed: false };
    }

    applyPlayerHit(playerId, damage, attackerId, options = {}) {
        if (!this.gameStarted) return { ok: false, reason: 'Match not started' };
        const victim = this.players.get(playerId);
        if (!victim || !victim.alive) return { ok: false, reason: 'Player not found' };
        const safeDamage = Math.max(0, Number(damage) || 0);
        if (safeDamage <= 0) return { ok: false, reason: 'No damage' };

        const impactPoint = options?.impactPoint || victim.position;
        victim.takeDamage(safeDamage);
        this.createBloodParticles(impactPoint?.x ?? victim.position.x, impactPoint?.y ?? victim.position.y, 3);
        if (victim.alive) return { ok: true, killed: false };

        const now = Date.now();
        victim.deaths = Math.max(0, Math.floor(victim.deaths || 0)) + 1;
        if (this.isPvpMode()) victim.respawnAt = now + (this.pvpState.respawnDelayMs || PVP_CONFIG.respawnDelayMs);

        const killer = attackerId ? this.players.get(attackerId) : null;
        const weaponType = typeof options?.weaponType === 'string' && options.weaponType ? options.weaponType : null;
        if (killer && killer.id !== victim.id) {
            killer.kills = Math.max(0, Math.floor(killer.kills || 0)) + 1;
            killer.score += Number.isFinite(options?.scoreAward) ? options.scoreAward : 100;
        }

        _io.to(this.id).emit('killFeed', { killerId: killer?.id || null, killerName: killer?.name || null, victimId: victim.id, victimName: victim.name, weaponType });

        if (this.isPvpMode() && killer && killer.id !== victim.id && killer.kills >= this.pvpState.killLimit) {
            this.endPvpMatch({ reason: 'kill_limit', winnerId: killer.id });
        }
        return { ok: true, killed: true };
    }

    getPvpScoreboard() {
        return Array.from(this.players.values())
            .map((player) => ({ id: player.id, name: player.name, kills: Math.max(0, Math.floor(player.kills || 0)), deaths: Math.max(0, Math.floor(player.deaths || 0)), score: Math.max(0, Math.floor(player.score || 0)) }))
            .sort((l, r) => r.kills !== l.kills ? r.kills - l.kills : l.deaths !== r.deaths ? l.deaths - r.deaths : r.score !== l.score ? r.score - l.score : String(l.name || '').localeCompare(String(r.name || '')));
    }

    endPvpMatch({ reason = 'time_limit', winnerId = null } = {}) {
        if (!this.gameStarted) return;
        this.gameStarted = false;
        this.shopPhase = false;
        this.shopEndTime = 0;
        this.resetEndMatchVotes();

        const scoreboard = this.getPvpScoreboard();
        const resolvedWinnerId = winnerId || scoreboard[0]?.id || null;
        const now = Date.now();

        for (const player of this.players.values()) {
            const rewardSummary = this.awardPersistentProgress(player, 1);
            if (rewardSummary?.profile) _io.to(player.id).emit('profileUpdated', rewardSummary.profile);
        }

        _io.to(this.id).emit('matchEnded', { mode: this.mode, reason, winnerId: resolvedWinnerId, scoreboard, match: this.getMatchState(now) });
        _emitRoomState(this);
        _emitRoomList();
    }

    requestReload(socketId, weaponType = null) {
        const player = this.players.get(socketId);
        if (!player) return { ok: false, reason: 'Player not found' };
        if (!this.gameStarted) return { ok: false, reason: 'Match not started' };
        if (this.shopPhase) return { ok: false, reason: 'Weapons are topped off during armory break' };
        const selectedWeaponType = getSafeWeaponType(weaponType || player.currentWeapon);
        player.setCurrentWeapon(selectedWeaponType);
        return player.startReload(selectedWeaponType);
    }

    update() {
        if (!this.gameStarted || this.players.size === 0) return;
        const now = Date.now();
        const deltaTime = (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;

        for (const player of this.players.values()) player.update(deltaTime, this.arena);

        // Lobby: skip all combat — just move players
        if (this.isLobbyMode()) return;

        if (this.isPvpMode()) {
            for (const player of this.players.values()) {
                if (!player.alive && player.respawnAt && now >= player.respawnAt) {
                    const shuffledSpawns = Array.isArray(this.arena?.playerSpawns) ? [...this.arena.playerSpawns].sort(() => Math.random() - 0.5) : [];
                    player.respawn(findOpenArenaPoint(this.arena, shuffledSpawns, GAME_CONFIG.player.size));
                }
            }
        }

        for (const [grenadeId, grenade] of this.grenades) {
            grenade.update(deltaTime, this.arena);
            if (grenade.isExpired()) { this.detonateGrenade(grenade); continue; }
        }

        for (const [bulletId, bullet] of this.bullets) {
            bullet.update(deltaTime);
            if (bullet.isExpired()) { this.bullets.delete(bulletId); continue; }

            const hitObstacle = this.arena?.obstacles?.find((obstacle) => isCircleCollidingWithObstacle(bullet.position, bullet.size + 1, obstacle));
            if (hitObstacle) {
                this.bullets.delete(bulletId);
                const impactColor = bullet.impactColor || WEAPON_CONFIG[bullet.weaponType]?.impactColor || this.arena?.palette?.wallTrim || '#ffffff';
                this.createImpactParticles(bullet.position.x, bullet.position.y, impactColor, bullet.style === 'boss-bolt' ? 7 : bullet.weaponType === 'sniper' ? 7 : 5);
                continue;
            }

            if (bullet.hostile) {
                for (const player of this.players.values()) {
                    if (!player.alive) continue;
                    if (bullet.position.distance(player.position) < bullet.size + GAME_CONFIG.player.size) {
                        this.bullets.delete(bulletId);
                        player.takeDamage(bullet.damage);
                        this.createImpactParticles(bullet.position.x, bullet.position.y, bullet.color || '#ff9fb7', 4);
                        break;
                    }
                }
                continue;
            }

            if (this.isPvpMode() && bullet.canHitPlayers !== false) {
                for (const player of this.players.values()) {
                    if (!player.alive || player.id === bullet.ownerId) continue;
                    if (bullet.position.distance(player.position) < bullet.size + GAME_CONFIG.player.size) {
                        this.bullets.delete(bulletId);
                        this.applyPlayerHit(player.id, bullet.damage, bullet.ownerId, { weaponType: bullet.weaponType, impactPoint: bullet.position });
                        this.createImpactParticles(bullet.position.x, bullet.position.y, bullet.color || '#9cecff', 5);
                        break;
                    }
                }
                if (!this.bullets.has(bulletId)) continue;
            }

            for (const [enemyId, enemy] of this.enemies) {
                if (bullet.canHitEnemies === false) break;
                if (bullet.position.distance(enemy.position) < bullet.size + (enemy.size || GAME_CONFIG.enemy.size)) {
                    this.bullets.delete(bulletId);
                    this.applyEnemyHit(enemyId, bullet.damage, bullet.ownerId, bullet.position);
                    break;
                }
            }
        }

        for (const [particleId, particle] of this.particles) {
            particle.update(deltaTime);
            if (particle.isExpired()) this.particles.delete(particleId);
        }

        if (this.particles.size > GAME_CONFIG.particles.maxParticles) {
            const particleArray = Array.from(this.particles.entries());
            particleArray.sort((a, b) => b[1].age - a[1].age);
            for (let i = GAME_CONFIG.particles.maxParticles; i < particleArray.length; i++) this.particles.delete(particleArray[i][0]);
        }

        for (const [powerUpId, powerUp] of this.powerUps) {
            powerUp.update(deltaTime);
            if (powerUp.isExpired()) { this.powerUps.delete(powerUpId); continue; }
            for (const player of this.players.values()) {
                if (!player.alive) continue;
                if (powerUp.position.distance(player.position) < GAME_CONFIG.powerup.size + GAME_CONFIG.player.size) {
                    player.applyPowerUp(powerUp.type);
                    powerUp.collect();
                    for (let i = 0; i < 6; i++) {
                        const angle = (Math.PI * 2 * i) / 6;
                        const particle = new ServerParticle(uuidv4(), powerUp.position.x, powerUp.position.y, Math.cos(angle) * 100, Math.sin(angle) * 100, this.getPowerUpColor(powerUp.type), 300, 3);
                        this.particles.set(particle.id, particle);
                    }
                    break;
                }
            }
        }

        if (this.isPvpMode()) {
            if (this.pvpState.endsAt && now >= this.pvpState.endsAt) this.endPvpMatch({ reason: 'time_limit' });
            return;
        }

        if (this.shopPhase) {
            if (now >= this.shopEndTime) { this.shopPhase = false; this.startNextWave(); }
            return;
        }

        for (const enemy of this.enemies.values()) {
            enemy.update(deltaTime, this.players, this.arena);
            const shots = enemy.getAttackActions(this.players, now);
            shots.forEach((shot) => this.spawnEnemyProjectile(enemy, shot));
        }

        this.enemySpawnTimer += deltaTime * 1000;
        if (this.enemySpawnTimer > this.getCurrentSpawnRate() && this.enemiesThisWave < this.maxEnemiesPerWave) {
            this.spawnEnemy();
            this.enemySpawnTimer = 0;
            this.enemiesThisWave++;
        }

        this.powerUpSpawnTimer += deltaTime * 1000;
        if (this.powerUpSpawnTimer > GAME_CONFIG.powerup.spawnRate) { this.spawnPowerUp(); this.powerUpSpawnTimer = 0; }

        for (const enemy of this.enemies.values()) {
            for (const player of this.players.values()) {
                if (player.alive && enemy.position.distance(player.position) < (enemy.size || GAME_CONFIG.enemy.size) + GAME_CONFIG.player.size) {
                    player.takeDamage((enemy.contactDamage || GAME_CONFIG.enemy.damage) * deltaTime);
                }
            }
        }

        if (this.enemiesThisWave >= this.maxEnemiesPerWave && this.enemies.size === 0) this.startShopPhase();
    }

    getPowerUpColor(type) {
        switch (type) {
            case 'health': return '#00ff00';
            case 'speed': return '#00ffff';
            case 'damage': return '#ff8800';
            case 'shield': return '#8800ff';
            case 'grenade': return '#ffad49';
            default: return '#ffffff';
        }
    }

    spawnEnemy() {
        const enemyType = this.waveSpawnQueue.length > 0 ? this.waveSpawnQueue.shift() : 'grunt';
        const archetype = getEnemyArchetype(enemyType);
        const shuffledSpawns = Array.isArray(this.arena?.enemySpawns) ? [...this.arena.enemySpawns].sort(() => Math.random() - 0.5) : [];
        const spawnPoint = findOpenArenaPoint(this.arena, shuffledSpawns, archetype.size + 8)
            || createArenaSpawn(Math.random() * GAME_CONFIG.canvas.width, -archetype.size);

        const { enemySprites, defaultEnemySpriteId } = _getGameAssetCatalog();
        const enemyIds = enemySprites.map((entry) => entry.id);
        const spriteTheme = enemyIds.length > 0 ? enemyIds[Math.floor(Math.random() * enemyIds.length)] : defaultEnemySpriteId;
        const enemy = new ServerEnemy(uuidv4(), spawnPoint.x, spawnPoint.y, this.wave, spriteTheme, enemyType);
        this.enemies.set(enemy.id, enemy);
        return enemy;
    }

    startNextWave() {
        this.wave++;
        this.enemiesThisWave = 0;
        this.shopPhase = false;
        this.resetEndMatchVotes();
        this.enemySpawnTimer = 0;
        this.waveStartTime = Date.now();
        this.configureWavePlan();
        this.spawnWaveFrontline(1);
        console.log(`Room ${this.id}: Starting ${this.waveProfile?.label || `Wave ${this.wave}`} with ${this.maxEnemiesPerWave} enemies`);
        this.emitWaveStart();
    }

    startShopPhase() {
        this.shopPhase = true;
        this.shopEndTime = Date.now() + this.shopDurationMs;
        this.resetEndMatchVotes();
        const waveReward = 75 + (this.wave * 25);
        this.grenades.clear();
        for (const player of this.players.values()) {
            player.cancelReload();
            player.clearWeaponCharge();
            player.refillAllWeapons();
            player.refillGrenades();
            player.addMoney(waveReward);
        }
        _io.to(this.id).emit('shopStarted', { wave: this.wave, endsAt: this.shopEndTime, durationMs: this.shopDurationMs });
    }

    purchaseUpgrade(socketId, upgradeType) {
        if (!this.shopPhase) return { ok: false, reason: 'Shop is closed' };
        const player = this.players.get(socketId);
        if (!player) return { ok: false, reason: 'Player not found' };
        const normalizedUpgradeType = typeof upgradeType === 'string' ? upgradeType.trim() : '';
        if (!normalizedUpgradeType || !UPGRADE_CONFIG[normalizedUpgradeType]) return { ok: false, reason: 'Unknown upgrade' };

        const config = UPGRADE_CONFIG[normalizedUpgradeType];
        const level = Number.isFinite(player.upgrades?.[normalizedUpgradeType]) ? player.upgrades[normalizedUpgradeType] : 0;
        const cost = getUpgradeCost(normalizedUpgradeType, level, UPGRADE_CONFIG);

        if (level >= config.maxLevel) return { ok: false, reason: 'Upgrade already maxed' };
        if (player.money < cost) return { ok: false, reason: `Need $${cost} for this upgrade` };
        if (!player.canBuyUpgrade(normalizedUpgradeType)) return { ok: false, reason: 'Cannot buy upgrade right now' };

        player.buyUpgrade(normalizedUpgradeType);
        return { ok: true, upgradeType: normalizedUpgradeType, player: player.serialize() };
    }

    applyLobbyAppearance(socketId, skinTheme, weaponType) {
        if (!this.isLobbyMode()) return;
        const player = this.players.get(socketId);
        if (!player) return;
        if (skinTheme) player.skinTheme = _normalizeSkinTheme(skinTheme);
        if (weaponType) player.currentWeapon = _normalizeWeaponType(weaponType);
    }

    startGame() {
        if (this.isLobbyMode()) return; // lobby is always "started", never formally begun
        this.arena = generateArenaDefinition();
        const now = Date.now();
        this.gameStarted = true;
        this.gameStartTime = now;
        this.lastUpdateTime = now;
        this.enemySpawnTimer = 0;
        this.powerUpSpawnTimer = 0;
        this.wave = 1;
        this.enemiesThisWave = 0;
        this.waveStartTime = now;
        this.shopPhase = false;
        this.shopEndTime = 0;
        this.resetEndMatchVotes();
        this.bullets.clear();
        this.grenades.clear();
        this.enemies.clear();
        this.particles.clear();
        this.powerUps.clear();

        let spawnIndex = 0;
        for (const player of this.players.values()) {
            player.spawnSlot = spawnIndex;
            player.prepareForMatch(this.getPlayerSpawnPointByIndex(spawnIndex));
            spawnIndex++;
        }
        _io.to(this.id).emit('arenaState', this.getArenaState());

        if (this.isPvpMode()) {
            this.maxEnemiesPerWave = 0;
            this.waveSpawnQueue = [];
            this.waveProfile = { bossWave: false, label: 'Free For All', bossType: null, summary: [] };
            this.pvpState.startedAt = now;
            this.pvpState.endsAt = now + this.pvpState.timeLimitMs;
            return;
        }

        this.configureWavePlan();
        this.spawnWaveFrontline(1);
    }

    endGame() {
        if (!this.gameStarted) return;
        this.gameStarted = false;

        for (const player of this.players.values()) {
            if (player.score > 0) {
                const rank = _addToLeaderboard(player.accountUsername || player.name, player.score, this.wave, { accountUserId: player.accountUserId });
                console.log(`Player ${player.name} finished with score ${player.score}, wave ${this.wave}, rank ${rank}`);
            }
            const rewardSummary = this.awardPersistentProgress(player, this.wave);
            if (rewardSummary?.profile) _io.to(player.id).emit('profileUpdated', rewardSummary.profile);
        }

        _io.to(this.id).emit('gameEnded', { finalWave: this.wave, leaderboard: _getLeaderboard() });
    }

    getGameState() {
        return {
            mode: this.mode,
            match: this.getMatchState(),
            players: Array.from(this.players.values()).map((p) => p.serialize()),
            bullets: Array.from(this.bullets.values()).map((b) => b.serialize()),
            grenades: Array.from(this.grenades.values()).map((g) => g.serialize()),
            enemies: Array.from(this.enemies.values()).map((e) => e.serialize()),
            particles: Array.from(this.particles.values()).map((p) => p.serialize()),
            powerUps: Array.from(this.powerUps.values()).map((p) => p.serialize()),
            wave: this.wave,
            gameStarted: this.gameStarted,
            shop: { active: this.shopPhase, endsAt: this.shopEndTime, durationMs: this.shopDurationMs, endVote: this.getEndMatchVoteState() },
            difficulty: { enemiesPerWave: this.maxEnemiesPerWave, spawnRate: this.getCurrentSpawnRate(), enemiesRemaining: this.waveSpawnQueue.length, enemiesAlive: this.enemies.size },
            waveInfo: this.getWaveInfo()
        };
    }

    getRoomState() {
        return {
            id: this.id,
            name: this.name,
            mode: this.mode,
            matchSettings: this.isPvpMode() ? { killLimit: this.pvpState.killLimit, timeLimitMs: this.pvpState.timeLimitMs } : null,
            arenaName: this.arena?.name || null,
            arenaThemeId: this.arena?.themeId || null,
            hostId: this.hostId,
            gameStarted: this.gameStarted,
            locked: this.locked,
            playerCount: this.players.size,
            spectatorCount: this.spectators.size,
            maxPlayers: GAME_CONFIG.maxPlayersPerRoom,
            players: Array.from(this.players.values()).map((player) => ({
                id: player.id, name: player.name, alive: player.alive, score: player.score,
                skinTheme: player.skinTheme, selectedWeapon: player.selectedWeapon, isHost: player.id === this.hostId
            }))
        };
    }
}

module.exports = { GameRoom, initGameRoomDeps };
