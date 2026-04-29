const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const ASSETS_ROOT = path.join(__dirname, 'assets');
const MAX_ASSET_UPLOAD_BYTES = 5 * 1024 * 1024;
const DATA_ROOT = path.join(__dirname, 'data');
const DATA_CATALOG_ROOT = path.join(DATA_ROOT, 'catalog');
const USERS_DB_PATH = path.join(DATA_ROOT, 'users.json');
const AUTH_SECRET_PATH = path.join(DATA_ROOT, 'auth-secret.txt');
const GAME_ASSET_METADATA_PATH = path.join(DATA_ROOT, 'game-asset-metadata.json');
const LEADERBOARD_DB_PATH = path.join(DATA_ROOT, 'leaderboard.json');
const WEAPON_CATALOG_PATH = path.join(DATA_CATALOG_ROOT, 'weapons.json');
const AUTH_COOKIE_NAME = 'website_shooter_auth';
const TOKEN_LIFETIME_MS = 1000 * 60 * 60 * 24 * 30;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const ADMIN_PAGE_PATHS = new Set([
    '/admin.html',
    '/asset-admin.html',
    '/progress-admin.html',
    '/sprite-forge.html',
    '/sprite-builder.html',
    '/spectator.html'
]);

app.use(express.json());
app.use((req, res, next) => {
    if (!ADMIN_PAGE_PATHS.has(req.path)) {
        return next();
    }

    const user = getAuthenticatedUserFromRequest(req);
    if (!user) {
        return res.redirect('/?admin=required');
    }

    if (!isUserAdmin(user)) {
        return res.redirect('/?admin=forbidden');
    }

    req.user = user;
    next();
});

// Serve static files with no-store in local development so browser clients pick up gameplay fixes immediately.
app.use(express.static(path.join(__dirname), {
    etag: false,
    maxAge: 0,
    setHeaders: (res, filePath) => {
        if (/\.(html|js|css|svg)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Game configuration
const GAME_CONFIG = {
    canvas: {
        width: 1800,
        height: 1200
    },
    player: {
        speed: 200,
        size: 15,
        health: 100,
        maxHealth: 100
    },
    bullet: {
        speed: 400,
        size: 3,
        damage: 25,
        lifetime: 3000 // 3 seconds
    },
    grenade: {
        maxCount: 2,
        cooldown: 2200,
        fuse: 1200,
        speed: 560,
        minThrowScale: 0.35,
        maxThrowScale: 1.1,
        chargeTimeMs: 900,
        size: 7,
        damage: 220,
        radius: 135,
        bounce: 0.42,
        friction: 0.975
    },
    enemy: {
        speed: 80,
        size: 12,
        health: 50,
        maxHealth: 50,
        spawnRate: 3000,
        damage: 20,
        speedIncrease: 15, // Speed increase per wave
        healthIncrease: 25, // Health increase per wave
        spawnRateDecrease: 200 // Spawn rate decrease per wave (faster spawning)
    },
    powerup: {
        spawnRate: 8000, // 8 seconds
        lifetime: 15000, // 15 seconds before despawn
        size: 8
    },
    particles: {
        bloodLifetime: 1000, // 1 second
        muzzleLifetime: 150, // 0.15 seconds
        maxParticles: 200
    },
    maxPlayersPerRoom: 4,
    tickRate: 60 // Server updates per second
};

const ROOM_MODES = {
    PVE: 'pve',
    PVP_FFA: 'pvp_ffa'
};

const PVP_CONFIG = {
    killLimit: 30,
    timeLimitMs: 10 * 60 * 1000,
    respawnDelayMs: 2400
};

const BOSS_WAVE_INTERVAL = 5;

const ENEMY_ARCHETYPES = {
    grunt: {
        id: 'grunt',
        label: 'Grunt',
        healthMultiplier: 1,
        speedMultiplier: 1,
        contactDamageMultiplier: 1,
        size: 12,
        attackMode: 'melee',
        rewardScore: 100,
        rewardMoneyMultiplier: 1,
        accentColor: '#ff8b78',
        minimapColor: '#ff8b78',
        renderScale: 2.3,
        minWave: 1
    },
    scout: {
        id: 'scout',
        label: 'Scout',
        healthMultiplier: 0.72,
        speedMultiplier: 1.65,
        contactDamageMultiplier: 0.72,
        size: 10,
        attackMode: 'melee',
        rewardScore: 90,
        rewardMoneyMultiplier: 0.95,
        accentColor: '#70f0ff',
        minimapColor: '#70f0ff',
        renderScale: 2.05,
        minWave: 2
    },
    brute: {
        id: 'brute',
        label: 'Brute',
        healthMultiplier: 2.8,
        speedMultiplier: 0.74,
        contactDamageMultiplier: 1.85,
        size: 18,
        attackMode: 'melee',
        rewardScore: 180,
        rewardMoneyMultiplier: 1.6,
        accentColor: '#ffb36b',
        minimapColor: '#ffb36b',
        renderScale: 2.55,
        minWave: 3
    },
    marksman: {
        id: 'marksman',
        label: 'Marksman',
        healthMultiplier: 1.18,
        speedMultiplier: 0.94,
        contactDamageMultiplier: 0.65,
        size: 12,
        attackMode: 'ranged',
        attackRange: 430,
        preferredRange: 250,
        attackCooldown: 1450,
        projectileSpeed: 560,
        projectileDamage: 16,
        projectileSize: 4,
        projectileColor: '#ff7ab6',
        projectileImpactColor: '#ffd4e6',
        rewardScore: 145,
        rewardMoneyMultiplier: 1.3,
        accentColor: '#ff7ab6',
        minimapColor: '#ff7ab6',
        renderScale: 2.25,
        minWave: 4
    },
    boss: {
        id: 'boss',
        label: 'Overseer',
        healthMultiplier: 9,
        speedMultiplier: 0.95,
        contactDamageMultiplier: 2.4,
        size: 28,
        attackMode: 'ranged',
        attackRange: 560,
        preferredRange: 300,
        attackCooldown: 1180,
        projectileSpeed: 680,
        projectileDamage: 22,
        projectileSize: 5,
        projectileColor: '#ffd166',
        projectileImpactColor: '#fff0c4',
        rewardScore: 800,
        rewardMoneyMultiplier: 4.25,
        accentColor: '#ffd166',
        minimapColor: '#ffd166',
        renderScale: 2.95,
        minWave: 5,
        isBoss: true,
        rangedBurstCount: 3,
        rangedBurstSpread: 0.2
    }
};

function getEnemyArchetype(enemyType = 'grunt') {
    return ENEMY_ARCHETYPES[enemyType] || ENEMY_ARCHETYPES.grunt;
}

function getBaseWaveEnemyCount(wave, playerCount = 1) {
    const safeWave = Math.max(1, Number(wave) || 1);
    const safePlayers = Math.max(1, Math.round(Number(playerCount) || 1));
    return Math.min(5 + Math.max(0, safeWave - 1) * 3 + Math.max(0, safePlayers - 1), 32);
}

function summarizeEnemyQueue(queue = []) {
    const counts = new Map();
    queue.forEach((enemyType) => {
        counts.set(enemyType, (counts.get(enemyType) || 0) + 1);
    });

    return Array.from(counts.entries()).map(([enemyType, count]) => ({
        type: enemyType,
        label: getEnemyArchetype(enemyType).label,
        count
    }));
}

function buildWaveSpawnProfile(wave, playerCount = 1) {
    const safeWave = Math.max(1, Math.round(Number(wave) || 1));
    const safePlayers = Math.max(1, Math.round(Number(playerCount) || 1));
    const bossWave = safeWave % BOSS_WAVE_INTERVAL === 0;

    if (bossWave) {
        const escorts = [];
        const escortCount = Math.min(8, 2 + safePlayers + Math.floor(safeWave / 6));

        for (let i = 0; i < escortCount; i++) {
            if (safeWave >= 10 && i % 4 === 3) {
                escorts.push('marksman');
            } else if (safeWave >= 7 && i % 3 === 2) {
                escorts.push('brute');
            } else if (safeWave >= 6 && i % 2 === 1) {
                escorts.push('scout');
            } else {
                escorts.push('grunt');
            }
        }

        const queue = ['boss', ...escorts.sort(() => Math.random() - 0.5)];
        return {
            bossWave: true,
            label: `Boss Wave ${safeWave}`,
            bossType: 'boss',
            queue,
            summary: summarizeEnemyQueue(queue)
        };
    }

    const totalEnemies = getBaseWaveEnemyCount(safeWave, safePlayers);
    const queue = [];
    let brutes = safeWave >= 3 ? Math.min(1 + Math.floor((safeWave - 3) / 3), Math.floor(totalEnemies * 0.2)) : 0;
    let marksmen = safeWave >= 4 ? Math.min(1 + Math.floor((safeWave - 4) / 3), Math.floor(totalEnemies * 0.18)) : 0;
    let scouts = safeWave >= 2 ? Math.min(1 + Math.floor((safeWave - 2) / 2), Math.floor(totalEnemies * 0.28)) : 0;

    const specialCount = brutes + marksmen + scouts;
    if (specialCount > totalEnemies) {
        const overflow = specialCount - totalEnemies;
        scouts = Math.max(0, scouts - overflow);
    }

    for (let i = 0; i < brutes; i++) queue.push('brute');
    for (let i = 0; i < marksmen; i++) queue.push('marksman');
    for (let i = 0; i < scouts; i++) queue.push('scout');
    while (queue.length < totalEnemies) {
        queue.push('grunt');
    }

    const shuffledQueue = queue.sort(() => Math.random() - 0.5);
    return {
        bossWave: false,
        label: `Wave ${safeWave}`,
        bossType: null,
        queue: shuffledQueue,
        summary: summarizeEnemyQueue(shuffledQueue)
    };
}

const SUPPORTED_WEAPON_BEHAVIORS = new Set(['projectile', 'spread', 'charge_shot']);

const DEFAULT_WEAPON_CATALOG_STORE = {
    version: 1,
    defaultWeaponId: 'pistol',
    weapons: [
        {
            id: 'pistol',
            label: 'Pistol',
            description: 'Standard sidearm issued to every new operator.',
            cost: 0,
            sortOrder: 10,
            behaviorId: 'projectile',
            slot: 'sidearm',
            artPath: 'weapons/pistol.svg',
            playable: true,
            stats: {
                pelletCount: 1,
                damage: 40,
                range: 300,
                spread: 0.05,
                cooldown: 300,
                speed: 600,
                magazineSize: 12,
                reloadTime: 1100,
                chargeTime: 0
            },
            fx: {
                recoilForce: 5,
                muzzleFlashDuration: 80,
                shellEjection: true,
                energyBeam: false,
                sound: 'pistol_fire',
                impactColor: '#57ff8c',
                hitRadius: 3
            },
            presentation: {
                crosshairColor: '#00ff00',
                spreadGuideColor: 'rgba(0, 255, 0, 0.2)',
                holdOffset: 18,
                muzzleOffset: 16,
                ejectBackOffset: 5,
                ejectSideOffset: -7,
                shellEjectAngleBias: -0.08,
                smokeTrailScale: 0,
                showSpreadIndicator: false
            }
        },
        {
            id: 'shotgun',
            label: 'Shotgun',
            description: 'Heavy close-range option with a brutal blast pattern.',
            cost: 320,
            sortOrder: 20,
            behaviorId: 'spread',
            slot: 'primary',
            artPath: 'weapons/shotgun.svg',
            playable: true,
            stats: {
                pelletCount: 8,
                damage: 25,
                range: 200,
                spread: 0.3,
                cooldown: 800,
                speed: 800,
                magazineSize: 6,
                reloadTime: 1450,
                chargeTime: 0
            },
            fx: {
                recoilForce: 15,
                muzzleFlashDuration: 100,
                shellEjection: true,
                energyBeam: false,
                sound: 'shotgun_fire',
                impactColor: '#ff9f43',
                hitRadius: 3
            },
            presentation: {
                crosshairColor: '#ff8800',
                spreadGuideColor: 'rgba(255, 136, 0, 0.3)',
                holdOffset: 20,
                muzzleOffset: 22,
                ejectBackOffset: 8,
                ejectSideOffset: -10,
                shellEjectAngleBias: -0.18,
                smokeTrailScale: 0.8,
                showSpreadIndicator: true
            }
        },
        {
            id: 'rifle',
            label: 'Rifle',
            description: 'Reliable high-pressure weapon for sustained fire.',
            cost: 460,
            sortOrder: 30,
            behaviorId: 'projectile',
            slot: 'primary',
            artPath: 'weapons/rifle.svg',
            playable: true,
            stats: {
                pelletCount: 1,
                damage: 60,
                range: 400,
                spread: 0.02,
                cooldown: 150,
                speed: 1000,
                magazineSize: 24,
                reloadTime: 1600,
                chargeTime: 0
            },
            fx: {
                recoilForce: 8,
                muzzleFlashDuration: 60,
                shellEjection: true,
                energyBeam: false,
                sound: 'rifle_fire',
                impactColor: '#63b3ff',
                hitRadius: 3
            },
            presentation: {
                crosshairColor: '#0099ff',
                spreadGuideColor: 'rgba(0, 153, 255, 0.24)',
                holdOffset: 21,
                muzzleOffset: 20,
                ejectBackOffset: 7,
                ejectSideOffset: -8,
                shellEjectAngleBias: -0.1,
                smokeTrailScale: 0.8,
                showSpreadIndicator: false
            }
        },
        {
            id: 'sniper',
            label: 'Sniper Laser',
            description: 'Charge a single blue laser round and crack long lanes with heavy recoil.',
            cost: 620,
            sortOrder: 40,
            behaviorId: 'charge_shot',
            slot: 'primary',
            artPath: 'weapons/sniper.svg',
            playable: true,
            stats: {
                pelletCount: 1,
                damage: 300,
                range: 900,
                spread: 0.008,
                cooldown: 1500,
                speed: 1900,
                magazineSize: 3,
                reloadTime: 2100,
                chargeTime: 420
            },
            fx: {
                recoilForce: 18,
                muzzleFlashDuration: 140,
                shellEjection: false,
                energyBeam: true,
                sound: 'sniper_laser',
                impactColor: '#67c9ff',
                hitRadius: 9
            },
            presentation: {
                crosshairColor: '#67c9ff',
                spreadGuideColor: 'rgba(103, 201, 255, 0.2)',
                holdOffset: 24,
                muzzleOffset: 28,
                ejectBackOffset: 0,
                ejectSideOffset: 0,
                shellEjectAngleBias: -0.04,
                smokeTrailScale: 0,
                showSpreadIndicator: false
            }
        }
    ]
};

function createDefaultWeaponCatalogStore() {
    return JSON.parse(JSON.stringify(DEFAULT_WEAPON_CATALOG_STORE));
}

function normalizeWeaponCatalogEntry(entry = {}, fallbackIndex = 0) {
    const fallbackEntries = DEFAULT_WEAPON_CATALOG_STORE.weapons;
    const safeFallback = fallbackEntries[Math.max(0, Math.min(fallbackIndex, fallbackEntries.length - 1))] || fallbackEntries[0];
    const requestedId = sanitizeAssetSlug(entry.id || safeFallback.id);
    const baseEntry = fallbackEntries.find((weapon) => weapon.id === requestedId) || safeFallback;
    const rawStats = entry?.stats && typeof entry.stats === 'object' ? entry.stats : {};
    const rawFx = entry?.fx && typeof entry.fx === 'object' ? entry.fx : {};
    const rawPresentation = entry?.presentation && typeof entry.presentation === 'object' ? entry.presentation : {};
    const resolvedId = sanitizeAssetSlug(baseEntry.id || safeFallback.id);
    const resolveNumber = (value, fallbackValue) => {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : fallbackValue;
    };

    return {
        id: resolvedId,
        label: typeof entry.label === 'string' && entry.label.trim()
            ? entry.label.trim()
            : baseEntry.label,
        description: typeof entry.description === 'string' && entry.description.trim()
            ? entry.description.trim()
            : baseEntry.description,
        cost: Math.max(0, Math.round(resolveNumber(entry.cost, baseEntry.cost))),
        sortOrder: Math.max(0, Math.round(resolveNumber(entry.sortOrder, baseEntry.sortOrder))),
        behaviorId: SUPPORTED_WEAPON_BEHAVIORS.has(entry.behaviorId)
            ? entry.behaviorId
            : baseEntry.behaviorId,
        slot: typeof entry.slot === 'string' && entry.slot.trim()
            ? entry.slot.trim()
            : baseEntry.slot,
        artPath: typeof entry.artPath === 'string' && entry.artPath.trim()
            ? entry.artPath.replace(/\\/g, '/').replace(/^\/+/, '').trim()
            : baseEntry.artPath,
        playable: entry.playable !== undefined ? Boolean(entry.playable) : baseEntry.playable !== false,
        stats: {
            pelletCount: Math.max(1, Math.round(resolveNumber(rawStats.pelletCount ?? entry.pelletCount, baseEntry.stats.pelletCount))),
            damage: Math.max(1, resolveNumber(rawStats.damage ?? entry.damage, baseEntry.stats.damage)),
            range: Math.max(1, resolveNumber(rawStats.range ?? entry.range, baseEntry.stats.range)),
            spread: Math.max(0, resolveNumber(rawStats.spread ?? entry.spread, baseEntry.stats.spread)),
            cooldown: Math.max(0, Math.round(resolveNumber(rawStats.cooldown ?? entry.cooldown, baseEntry.stats.cooldown))),
            speed: Math.max(1, resolveNumber(rawStats.speed ?? entry.speed, baseEntry.stats.speed)),
            magazineSize: Math.max(1, Math.round(resolveNumber(rawStats.magazineSize ?? entry.magazineSize, baseEntry.stats.magazineSize))),
            reloadTime: Math.max(0, Math.round(resolveNumber(rawStats.reloadTime ?? entry.reloadTime, baseEntry.stats.reloadTime))),
            chargeTime: Math.max(0, Math.round(resolveNumber(rawStats.chargeTime ?? entry.chargeTime, baseEntry.stats.chargeTime || 0)))
        },
        fx: {
            recoilForce: Math.max(0, resolveNumber(rawFx.recoilForce ?? entry.recoilForce, baseEntry.fx.recoilForce)),
            muzzleFlashDuration: Math.max(0, Math.round(resolveNumber(
                rawFx.muzzleFlashDuration ?? entry.muzzleFlashDuration,
                baseEntry.fx.muzzleFlashDuration
            ))),
            shellEjection: rawFx.shellEjection !== undefined
                ? Boolean(rawFx.shellEjection)
                : (entry.shellEjection !== undefined ? Boolean(entry.shellEjection) : Boolean(baseEntry.fx.shellEjection)),
            energyBeam: rawFx.energyBeam !== undefined
                ? Boolean(rawFx.energyBeam)
                : (entry.energyBeam !== undefined ? Boolean(entry.energyBeam) : Boolean(baseEntry.fx.energyBeam)),
            sound: typeof (rawFx.sound ?? entry.sound) === 'string' && String(rawFx.sound ?? entry.sound).trim()
                ? String(rawFx.sound ?? entry.sound).trim()
                : baseEntry.fx.sound,
            impactColor: typeof (rawFx.impactColor ?? entry.impactColor) === 'string' && String(rawFx.impactColor ?? entry.impactColor).trim()
                ? String(rawFx.impactColor ?? entry.impactColor).trim()
                : baseEntry.fx.impactColor,
            hitRadius: Math.max(1, resolveNumber(rawFx.hitRadius ?? entry.hitRadius, baseEntry.fx.hitRadius))
        },
        presentation: {
            crosshairColor: typeof (rawPresentation.crosshairColor ?? entry.crosshairColor) === 'string'
                && String(rawPresentation.crosshairColor ?? entry.crosshairColor).trim()
                ? String(rawPresentation.crosshairColor ?? entry.crosshairColor).trim()
                : baseEntry.presentation.crosshairColor,
            spreadGuideColor: typeof (rawPresentation.spreadGuideColor ?? entry.spreadGuideColor) === 'string'
                && String(rawPresentation.spreadGuideColor ?? entry.spreadGuideColor).trim()
                ? String(rawPresentation.spreadGuideColor ?? entry.spreadGuideColor).trim()
                : baseEntry.presentation.spreadGuideColor,
            holdOffset: resolveNumber(rawPresentation.holdOffset ?? entry.holdOffset, baseEntry.presentation.holdOffset),
            muzzleOffset: resolveNumber(rawPresentation.muzzleOffset ?? entry.muzzleOffset, baseEntry.presentation.muzzleOffset),
            ejectBackOffset: resolveNumber(rawPresentation.ejectBackOffset ?? entry.ejectBackOffset, baseEntry.presentation.ejectBackOffset),
            ejectSideOffset: resolveNumber(rawPresentation.ejectSideOffset ?? entry.ejectSideOffset, baseEntry.presentation.ejectSideOffset),
            shellEjectAngleBias: resolveNumber(
                rawPresentation.shellEjectAngleBias ?? entry.shellEjectAngleBias,
                baseEntry.presentation.shellEjectAngleBias
            ),
            smokeTrailScale: Math.max(0, resolveNumber(rawPresentation.smokeTrailScale ?? entry.smokeTrailScale, baseEntry.presentation.smokeTrailScale)),
            showSpreadIndicator: rawPresentation.showSpreadIndicator !== undefined
                ? Boolean(rawPresentation.showSpreadIndicator)
                : (entry.showSpreadIndicator !== undefined
                    ? Boolean(entry.showSpreadIndicator)
                    : Boolean(baseEntry.presentation.showSpreadIndicator))
        }
    };
}

function normalizeWeaponCatalogStore(store = {}) {
    const sourceWeapons = Array.isArray(store.weapons) && store.weapons.length > 0
        ? store.weapons
        : DEFAULT_WEAPON_CATALOG_STORE.weapons;
    const normalizedWeapons = [];
    const seenIds = new Set();

    sourceWeapons.forEach((entry, index) => {
        const normalizedEntry = normalizeWeaponCatalogEntry(entry, index);
        if (!normalizedEntry?.id || seenIds.has(normalizedEntry.id)) {
            return;
        }

        seenIds.add(normalizedEntry.id);
        normalizedWeapons.push(normalizedEntry);
    });

    const playableWeapons = normalizedWeapons.filter((weapon) => weapon.playable !== false);
    const defaultWeaponCandidate = typeof store.defaultWeaponId === 'string' ? store.defaultWeaponId.trim() : '';
    const defaultWeaponId = playableWeapons.some((weapon) => weapon.id === defaultWeaponCandidate)
        ? defaultWeaponCandidate
        : (playableWeapons[0]?.id || DEFAULT_WEAPON_CATALOG_STORE.defaultWeaponId);

    normalizedWeapons.sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
            return left.sortOrder - right.sortOrder;
        }
        return left.label.localeCompare(right.label);
    });

    return {
        version: Number.isFinite(store.version) ? Math.max(1, Math.round(store.version)) : DEFAULT_WEAPON_CATALOG_STORE.version,
        defaultWeaponId,
        weapons: normalizedWeapons
    };
}

function validateWeaponCatalogStore(store) {
    const warnings = [];
    const seenIds = new Set();

    store.weapons.forEach((weapon) => {
        if (seenIds.has(weapon.id)) {
            warnings.push(`Duplicate weapon id "${weapon.id}" ignored.`);
            return;
        }
        seenIds.add(weapon.id);

        if (!SUPPORTED_WEAPON_BEHAVIORS.has(weapon.behaviorId)) {
            warnings.push(`Weapon "${weapon.id}" uses unknown behavior "${weapon.behaviorId}".`);
        }

        if (weapon.artPath && !fs.existsSync(path.join(ASSETS_ROOT, weapon.artPath))) {
            warnings.push(`Weapon "${weapon.id}" points to missing art "${weapon.artPath}".`);
        }
    });

    if (!store.weapons.some((weapon) => weapon.playable !== false)) {
        warnings.push('Weapon catalog has no playable weapons.');
    }

    return warnings;
}

function ensureWeaponCatalogStorage() {
    fs.mkdirSync(DATA_CATALOG_ROOT, { recursive: true });

    if (!fs.existsSync(WEAPON_CATALOG_PATH)) {
        fs.writeFileSync(WEAPON_CATALOG_PATH, JSON.stringify(createDefaultWeaponCatalogStore(), null, 2));
    }
}

function loadWeaponCatalogStore() {
    ensureWeaponCatalogStorage();

    try {
        const raw = fs.readFileSync(WEAPON_CATALOG_PATH, 'utf8');
        const normalizedStore = normalizeWeaponCatalogStore(JSON.parse(raw));
        const warnings = validateWeaponCatalogStore(normalizedStore);
        warnings.forEach((warning) => console.warn(`[weapon-catalog] ${warning}`));
        return normalizedStore;
    } catch (error) {
        console.warn('Unable to load weapon catalog, using defaults:', error.message);
        const fallbackStore = normalizeWeaponCatalogStore(createDefaultWeaponCatalogStore());
        validateWeaponCatalogStore(fallbackStore).forEach((warning) => console.warn(`[weapon-catalog] ${warning}`));
        return fallbackStore;
    }
}

function createWeaponRuntimeConfigMap(weaponCatalog = weaponCatalogStore.weapons) {
    return Object.fromEntries(
        weaponCatalog
            .filter((weapon) => weapon.playable !== false)
            .map((weapon) => [
                weapon.id,
                {
                    name: weapon.label,
                    label: weapon.label,
                    description: weapon.description,
                    cost: weapon.cost,
                    behaviorId: weapon.behaviorId,
                    slot: weapon.slot,
                    sortOrder: weapon.sortOrder,
                    artPath: weapon.artPath,
                    ...weapon.stats,
                    ...weapon.fx,
                    ...weapon.presentation
                }
            ])
    );
}

function createWeaponShopCatalog(weaponCatalog = weaponCatalogStore.weapons) {
    return Object.fromEntries(
        weaponCatalog.map((weapon) => [
            weapon.id,
            {
                id: weapon.id,
                label: weapon.label,
                cost: weapon.cost,
                description: weapon.description,
                sortOrder: weapon.sortOrder,
                behaviorId: weapon.behaviorId,
                slot: weapon.slot,
                artPath: weapon.artPath,
                playable: weapon.playable !== false,
                stats: { ...weapon.stats },
                fx: { ...weapon.fx },
                presentation: { ...weapon.presentation },
                ...weapon.stats,
                ...weapon.fx,
                ...weapon.presentation
            }
        ])
    );
}

let weaponCatalogStore = loadWeaponCatalogStore();

const BUILT_IN_WEAPON_SHOP_CATALOG = Object.freeze(createWeaponShopCatalog(weaponCatalogStore.weapons));
const WEAPON_CONFIG = Object.freeze(createWeaponRuntimeConfigMap(weaponCatalogStore.weapons));
const DEFAULT_WEAPON_ID = weaponCatalogStore.weapons.some((weapon) => weapon.id === weaponCatalogStore.defaultWeaponId && weapon.playable !== false)
    ? weaponCatalogStore.defaultWeaponId
    : (Object.keys(WEAPON_CONFIG)[0] || 'pistol');

function getWeaponConfig(weaponType) {
    return WEAPON_CONFIG[weaponType] || WEAPON_CONFIG[DEFAULT_WEAPON_ID] || Object.values(WEAPON_CONFIG)[0];
}

function getSafeWeaponType(weaponType) {
    return WEAPON_CONFIG[weaponType] ? weaponType : DEFAULT_WEAPON_ID;
}

const UPGRADE_CONFIG = {
    damage: { baseCost: 100, costScale: 1.55, maxLevel: 5 },
    fireRate: { baseCost: 120, costScale: 1.6, maxLevel: 5 },
    health: { baseCost: 90, costScale: 1.5, maxLevel: 5 },
    speed: { baseCost: 85, costScale: 1.45, maxLevel: 5 },
    shield: { baseCost: 110, costScale: 1.5, maxLevel: 4 },
    grenade: { baseCost: 100, costScale: 1, maxLevel: 99 }
};

const ARENA_THEMES = [
    {
        id: 'neon-district',
        prefix: 'Axiom',
        palette: {
            floorBase: '#101a24',
            floorAlt: '#152636',
            floorGlow: 'rgba(44, 209, 255, 0.08)',
            gridMinor: 'rgba(117, 191, 209, 0.12)',
            gridMajor: 'rgba(196, 238, 255, 0.08)',
            boundary: 'rgba(116, 241, 255, 0.34)',
            wallBase: '#243645',
            wallTop: '#3f5c72',
            wallTrim: '#60d7ff',
            wallShadow: 'rgba(0, 0, 0, 0.28)',
            hazard: '#ff7a5c',
            beacon: '#7df9ff',
            decal: 'rgba(76, 202, 255, 0.12)'
        }
    },
    {
        id: 'transit-yard',
        prefix: 'Signal',
        palette: {
            floorBase: '#131820',
            floorAlt: '#21242d',
            floorGlow: 'rgba(255, 202, 87, 0.07)',
            gridMinor: 'rgba(255, 229, 163, 0.1)',
            gridMajor: 'rgba(255, 236, 192, 0.08)',
            boundary: 'rgba(255, 199, 113, 0.34)',
            wallBase: '#4a4340',
            wallTop: '#736b64',
            wallTrim: '#ffd166',
            wallShadow: 'rgba(0, 0, 0, 0.3)',
            hazard: '#ff9a3c',
            beacon: '#ffe082',
            decal: 'rgba(255, 190, 77, 0.11)'
        }
    },
    {
        id: 'reactor-foundry',
        prefix: 'Cinder',
        palette: {
            floorBase: '#15151d',
            floorAlt: '#1e2130',
            floorGlow: 'rgba(224, 105, 255, 0.08)',
            gridMinor: 'rgba(210, 162, 255, 0.1)',
            gridMajor: 'rgba(236, 209, 255, 0.08)',
            boundary: 'rgba(208, 136, 255, 0.34)',
            wallBase: '#40314f',
            wallTop: '#705b8a',
            wallTrim: '#da9cff',
            wallShadow: 'rgba(0, 0, 0, 0.32)',
            hazard: '#ff6b6b',
            beacon: '#f5b8ff',
            decal: 'rgba(205, 142, 255, 0.11)'
        }
    }
];

const ARENA_LAYOUTS = [
    { id: 'crossroads', label: 'Crossroads' },
    { id: 'splitter', label: 'Splitter' },
    { id: 'foundry', label: 'Foundry' }
];

const BUILT_IN_SKIN_CATALOG = {
    player1: {
        id: 'player1',
        label: 'Blue Vanguard',
        cost: 0,
        description: 'Starter operator frame with balanced colors.'
    },
    player2: {
        id: 'player2',
        label: 'Green Scout',
        cost: 200,
        description: 'Fast recon styling for players who like cleaner silhouettes.'
    },
    player3: {
        id: 'player3',
        label: 'Violet Phantom',
        cost: 350,
        description: 'Sharper contrast palette with a stealthier look.'
    },
    player4: {
        id: 'player4',
        label: 'Amber Breacher',
        cost: 500,
        description: 'Heavy assault finish with warmer armor tones.'
    }
};

const BUILT_IN_ENEMY_SPRITES = {
    enemy: {
        id: 'enemy',
        label: 'Enemy',
        relativePath: 'sprites/enemy.svg',
        publicUrl: '/assets/sprites/enemy.svg'
    }
};

const gameAssetCatalogCache = {
    expiresAt: 0,
    data: null
};

function getUpgradeCost(type, level) {
    const config = UPGRADE_CONFIG[type];
    if (!config) return Infinity;
    const rawCost = config.baseCost * Math.pow(config.costScale, level);
    return Math.round(rawCost / 5) * 5;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function randomInRange(min, max) {
    return min + Math.random() * (max - min);
}

function pickRandom(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return null;
    }
    return items[Math.floor(Math.random() * items.length)];
}

function createArenaObstacle(id, x, y, width, height, options = {}) {
    return {
        id,
        x,
        y,
        width,
        height,
        radius: options.radius ?? Math.max(12, Math.min(width, height) * 0.18),
        style: options.style || 'wall',
        accent: options.accent || 'trim',
        detail: options.detail || 'panel',
        solid: options.solid !== false
    };
}

function createArenaDecor(id, type, x, y, width, height, options = {}) {
    return {
        id,
        type,
        x,
        y,
        width,
        height,
        color: options.color || 'decal',
        alpha: options.alpha ?? 1,
        rotation: options.rotation || 0
    };
}

function createArenaSpawn(x, y) {
    return { x, y };
}

function createArenaCandidateGrid(width, height, columns, rows, inset = 180) {
    const points = [];
    const usableWidth = Math.max(1, width - inset * 2);
    const usableHeight = Math.max(1, height - inset * 2);

    for (let column = 0; column < columns; column++) {
        for (let row = 0; row < rows; row++) {
            const x = inset + (usableWidth * (column + 0.5)) / columns;
            const y = inset + (usableHeight * (row + 0.5)) / rows;
            points.push(createArenaSpawn(x, y));
        }
    }

    return points;
}

function addMirroredCratePair(obstacles, centerX, centerY, dx, dy, size, style = 'crate') {
    const left = createArenaObstacle(
        uuidv4(),
        centerX - dx - size / 2,
        centerY + dy - size / 2,
        size,
        size,
        { style, accent: 'hazard', detail: 'crate' }
    );
    const right = createArenaObstacle(
        uuidv4(),
        centerX + dx - size / 2,
        centerY + dy - size / 2,
        size,
        size,
        { style, accent: 'hazard', detail: 'crate' }
    );
    obstacles.push(left, right);
}

function buildArenaLayout(layoutId, theme, width, height) {
    const centerX = width / 2;
    const centerY = height / 2;
    const obstacles = [];
    const decor = [];
    const basePlayerSpawns = [
        createArenaSpawn(170, 170),
        createArenaSpawn(width - 170, 170),
        createArenaSpawn(170, height - 170),
        createArenaSpawn(width - 170, height - 170),
        createArenaSpawn(width / 2, 170),
        createArenaSpawn(width / 2, height - 170),
        createArenaSpawn(170, height / 2),
        createArenaSpawn(width - 170, height / 2)
    ];
    const enemySpawns = [
        createArenaSpawn(width * 0.18, -30),
        createArenaSpawn(width * 0.5, -30),
        createArenaSpawn(width * 0.82, -30),
        createArenaSpawn(width + 30, height * 0.22),
        createArenaSpawn(width + 30, height * 0.5),
        createArenaSpawn(width + 30, height * 0.78),
        createArenaSpawn(width * 0.18, height + 30),
        createArenaSpawn(width * 0.5, height + 30),
        createArenaSpawn(width * 0.82, height + 30),
        createArenaSpawn(-30, height * 0.22),
        createArenaSpawn(-30, height * 0.5),
        createArenaSpawn(-30, height * 0.78)
    ];
    const powerUpSpawns = [];
    const namePrefix = theme.prefix || 'Arena';

    if (layoutId === 'crossroads') {
        obstacles.push(
            createArenaObstacle(uuidv4(), centerX - 160, centerY - 120, 320, 240, { style: 'hub', accent: 'trim', detail: 'core' }),
            createArenaObstacle(uuidv4(), 250, centerY - 130, 110, 260, { style: 'cover', accent: 'beacon' }),
            createArenaObstacle(uuidv4(), width - 360, centerY - 130, 110, 260, { style: 'cover', accent: 'beacon' }),
            createArenaObstacle(uuidv4(), 540, 260, 170, 96, { style: 'cover', accent: 'hazard' }),
            createArenaObstacle(uuidv4(), width - 710, 260, 170, 96, { style: 'cover', accent: 'hazard' }),
            createArenaObstacle(uuidv4(), 540, height - 356, 170, 96, { style: 'cover', accent: 'hazard' }),
            createArenaObstacle(uuidv4(), width - 710, height - 356, 170, 96, { style: 'cover', accent: 'hazard' })
        );
        addMirroredCratePair(obstacles, centerX, centerY, 430, -315, 84);
        addMirroredCratePair(obstacles, centerX, centerY, 430, 315, 84);

        decor.push(
            createArenaDecor(uuidv4(), 'stripe', centerX - 26, 80, 52, height - 160, { color: 'hazard', alpha: 0.72 }),
            createArenaDecor(uuidv4(), 'stripe', 120, centerY - 24, width - 240, 48, { color: 'decal', alpha: 0.72 })
        );

        powerUpSpawns.push(
            createArenaSpawn(centerX, 220),
            createArenaSpawn(centerX, height - 220),
            createArenaSpawn(430, centerY),
            createArenaSpawn(width - 430, centerY)
        );

        return {
            name: `${namePrefix} Crossroads`,
            obstacles,
            decor,
            playerSpawns: basePlayerSpawns,
            enemySpawns,
            powerUpSpawns
        };
    }

    if (layoutId === 'splitter') {
        obstacles.push(
            createArenaObstacle(uuidv4(), 430, 210, 170, 410, { style: 'pillar', accent: 'trim' }),
            createArenaObstacle(uuidv4(), width - 600, 210, 170, 410, { style: 'pillar', accent: 'trim' }),
            createArenaObstacle(uuidv4(), 430, height - 620, 170, 410, { style: 'pillar', accent: 'trim' }),
            createArenaObstacle(uuidv4(), width - 600, height - 620, 170, 410, { style: 'pillar', accent: 'trim' }),
            createArenaObstacle(uuidv4(), centerX - 120, centerY - 250, 240, 94, { style: 'cover', accent: 'hazard' }),
            createArenaObstacle(uuidv4(), centerX - 120, centerY + 156, 240, 94, { style: 'cover', accent: 'hazard' }),
            createArenaObstacle(uuidv4(), centerX - 86, centerY - 56, 172, 112, { style: 'hub', accent: 'beacon', detail: 'panel' })
        );
        addMirroredCratePair(obstacles, centerX, centerY, 320, -180, 82);
        addMirroredCratePair(obstacles, centerX, centerY, 320, 180, 82);

        decor.push(
            createArenaDecor(uuidv4(), 'stripe', 150, centerY - 18, width - 300, 36, { color: 'hazard', alpha: 0.7 }),
            createArenaDecor(uuidv4(), 'stripe', centerX - 18, 120, 36, height - 240, { color: 'decal', alpha: 0.8 })
        );

        powerUpSpawns.push(
            createArenaSpawn(centerX, 185),
            createArenaSpawn(centerX, height - 185),
            createArenaSpawn(centerX - 340, centerY),
            createArenaSpawn(centerX + 340, centerY)
        );

        return {
            name: `${namePrefix} Splitter`,
            obstacles,
            decor,
            playerSpawns: basePlayerSpawns,
            enemySpawns,
            powerUpSpawns
        };
    }

    obstacles.push(
        createArenaObstacle(uuidv4(), 280, 290, 300, 180, { style: 'hub', accent: 'trim', detail: 'core' }),
        createArenaObstacle(uuidv4(), width - 580, height - 470, 300, 180, { style: 'hub', accent: 'trim', detail: 'core' }),
        createArenaObstacle(uuidv4(), width - 600, 250, 240, 110, { style: 'cover', accent: 'hazard' }),
        createArenaObstacle(uuidv4(), 360, height - 360, 240, 110, { style: 'cover', accent: 'hazard' }),
        createArenaObstacle(uuidv4(), centerX - 80, centerY - 300, 160, 120, { style: 'pillar', accent: 'beacon' }),
        createArenaObstacle(uuidv4(), centerX - 80, centerY + 180, 160, 120, { style: 'pillar', accent: 'beacon' }),
        createArenaObstacle(uuidv4(), centerX - 220, centerY - 45, 140, 90, { style: 'cover', accent: 'trim' }),
        createArenaObstacle(uuidv4(), centerX + 80, centerY - 45, 140, 90, { style: 'cover', accent: 'trim' })
    );
    addMirroredCratePair(obstacles, centerX, centerY, 500, -40, 84);
    addMirroredCratePair(obstacles, centerX, centerY, 150, 360, 76);

    decor.push(
        createArenaDecor(uuidv4(), 'stripe', 180, 180, width - 360, 26, { color: 'decal', alpha: 0.65 }),
        createArenaDecor(uuidv4(), 'stripe', 180, height - 206, width - 360, 26, { color: 'decal', alpha: 0.65 }),
        createArenaDecor(uuidv4(), 'stripe', centerX - 18, 140, 36, height - 280, { color: 'hazard', alpha: 0.5 })
    );

    powerUpSpawns.push(
        createArenaSpawn(centerX, centerY),
        createArenaSpawn(300, height - 210),
        createArenaSpawn(width - 300, 210),
        createArenaSpawn(centerX, height * 0.28),
        createArenaSpawn(centerX, height * 0.72)
    );

    return {
        name: `${namePrefix} Foundry`,
        obstacles,
        decor,
        playerSpawns: basePlayerSpawns,
        enemySpawns,
        powerUpSpawns
    };
}

function addAmbientArenaDecor(arena) {
    const candidateGrid = createArenaCandidateGrid(arena.width, arena.height, 5, 3, 210);
    candidateGrid.slice(0, 10).forEach((point, index) => {
        arena.decor.push(
            createArenaDecor(uuidv4(), index % 2 === 0 ? 'beacon' : 'vent', point.x - 16, point.y - 16, 32, 32, {
                color: index % 2 === 0 ? 'beacon' : 'decal',
                alpha: index % 2 === 0 ? 0.85 : 0.5
            })
        );
    });
}

function generateArenaDefinition() {
    const theme = pickRandom(ARENA_THEMES) || ARENA_THEMES[0];
    const layout = pickRandom(ARENA_LAYOUTS) || ARENA_LAYOUTS[0];
    const width = GAME_CONFIG.canvas.width;
    const height = GAME_CONFIG.canvas.height;
    const layoutData = buildArenaLayout(layout.id, theme, width, height);
    const arena = {
        id: uuidv4(),
        themeId: theme.id,
        layoutId: layout.id,
        name: layoutData.name,
        width,
        height,
        palette: { ...theme.palette },
        obstacles: layoutData.obstacles,
        decor: layoutData.decor,
        playerSpawns: layoutData.playerSpawns,
        enemySpawns: layoutData.enemySpawns,
        powerUpSpawns: layoutData.powerUpSpawns
    };

    addAmbientArenaDecor(arena);
    return arena;
}

function serializeArena(arena) {
    if (!arena) {
        return null;
    }

    return {
        id: arena.id,
        name: arena.name,
        themeId: arena.themeId,
        layoutId: arena.layoutId,
        width: arena.width,
        height: arena.height,
        palette: arena.palette,
        obstacles: arena.obstacles.map((obstacle) => ({
            id: obstacle.id,
            x: obstacle.x,
            y: obstacle.y,
            width: obstacle.width,
            height: obstacle.height,
            radius: obstacle.radius,
            style: obstacle.style,
            accent: obstacle.accent,
            detail: obstacle.detail
        })),
        decor: arena.decor.map((item) => ({
            id: item.id,
            type: item.type,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            color: item.color,
            alpha: item.alpha,
            rotation: item.rotation
        }))
    };
}

function isCircleCollidingWithObstacle(position, radius, obstacle) {
    if (!obstacle?.solid) {
        return false;
    }

    const closestX = clamp(position.x, obstacle.x, obstacle.x + obstacle.width);
    const closestY = clamp(position.y, obstacle.y, obstacle.y + obstacle.height);
    const dx = position.x - closestX;
    const dy = position.y - closestY;
    return (dx * dx) + (dy * dy) < radius * radius;
}

function isPositionBlockedInArena(arena, position, radius, options = {}) {
    if (!arena) {
        return false;
    }

    const margin = options.margin || 0;
    if (position.x < radius + margin || position.x > arena.width - radius - margin) {
        return true;
    }
    if (position.y < radius + margin || position.y > arena.height - radius - margin) {
        return true;
    }

    return arena.obstacles.some((obstacle) => {
        if (options.ignoreObstacleId && obstacle.id === options.ignoreObstacleId) {
            return false;
        }
        return isCircleCollidingWithObstacle(position, radius + margin, obstacle);
    });
}

function resolveArenaMovement(arena, currentPosition, desiredPosition, radius) {
    if (!arena) {
        return new Vector2D(
            clamp(desiredPosition.x, radius, GAME_CONFIG.canvas.width - radius),
            clamp(desiredPosition.y, radius, GAME_CONFIG.canvas.height - radius)
        );
    }

    let resolved = new Vector2D(currentPosition.x, currentPosition.y);
    const targetX = clamp(desiredPosition.x, radius, arena.width - radius);
    const targetY = clamp(desiredPosition.y, radius, arena.height - radius);

    const horizontal = new Vector2D(targetX, resolved.y);
    if (!isPositionBlockedInArena(arena, horizontal, radius)) {
        resolved = horizontal;
    }

    const vertical = new Vector2D(resolved.x, targetY);
    if (!isPositionBlockedInArena(arena, vertical, radius)) {
        resolved = vertical;
    }

    if (!isPositionBlockedInArena(arena, new Vector2D(targetX, targetY), radius)) {
        resolved = new Vector2D(targetX, targetY);
    }

    return resolved;
}

function getObstacleAvoidanceVector(position, radius, arena) {
    if (!arena) {
        return new Vector2D(0, 0);
    }

    let avoidance = new Vector2D(0, 0);
    let influencingObstacles = 0;

    for (const obstacle of arena.obstacles) {
        const closestX = clamp(position.x, obstacle.x, obstacle.x + obstacle.width);
        const closestY = clamp(position.y, obstacle.y, obstacle.y + obstacle.height);
        const fromObstacle = position.subtract(new Vector2D(closestX, closestY));
        const distance = fromObstacle.length();
        const influenceRadius = radius + 110;

        if (distance > 0 && distance < influenceRadius) {
            const strength = (influenceRadius - distance) / influenceRadius;
            avoidance = avoidance.add(fromObstacle.normalize().multiply(strength));
            influencingObstacles++;
        }
    }

    if (influencingObstacles === 0 || avoidance.length() === 0) {
        return new Vector2D(0, 0);
    }

    return avoidance.normalize();
}

function findOpenArenaPoint(arena, preferredPoints, radius, maxAttempts = 24) {
    if (Array.isArray(preferredPoints)) {
        for (const point of preferredPoints) {
            const candidate = new Vector2D(point.x, point.y);
            if (!isPositionBlockedInArena(arena, candidate, radius, { margin: 8 })) {
                return candidate;
            }
        }
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = new Vector2D(
            randomInRange(radius + 60, arena.width - radius - 60),
            randomInRange(radius + 60, arena.height - radius - 60)
        );
        if (!isPositionBlockedInArena(arena, candidate, radius, { margin: 18 })) {
            return candidate;
        }
    }

    return new Vector2D(arena.width / 2, arena.height / 2);
}

function humanizeAssetName(value) {
    return String(value || '')
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (match) => match.toUpperCase()) || 'Untitled';
}

function sanitizeAssetSlug(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '');
}

function toAssetId(relativePath) {
    return String(relativePath || '')
        .replace(/\\/g, '/')
        .replace(/\.[^.]+$/, '');
}

function normalizeAssetMetadataEntry(entry = {}) {
    const normalized = {};

    if (typeof entry.label === 'string' && entry.label.trim()) {
        normalized.label = entry.label.trim();
    }

    if (typeof entry.description === 'string' && entry.description.trim()) {
        normalized.description = entry.description.trim();
    }

    if (entry.cost !== undefined && entry.cost !== null && entry.cost !== '') {
        const numericCost = Number(entry.cost);
        if (Number.isFinite(numericCost)) {
            normalized.cost = Math.max(0, Math.round(numericCost));
        }
    }

    if (typeof entry.category === 'string' && entry.category.trim()) {
        normalized.category = entry.category.trim();
    }

    return normalized;
}

function createDefaultGameAssetMetadataStore() {
    return { items: {} };
}

function normalizeGameAssetMetadataStore(store) {
    const normalizedItems = {};
    const sourceItems = store && typeof store === 'object' && store.items && typeof store.items === 'object'
        ? store.items
        : {};

    Object.entries(sourceItems).forEach(([relativePath, entry]) => {
        const normalizedPath = String(relativePath || '').replace(/\\/g, '/').trim();
        if (!normalizedPath) {
            return;
        }

        const normalizedEntry = normalizeAssetMetadataEntry(entry);
        if (Object.keys(normalizedEntry).length > 0) {
            normalizedItems[normalizedPath] = normalizedEntry;
        }
    });

    return { items: normalizedItems };
}

function loadGameAssetMetadataStore() {
    ensureDataStorage();

    try {
        const raw = fs.readFileSync(GAME_ASSET_METADATA_PATH, 'utf8');
        return normalizeGameAssetMetadataStore(JSON.parse(raw));
    } catch (error) {
        return createDefaultGameAssetMetadataStore();
    }
}

function saveGameAssetMetadataStore() {
    ensureDataStorage();
    fs.writeFileSync(GAME_ASSET_METADATA_PATH, JSON.stringify(
        normalizeGameAssetMetadataStore(gameAssetMetadataStore),
        null,
        2
    ));
}

function getGameAssetMetadataEntry(relativePath) {
    const normalizedPath = String(relativePath || '').replace(/\\/g, '/').trim();
    if (!normalizedPath) {
        return {};
    }

    return gameAssetMetadataStore.items[normalizedPath] || {};
}

function setGameAssetMetadataEntry(relativePath, entry) {
    const normalizedPath = String(relativePath || '').replace(/\\/g, '/').trim();
    if (!normalizedPath) {
        return;
    }

    const normalizedEntry = normalizeAssetMetadataEntry(entry);
    if (Object.keys(normalizedEntry).length === 0) {
        delete gameAssetMetadataStore.items[normalizedPath];
    } else {
        gameAssetMetadataStore.items[normalizedPath] = normalizedEntry;
    }

    saveGameAssetMetadataStore();
    invalidateGameAssetCatalog();
}

function deleteGameAssetMetadataEntry(relativePath) {
    const normalizedPath = String(relativePath || '').replace(/\\/g, '/').trim();
    if (!normalizedPath || !gameAssetMetadataStore.items[normalizedPath]) {
        return;
    }

    delete gameAssetMetadataStore.items[normalizedPath];
    saveGameAssetMetadataStore();
    invalidateGameAssetCatalog();
}

function renameGameAssetMetadataEntry(fromRelativePath, toRelativePath) {
    const fromPath = String(fromRelativePath || '').replace(/\\/g, '/').trim();
    const toPath = String(toRelativePath || '').replace(/\\/g, '/').trim();
    if (!fromPath || !toPath || !gameAssetMetadataStore.items[fromPath]) {
        return;
    }

    gameAssetMetadataStore.items[toPath] = gameAssetMetadataStore.items[fromPath];
    delete gameAssetMetadataStore.items[fromPath];
    saveGameAssetMetadataStore();
    invalidateGameAssetCatalog();
}

function renameGameAssetMetadataPrefix(fromRelativePath, toRelativePath) {
    const fromPath = String(fromRelativePath || '').replace(/\\/g, '/').trim();
    const toPath = String(toRelativePath || '').replace(/\\/g, '/').trim();
    if (!fromPath || !toPath) {
        return;
    }

    let changed = false;
    Object.entries({ ...gameAssetMetadataStore.items }).forEach(([entryPath, metadata]) => {
        if (entryPath === fromPath || entryPath.startsWith(`${fromPath}/`)) {
            const suffix = entryPath.slice(fromPath.length);
            gameAssetMetadataStore.items[`${toPath}${suffix}`] = metadata;
            delete gameAssetMetadataStore.items[entryPath];
            changed = true;
        }
    });

    if (changed) {
        saveGameAssetMetadataStore();
        invalidateGameAssetCatalog();
    }
}

function readSvgFilesFromDirectory(relativeDirectory) {
    const absoluteDirectory = path.join(ASSETS_ROOT, relativeDirectory);
    if (!fs.existsSync(absoluteDirectory)) {
        return [];
    }

    const results = [];
    const walk = (currentAbsolutePath, currentRelativePath) => {
        const entries = fs.readdirSync(currentAbsolutePath, { withFileTypes: true });
        for (const entry of entries) {
            const entryRelativePath = currentRelativePath
                ? `${currentRelativePath}/${entry.name}`
                : entry.name;
            const entryAbsolutePath = path.join(currentAbsolutePath, entry.name);

            if (entry.isDirectory()) {
                walk(entryAbsolutePath, entryRelativePath);
                continue;
            }

            if (/\.svg$/i.test(entry.name)) {
                results.push({
                    id: toAssetId(entryRelativePath),
                    name: entry.name,
                    relativePath: `${relativeDirectory}/${entryRelativePath}`.replace(/\\/g, '/'),
                    publicUrl: `/assets/${`${relativeDirectory}/${entryRelativePath}`.replace(/\\/g, '/')}`
                        .split('/')
                        .filter(Boolean)
                        .map(encodeURIComponent)
                        .join('/')
                        .replace(/^/, '/')
                });
            }
        }
    };

    walk(absoluteDirectory, '');
    results.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return results;
}

function buildGameAssetCatalog() {
    const skinCatalog = { ...BUILT_IN_SKIN_CATALOG };
    const enemySprites = { ...BUILT_IN_ENEMY_SPRITES };
    const spriteFiles = readSvgFilesFromDirectory('sprites');

    spriteFiles.forEach((asset) => {
        const metadata = getGameAssetMetadataEntry(asset.relativePath);
        const builtInSkin = BUILT_IN_SKIN_CATALOG[asset.id];
        const entry = {
            id: asset.id,
            label: metadata.label || builtInSkin?.label || humanizeAssetName(path.basename(asset.name, '.svg')),
            cost: metadata.cost ?? builtInSkin?.cost ?? 0,
            description: metadata.description || builtInSkin?.description || 'Custom sprite discovered from the assets library.',
            relativePath: asset.relativePath,
            publicUrl: asset.publicUrl,
            autoDiscovered: !builtInSkin,
            category: metadata.category || 'playerSkin'
        };

        if (/enemy/i.test(asset.id)) {
            enemySprites[asset.id] = {
                id: asset.id,
                label: metadata.label || humanizeAssetName(path.basename(asset.name, '.svg')),
                cost: metadata.cost ?? 0,
                description: metadata.description || 'Enemy sprite variant discovered from the assets library.',
                relativePath: asset.relativePath,
                publicUrl: asset.publicUrl,
                autoDiscovered: !BUILT_IN_ENEMY_SPRITES[asset.id],
                category: metadata.category || 'enemySprite'
            };
            return;
        }

        skinCatalog[asset.id] = entry;
    });

    const builtInSkinOrder = Object.keys(BUILT_IN_SKIN_CATALOG);
    const skins = Object.values(skinCatalog).sort((left, right) => {
        const leftBuiltInIndex = builtInSkinOrder.indexOf(left.id);
        const rightBuiltInIndex = builtInSkinOrder.indexOf(right.id);
        const leftBuiltIn = leftBuiltInIndex === -1 ? 1 : 0;
        const rightBuiltIn = rightBuiltInIndex === -1 ? 1 : 0;

        if (leftBuiltIn !== rightBuiltIn) {
            return leftBuiltIn - rightBuiltIn;
        }
        if (leftBuiltIn === 0 && rightBuiltIn === 0) {
            return leftBuiltInIndex - rightBuiltInIndex;
        }
        return left.label.localeCompare(right.label);
    });

    const discoveredWeaponAssets = readSvgFilesFromDirectory('weapons');
    const discoveredWeaponById = new Map(discoveredWeaponAssets.map((asset) => [asset.id, asset]));
    const weaponEntriesById = new Map();

    weaponCatalogStore.weapons.forEach((weapon) => {
        const asset = discoveredWeaponById.get(weapon.id);
        const relativePath = weapon.artPath || asset?.relativePath || `weapons/${weapon.id}.svg`;
        const metadata = getGameAssetMetadataEntry(relativePath);
        weaponEntriesById.set(weapon.id, {
            id: weapon.id,
            label: metadata.label || weapon.label,
            cost: metadata.cost ?? weapon.cost,
            description: metadata.description || weapon.description,
            relativePath,
            publicUrl: asset?.publicUrl || getAssetPublicUrl(relativePath),
            playable: weapon.playable !== false,
            category: metadata.category || 'weaponArt',
            sortOrder: weapon.sortOrder,
            behaviorId: weapon.behaviorId,
            slot: weapon.slot,
            artPath: relativePath,
            stats: { ...weapon.stats },
            fx: { ...weapon.fx },
            presentation: { ...weapon.presentation },
            ...weapon.stats,
            ...weapon.fx,
            ...weapon.presentation
        });
    });

    discoveredWeaponAssets.forEach((asset, index) => {
        if (weaponEntriesById.has(asset.id)) {
            return;
        }

        const metadata = getGameAssetMetadataEntry(asset.relativePath);
        weaponEntriesById.set(asset.id, {
            id: asset.id,
            label: metadata.label || humanizeAssetName(path.basename(asset.name, '.svg')),
            cost: metadata.cost ?? 0,
            description: metadata.description || 'Weapon art discovered from the assets library.',
            relativePath: asset.relativePath,
            publicUrl: asset.publicUrl,
            playable: false,
            category: metadata.category || 'weaponArt',
            sortOrder: 1000 + index,
            behaviorId: 'projectile',
            slot: 'misc',
            artPath: asset.relativePath
        });
    });

    const weapons = Array.from(weaponEntriesById.values()).sort((left, right) => {
        const leftOrder = Number.isFinite(left.sortOrder) ? left.sortOrder : Number.MAX_SAFE_INTEGER;
        const rightOrder = Number.isFinite(right.sortOrder) ? right.sortOrder : Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }
        return left.label.localeCompare(right.label);
    });

    const enemyVariants = Object.values(enemySprites).sort((left, right) => left.label.localeCompare(right.label));
    const defaultSkinId = skinCatalog.player1 ? 'player1' : (skins[0]?.id || 'player1');
    const defaultWeaponId = weapons.some((weapon) => weapon.id === DEFAULT_WEAPON_ID && weapon.playable)
        ? DEFAULT_WEAPON_ID
        : (weapons.find((weapon) => weapon.playable)?.id || DEFAULT_WEAPON_ID);

    return {
        defaultSkinId,
        defaultWeaponId,
        defaultEnemySpriteId: enemySprites.enemy ? 'enemy' : (enemyVariants[0]?.id || 'enemy'),
        skins,
        skinCatalog,
        weapons,
        enemySprites: enemyVariants
    };
}

function invalidateGameAssetCatalog() {
    gameAssetCatalogCache.expiresAt = 0;
    gameAssetCatalogCache.data = null;
}

function getGameAssetCatalog() {
    const now = Date.now();
    if (gameAssetCatalogCache.data && gameAssetCatalogCache.expiresAt > now) {
        return gameAssetCatalogCache.data;
    }

    const nextCatalog = buildGameAssetCatalog();
    gameAssetCatalogCache.data = nextCatalog;
    gameAssetCatalogCache.expiresAt = now + 1500;
    return nextCatalog;
}

function normalizeSkinTheme(value) {
    const { skinCatalog, defaultSkinId } = getGameAssetCatalog();
    return skinCatalog[value] ? value : defaultSkinId;
}

function normalizeWeaponType(value) {
    const { weapons, defaultWeaponId } = getGameAssetCatalog();
    const playableWeapons = new Set(weapons.filter((weapon) => weapon.playable).map((weapon) => weapon.id));
    return playableWeapons.has(value) ? value : defaultWeaponId;
}

function normalizeRoomMode(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === ROOM_MODES.PVP_FFA || raw === 'pvp' || raw === 'ffa' || raw === 'pvpffa') {
        return ROOM_MODES.PVP_FFA;
    }
    return ROOM_MODES.PVE;
}

function sanitizeUnlockedSkins(value) {
    const { skins, skinCatalog, defaultSkinId } = getGameAssetCatalog();
    const unlockedSkins = new Set(
        skins
            .filter((skin) => Number(skin.cost) <= 0)
            .map((skin) => skin.id)
    );
    unlockedSkins.add(defaultSkinId);

    if (Array.isArray(value)) {
        value.forEach((entry) => {
            const skinTheme = normalizeSkinTheme(entry);
            if (skinCatalog[skinTheme]) {
                unlockedSkins.add(skinTheme);
            }
        });
    }
    return Array.from(unlockedSkins);
}

function sanitizeUnlockedWeapons(value) {
    const { weapons, defaultWeaponId } = getGameAssetCatalog();
    const playableWeapons = weapons.filter((weapon) => weapon.playable);
    const unlockedWeapons = new Set(
        playableWeapons
            .filter((weapon) => Number(weapon.cost) <= 0)
            .map((weapon) => weapon.id)
    );
    unlockedWeapons.add(defaultWeaponId);

    if (Array.isArray(value)) {
        value.forEach((entry) => {
            const weaponType = normalizeWeaponType(entry);
            if (playableWeapons.some((weapon) => weapon.id === weaponType)) {
                unlockedWeapons.add(weaponType);
            }
        });
    }

    return Array.from(unlockedWeapons);
}

function createDefaultProgression() {
    const { defaultSkinId, defaultWeaponId } = getGameAssetCatalog();
    const unlockedSkins = sanitizeUnlockedSkins([]);
    const unlockedWeapons = sanitizeUnlockedWeapons([]);
    return {
        metaCurrency: 0,
        unlockedSkins,
        selectedSkin: unlockedSkins.includes(defaultSkinId) ? defaultSkinId : unlockedSkins[0],
        unlockedWeapons,
        selectedWeapon: unlockedWeapons.includes(defaultWeaponId) ? defaultWeaponId : unlockedWeapons[0],
        stats: {
            matchesPlayed: 0,
            bestWave: 0,
            totalScore: 0,
            totalMetaCurrencyEarned: 0
        }
    };
}

let gameAssetMetadataStore = createDefaultGameAssetMetadataStore();

function ensureDataStorage() {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    ensureWeaponCatalogStorage();

    if (!fs.existsSync(USERS_DB_PATH)) {
        fs.writeFileSync(USERS_DB_PATH, JSON.stringify({ users: [] }, null, 2));
    }

    if (!fs.existsSync(AUTH_SECRET_PATH)) {
        fs.writeFileSync(AUTH_SECRET_PATH, crypto.randomBytes(48).toString('hex'));
    }

    if (!fs.existsSync(GAME_ASSET_METADATA_PATH)) {
        fs.writeFileSync(GAME_ASSET_METADATA_PATH, JSON.stringify(createDefaultGameAssetMetadataStore(), null, 2));
    }

    if (!fs.existsSync(LEADERBOARD_DB_PATH)) {
        fs.writeFileSync(LEADERBOARD_DB_PATH, JSON.stringify(createDefaultLeaderboardStore(), null, 2));
    }
}

function normalizeUserRecord(user) {
    const defaultProgression = createDefaultProgression();
    const unlockedSkins = sanitizeUnlockedSkins(user?.progression?.unlockedSkins);
    const unlockedWeapons = sanitizeUnlockedWeapons(user?.progression?.unlockedWeapons);
    const { defaultSkinId, defaultWeaponId } = getGameAssetCatalog();
    const selectedSkin = unlockedSkins.includes(user?.progression?.selectedSkin)
        ? user.progression.selectedSkin
        : defaultSkinId;
    const selectedWeapon = unlockedWeapons.includes(user?.progression?.selectedWeapon)
        ? user.progression.selectedWeapon
        : defaultWeaponId;

    return {
        id: user?.id || uuidv4(),
        username: typeof user?.username === 'string' ? user.username : 'Player',
        usernameLower: typeof user?.usernameLower === 'string'
            ? user.usernameLower
            : String(user?.username || 'player').toLowerCase(),
        isAdmin: Boolean(user?.isAdmin),
        passwordSalt: typeof user?.passwordSalt === 'string' ? user.passwordSalt : '',
        passwordHash: typeof user?.passwordHash === 'string' ? user.passwordHash : '',
        sessionNonce: typeof user?.sessionNonce === 'string' && user.sessionNonce
            ? user.sessionNonce
            : crypto.randomBytes(16).toString('hex'),
        createdAt: typeof user?.createdAt === 'string' ? user.createdAt : new Date().toISOString(),
        lastLoginAt: typeof user?.lastLoginAt === 'string' ? user.lastLoginAt : null,
        progression: {
            metaCurrency: Number.isFinite(user?.progression?.metaCurrency) ? Math.max(0, user.progression.metaCurrency) : defaultProgression.metaCurrency,
            unlockedSkins,
            selectedSkin,
            unlockedWeapons,
            selectedWeapon,
            stats: {
                matchesPlayed: Number.isFinite(user?.progression?.stats?.matchesPlayed) ? Math.max(0, user.progression.stats.matchesPlayed) : defaultProgression.stats.matchesPlayed,
                bestWave: Number.isFinite(user?.progression?.stats?.bestWave) ? Math.max(0, user.progression.stats.bestWave) : defaultProgression.stats.bestWave,
                totalScore: Number.isFinite(user?.progression?.stats?.totalScore) ? Math.max(0, user.progression.stats.totalScore) : defaultProgression.stats.totalScore,
                totalMetaCurrencyEarned: Number.isFinite(user?.progression?.stats?.totalMetaCurrencyEarned)
                    ? Math.max(0, user.progression.stats.totalMetaCurrencyEarned)
                    : defaultProgression.stats.totalMetaCurrencyEarned
            }
        }
    };
}

function loadUserStore() {
    ensureDataStorage();

    try {
        const raw = fs.readFileSync(USERS_DB_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        const users = Array.isArray(parsed?.users) ? parsed.users.map(normalizeUserRecord) : [];
        return { users };
    } catch (error) {
        console.warn('Unable to load user store, starting fresh:', error.message);
        return { users: [] };
    }
}

gameAssetMetadataStore = loadGameAssetMetadataStore();
let userStore = loadUserStore();

function saveUserStore() {
    ensureDataStorage();
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify({
        users: userStore.users.map(normalizeUserRecord)
    }, null, 2));
}

function readAuthSecret() {
    if (process.env.AUTH_SECRET) {
        return process.env.AUTH_SECRET;
    }

    ensureDataStorage();
    const value = fs.readFileSync(AUTH_SECRET_PATH, 'utf8').trim();
    if (value) {
        return value;
    }

    const nextSecret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(AUTH_SECRET_PATH, nextSecret);
    return nextSecret;
}

const AUTH_SECRET = readAuthSecret();

function getUserById(userId) {
    return userStore.users.find((user) => user.id === userId) || null;
}

function getUserByUsername(username) {
    const normalizedUsername = String(username || '').trim().toLowerCase();
    if (!normalizedUsername) {
        return null;
    }

    return userStore.users.find((user) => user.usernameLower === normalizedUsername) || null;
}

function createPasswordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, hash };
}

function verifyPassword(password, user) {
    if (!user?.passwordSalt || !user?.passwordHash) {
        return false;
    }

    const expectedHash = Buffer.from(user.passwordHash, 'hex');
    const actualHash = Buffer.from(crypto.scryptSync(password, user.passwordSalt, 64).toString('hex'), 'hex');
    if (expectedHash.length !== actualHash.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedHash, actualHash);
}

function encodeTokenSegment(value) {
    return Buffer.from(value).toString('base64url');
}

function decodeTokenSegment(value) {
    return Buffer.from(value, 'base64url').toString('utf8');
}

function signTokenPayload(encodedPayload) {
    return crypto.createHmac('sha256', AUTH_SECRET).update(encodedPayload).digest('base64url');
}

function createAuthToken(user) {
    const payload = {
        sub: user.id,
        nonce: user.sessionNonce,
        exp: Date.now() + TOKEN_LIFETIME_MS
    };

    const encodedPayload = encodeTokenSegment(JSON.stringify(payload));
    const signature = signTokenPayload(encodedPayload);
    return `${encodedPayload}.${signature}`;
}

function verifyAuthToken(token) {
    if (typeof token !== 'string' || !token.includes('.')) {
        return null;
    }

    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
        return null;
    }

    const expectedSignature = signTokenPayload(encodedPayload);
    const expectedBuffer = Buffer.from(expectedSignature);
    const actualBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
        return null;
    }

    try {
        const payload = JSON.parse(decodeTokenSegment(encodedPayload));
        if (!payload?.sub || !payload?.nonce || !payload?.exp || payload.exp < Date.now()) {
            return null;
        }

        const user = getUserById(payload.sub);
        if (!user || user.sessionNonce !== payload.nonce) {
            return null;
        }

        return user;
    } catch (error) {
        return null;
    }
}

function parseCookieHeader(cookieHeader = '') {
    return String(cookieHeader || '')
        .split(';')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .reduce((cookies, entry) => {
            const separatorIndex = entry.indexOf('=');
            if (separatorIndex === -1) {
                return cookies;
            }

            const key = entry.slice(0, separatorIndex).trim();
            const value = entry.slice(separatorIndex + 1).trim();
            if (key) {
                cookies[key] = value;
            }
            return cookies;
        }, {});
}

function createAuthCookieHeader(token, maxAgeSeconds = Math.floor(TOKEN_LIFETIME_MS / 1000)) {
    return [
        `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
    ].join('; ');
}

function createClearedAuthCookieHeader() {
    return [
        `${AUTH_COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=0'
    ].join('; ');
}

function setAuthCookie(res, token) {
    res.append('Set-Cookie', createAuthCookieHeader(token));
}

function clearAuthCookie(res) {
    res.append('Set-Cookie', createClearedAuthCookieHeader());
}

function getTokenFromRequest(req) {
    const authorization = req.get('authorization') || '';
    if (authorization.startsWith('Bearer ')) {
        return authorization.slice('Bearer '.length).trim();
    }

    const cookies = parseCookieHeader(req.get('cookie') || '');
    return cookies[AUTH_COOKIE_NAME] ? decodeURIComponent(cookies[AUTH_COOKIE_NAME]) : '';
}

function getAuthenticatedUserFromRequest(req) {
    const token = getTokenFromRequest(req);
    return verifyAuthToken(token);
}

function requireUserAuth(req, res, next) {
    const user = getAuthenticatedUserFromRequest(req);
    if (!user) {
        return res.status(401).json({
            ok: false,
            error: 'Authentication required'
        });
    }

    req.user = user;
    next();
}

function isUserAdmin(user) {
    return Boolean(user?.isAdmin);
}

function countEffectiveAdminUsers(overrides = new Map(), deletedUserId = null) {
    let count = 0;

    for (const user of userStore.users) {
        if (deletedUserId && user.id === deletedUserId) {
            continue;
        }

        const override = overrides.get(user.id);
        const effectiveIsAdmin = override?.isAdmin ?? Boolean(user.isAdmin);
        if (effectiveIsAdmin) {
            count += 1;
        }
    }

    return count;
}

function getPublicProfile(user) {
    const unlockedSkins = sanitizeUnlockedSkins(user?.progression?.unlockedSkins);
    const unlockedWeapons = sanitizeUnlockedWeapons(user?.progression?.unlockedWeapons);
    const { skins, weapons, defaultSkinId, defaultWeaponId } = getGameAssetCatalog();

    return {
        id: user.id,
        username: user.username,
        isAdmin: isUserAdmin(user),
        metaCurrency: user.progression.metaCurrency,
        unlockedSkins,
        selectedSkin: unlockedSkins.includes(user.progression.selectedSkin)
            ? user.progression.selectedSkin
            : defaultSkinId,
        unlockedWeapons,
        selectedWeapon: unlockedWeapons.includes(user.progression.selectedWeapon)
            ? user.progression.selectedWeapon
            : defaultWeaponId,
        stats: {
            matchesPlayed: user.progression.stats.matchesPlayed,
            bestWave: user.progression.stats.bestWave,
            totalScore: user.progression.stats.totalScore,
            totalMetaCurrencyEarned: user.progression.stats.totalMetaCurrencyEarned
        },
        availableSkins: skins,
        availableWeapons: weapons.filter((weapon) => weapon.playable)
    };
}

function getActiveSocketCountForUser(userId) {
    let count = 0;
    for (const socket of io.sockets.sockets.values()) {
        if (socket.data?.authUserId === userId) {
            count += 1;
        }
    }
    return count;
}

function getAdminUserSnapshot(user) {
    const publicProfile = getPublicProfile(user);
    const activeSocketCount = getActiveSocketCountForUser(user.id);

    return {
        id: user.id,
        username: user.username,
        isAdmin: isUserAdmin(user),
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        activeSocketCount,
        passwordSet: Boolean(user.passwordHash && user.passwordSalt),
        progression: {
            metaCurrency: publicProfile.metaCurrency,
            unlockedSkins: publicProfile.unlockedSkins,
            selectedSkin: publicProfile.selectedSkin,
            unlockedWeapons: publicProfile.unlockedWeapons,
            selectedWeapon: publicProfile.selectedWeapon,
            stats: publicProfile.stats
        }
    };
}

function getAdminUsersPayload() {
    const { skins, weapons } = getGameAssetCatalog();
    const users = [...userStore.users]
        .sort((left, right) => {
            const leftTime = left.lastLoginAt ? Date.parse(left.lastLoginAt) : 0;
            const rightTime = right.lastLoginAt ? Date.parse(right.lastLoginAt) : 0;
            if (leftTime !== rightTime) {
                return rightTime - leftTime;
            }
            return left.username.localeCompare(right.username);
        })
        .map(getAdminUserSnapshot);

    return {
        ok: true,
        users,
        availableSkins: skins.map((skin) => ({
            id: skin.id,
            label: skin.label,
            cost: skin.cost
        })),
        availableWeapons: weapons
            .filter((weapon) => weapon.playable)
            .map((weapon) => ({
                id: weapon.id,
                label: weapon.label,
                cost: weapon.cost
            }))
    };
}

function parseAdminUnlockedSkinsInput(value) {
    if (Array.isArray(value)) {
        return sanitizeUnlockedSkins(value);
    }

    return sanitizeUnlockedSkins(
        String(value || '')
            .split(/[\s,]+/)
            .map((entry) => entry.trim())
            .filter(Boolean)
    );
}

function parseAdminUnlockedWeaponsInput(value) {
    if (Array.isArray(value)) {
        return sanitizeUnlockedWeapons(value);
    }

    return sanitizeUnlockedWeapons(
        String(value || '')
            .split(/[\s,]+/)
            .map((entry) => entry.trim())
            .filter(Boolean)
    );
}

function updateUserAccountFromAdmin(user, updates = {}) {
    const requestedUsername = typeof updates.username === 'string' ? updates.username.trim() : user.username;
    if (!USERNAME_PATTERN.test(requestedUsername)) {
        return {
            ok: false,
            reason: 'Username must be 3-20 characters and use letters, numbers, or underscores.'
        };
    }

    const conflictingUser = userStore.users.find((entry) => (
        entry.id !== user.id && entry.usernameLower === requestedUsername.toLowerCase()
    ));
    if (conflictingUser) {
        return {
            ok: false,
            reason: 'That username is already taken.'
        };
    }

    const requestedSelectedSkin = updates.selectedSkin !== undefined
        ? normalizeSkinTheme(updates.selectedSkin)
        : normalizeSkinTheme(user.progression.selectedSkin);
    const requestedSelectedWeapon = updates.selectedWeapon !== undefined
        ? normalizeWeaponType(updates.selectedWeapon)
        : normalizeWeaponType(user.progression.selectedWeapon);
    const requestedAdminFlag = updates.isAdmin !== undefined ? Boolean(updates.isAdmin) : Boolean(user.isAdmin);
    let unlockedSkins = updates.unlockedSkins !== undefined
        ? parseAdminUnlockedSkinsInput(updates.unlockedSkins)
        : sanitizeUnlockedSkins(user.progression.unlockedSkins);
    let unlockedWeapons = updates.unlockedWeapons !== undefined
        ? parseAdminUnlockedWeaponsInput(updates.unlockedWeapons)
        : sanitizeUnlockedWeapons(user.progression.unlockedWeapons);

    if (!unlockedSkins.includes(requestedSelectedSkin)) {
        unlockedSkins.push(requestedSelectedSkin);
        unlockedSkins = sanitizeUnlockedSkins(unlockedSkins);
    }
    if (!unlockedWeapons.includes(requestedSelectedWeapon)) {
        unlockedWeapons.push(requestedSelectedWeapon);
        unlockedWeapons = sanitizeUnlockedWeapons(unlockedWeapons);
    }

    const adminOverrides = new Map([
        [user.id, { isAdmin: requestedAdminFlag }]
    ]);
    if (!requestedAdminFlag && isUserAdmin(user) && countEffectiveAdminUsers(adminOverrides) === 0) {
        return {
            ok: false,
            reason: 'At least one admin account must remain.'
        };
    }

    user.username = requestedUsername;
    user.usernameLower = requestedUsername.toLowerCase();
    user.isAdmin = requestedAdminFlag;
    user.progression.metaCurrency = Math.max(0, Math.round(Number(updates.metaCurrency ?? user.progression.metaCurrency) || 0));
    user.progression.unlockedSkins = unlockedSkins;
    user.progression.selectedSkin = unlockedSkins.includes(requestedSelectedSkin)
        ? requestedSelectedSkin
        : normalizeSkinTheme(unlockedSkins[0]);
    user.progression.unlockedWeapons = unlockedWeapons;
    user.progression.selectedWeapon = unlockedWeapons.includes(requestedSelectedWeapon)
        ? requestedSelectedWeapon
        : normalizeWeaponType(unlockedWeapons[0]);

    user.progression.stats.matchesPlayed = Math.max(0, Math.round(Number(updates?.stats?.matchesPlayed ?? user.progression.stats.matchesPlayed) || 0));
    user.progression.stats.bestWave = Math.max(0, Math.round(Number(updates?.stats?.bestWave ?? user.progression.stats.bestWave) || 0));
    user.progression.stats.totalScore = Math.max(0, Math.round(Number(updates?.stats?.totalScore ?? user.progression.stats.totalScore) || 0));
    user.progression.stats.totalMetaCurrencyEarned = Math.max(0, Math.round(Number(
        updates?.stats?.totalMetaCurrencyEarned ?? user.progression.stats.totalMetaCurrencyEarned
    ) || 0));

    let passwordChanged = false;
    if (typeof updates.password === 'string' && updates.password.trim()) {
        const nextPassword = updates.password.trim();
        if (nextPassword.length < 6 || nextPassword.length > 64) {
            return {
                ok: false,
                reason: 'Password must be 6-64 characters long.'
            };
        }

        const passwordData = createPasswordHash(nextPassword);
        user.passwordSalt = passwordData.salt;
        user.passwordHash = passwordData.hash;
        user.sessionNonce = crypto.randomBytes(16).toString('hex');
        passwordChanged = true;
    }

    saveUserStore();
    syncSocketsForAdminUserUpdate(user, passwordChanged);

    return {
        ok: true,
        user: getAdminUserSnapshot(user),
        passwordChanged
    };
}

function deleteUserAccountFromAdmin(userId) {
    const index = userStore.users.findIndex((user) => user.id === userId);
    if (index === -1) {
        return {
            ok: false,
            reason: 'User account not found.'
        };
    }

    if (isUserAdmin(userStore.users[index]) && countEffectiveAdminUsers(new Map(), userId) === 0) {
        return {
            ok: false,
            reason: 'At least one admin account must remain.'
        };
    }

    const [removedUser] = userStore.users.splice(index, 1);
    saveUserStore();
    disconnectSocketsByUserId(removedUser.id, 'account_deleted');

    return {
        ok: true,
        user: getAdminUserSnapshot(removedUser)
    };
}

function validateCredentials(username, password) {
    const normalizedUsername = String(username || '').trim();
    const normalizedPassword = String(password || '');

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
        return {
            ok: false,
            reason: 'Username must be 3-20 characters and use letters, numbers, or underscores.'
        };
    }

    if (normalizedPassword.length < 6 || normalizedPassword.length > 64) {
        return {
            ok: false,
            reason: 'Password must be 6-64 characters long.'
        };
    }

    return {
        ok: true,
        username: normalizedUsername,
        password: normalizedPassword
    };
}

function createUserAccount(username, password) {
    const validation = validateCredentials(username, password);
    if (!validation.ok) {
        return validation;
    }

    if (getUserByUsername(validation.username)) {
        return {
            ok: false,
            reason: 'That username is already taken.'
        };
    }

    const passwordData = createPasswordHash(validation.password);
    const shouldBootstrapAdmin = userStore.users.length === 0;
    const user = normalizeUserRecord({
        id: uuidv4(),
        username: validation.username,
        usernameLower: validation.username.toLowerCase(),
        isAdmin: shouldBootstrapAdmin,
        passwordSalt: passwordData.salt,
        passwordHash: passwordData.hash,
        sessionNonce: crypto.randomBytes(16).toString('hex'),
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        progression: createDefaultProgression()
    });

    userStore.users.push(user);
    saveUserStore();

    return {
        ok: true,
        user
    };
}

function loginUserAccount(username, password) {
    const validation = validateCredentials(username, password);
    if (!validation.ok) {
        return validation;
    }

    const user = getUserByUsername(validation.username);
    if (!user || !verifyPassword(validation.password, user)) {
        return {
            ok: false,
            reason: 'Invalid username or password.'
        };
    }

    user.lastLoginAt = new Date().toISOString();
    saveUserStore();

    return {
        ok: true,
        user
    };
}

function updateUserSelectedSkin(user, skinTheme) {
    const normalizedSkin = normalizeSkinTheme(skinTheme);
    const unlockedSkins = sanitizeUnlockedSkins(user.progression.unlockedSkins);

    if (!unlockedSkins.includes(normalizedSkin)) {
        return {
            ok: false,
            reason: 'Skin is not unlocked on this account.'
        };
    }

    user.progression.selectedSkin = normalizedSkin;
    user.progression.unlockedSkins = unlockedSkins;
    saveUserStore();

    return {
        ok: true,
        profile: getPublicProfile(user)
    };
}

function updateUserSelectedWeapon(user, weaponType) {
    const normalizedWeapon = normalizeWeaponType(weaponType);
    const unlockedWeapons = sanitizeUnlockedWeapons(user.progression.unlockedWeapons);

    if (!unlockedWeapons.includes(normalizedWeapon)) {
        return {
            ok: false,
            reason: 'Weapon is not unlocked on this account.'
        };
    }

    user.progression.selectedWeapon = normalizedWeapon;
    user.progression.unlockedWeapons = unlockedWeapons;
    saveUserStore();

    return {
        ok: true,
        profile: getPublicProfile(user)
    };
}

function unlockSkinForUser(user, skinTheme) {
    const normalizedSkin = normalizeSkinTheme(skinTheme);
    const { skinCatalog } = getGameAssetCatalog();
    const skin = skinCatalog[normalizedSkin];
    if (!skin) {
        return {
            ok: false,
            reason: 'Unknown skin.'
        };
    }

    const unlockedSkins = sanitizeUnlockedSkins(user.progression.unlockedSkins);
    if (unlockedSkins.includes(normalizedSkin)) {
        return {
            ok: false,
            reason: 'Skin is already unlocked.'
        };
    }

    if (user.progression.metaCurrency < skin.cost) {
        return {
            ok: false,
            reason: `Need ${skin.cost} credits to unlock ${skin.label}.`
        };
    }

    user.progression.metaCurrency -= skin.cost;
    unlockedSkins.push(normalizedSkin);
    user.progression.unlockedSkins = sanitizeUnlockedSkins(unlockedSkins);
    user.progression.selectedSkin = normalizedSkin;
    saveUserStore();

    return {
        ok: true,
        profile: getPublicProfile(user),
        unlockedSkin: normalizedSkin
    };
}

function unlockWeaponForUser(user, weaponType) {
    const normalizedWeapon = normalizeWeaponType(weaponType);
    const { weapons } = getGameAssetCatalog();
    const weapon = weapons.find((entry) => entry.id === normalizedWeapon && entry.playable);
    if (!weapon) {
        return {
            ok: false,
            reason: 'Unknown weapon.'
        };
    }

    const unlockedWeapons = sanitizeUnlockedWeapons(user.progression.unlockedWeapons);
    if (unlockedWeapons.includes(normalizedWeapon)) {
        return {
            ok: false,
            reason: 'Weapon is already unlocked.'
        };
    }

    if (user.progression.metaCurrency < weapon.cost) {
        return {
            ok: false,
            reason: `Need ${weapon.cost} credits to unlock ${weapon.label}.`
        };
    }

    user.progression.metaCurrency -= weapon.cost;
    unlockedWeapons.push(normalizedWeapon);
    user.progression.unlockedWeapons = sanitizeUnlockedWeapons(unlockedWeapons);
    user.progression.selectedWeapon = normalizedWeapon;
    saveUserStore();

    return {
        ok: true,
        profile: getPublicProfile(user),
        unlockedWeapon: normalizedWeapon
    };
}

function calculateMetaCurrencyReward(score, wave) {
    const safeScore = Math.max(0, Number(score) || 0);
    const safeWave = Math.max(1, Number(wave) || 1);
    return Math.max(0, Math.floor(safeScore / 20) + Math.max(0, safeWave - 1) * 25);
}

function awardProgressionToUser(user, score, wave, selectedSkin = null) {
    const reward = calculateMetaCurrencyReward(score, wave);
    const { defaultSkinId } = getGameAssetCatalog();
    const requestedSkin = normalizeSkinTheme(selectedSkin || defaultSkinId);

    user.progression.metaCurrency += reward;
    user.progression.unlockedSkins = sanitizeUnlockedSkins(user.progression.unlockedSkins);
    user.progression.selectedSkin = user.progression.unlockedSkins.includes(requestedSkin)
        ? requestedSkin
        : user.progression.selectedSkin;
    user.progression.stats.matchesPlayed += 1;
    user.progression.stats.bestWave = Math.max(user.progression.stats.bestWave, Math.max(1, Number(wave) || 1));
    user.progression.stats.totalScore += Math.max(0, Number(score) || 0);
    user.progression.stats.totalMetaCurrencyEarned += reward;
    user.lastLoginAt = new Date().toISOString();
    saveUserStore();

    return {
        reward,
        profile: getPublicProfile(user)
    };
}

function getSocketAuthToken(socket) {
    const directToken = socket.handshake?.auth?.token;
    if (typeof directToken === 'string' && directToken) {
        return directToken;
    }

    const cookies = parseCookieHeader(socket.handshake?.headers?.cookie || '');
    return cookies[AUTH_COOKIE_NAME] ? decodeURIComponent(cookies[AUTH_COOKIE_NAME]) : '';
}

function getAuthenticatedUserFromSocket(socket) {
    return verifyAuthToken(getSocketAuthToken(socket));
}

// Game rooms storage
const gameRooms = new Map();
const blockedIps = new Set();
let blockNewConnections = false;

function toForwardSlashPath(value) {
    return value.replace(/\\/g, '/');
}

function isPathInside(parentPath, candidatePath) {
    const relativePath = path.relative(parentPath, candidatePath);
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function resolveAssetRelativePath(inputPath = '') {
    const rawPath = typeof inputPath === 'string' ? inputPath.trim() : '';
    const normalizedRelativePath = rawPath
        ? path.normalize(rawPath).replace(/^([/\\])+/, '')
        : '';
    const absolutePath = path.resolve(ASSETS_ROOT, normalizedRelativePath);

    if (!isPathInside(ASSETS_ROOT, absolutePath)) {
        throw new Error('Asset path is outside the allowed assets directory.');
    }

    return {
        absolutePath,
        relativePath: toForwardSlashPath(path.relative(ASSETS_ROOT, absolutePath))
    };
}

function getAssetPublicUrl(relativePath) {
    const normalizedRelativePath = (relativePath || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return normalizedRelativePath ? `/assets/${normalizedRelativePath}` : '/assets';
}

function inferGameAssetCategory(relativePath = '') {
    const normalizedPath = String(relativePath || '').replace(/\\/g, '/').toLowerCase();
    if (normalizedPath.startsWith('weapons/')) {
        return 'weaponArt';
    }
    if (normalizedPath.startsWith('sprites/')) {
        return normalizedPath.includes('enemy') ? 'enemySprite' : 'playerSkin';
    }
    return 'genericAsset';
}

function listConfiguredGameAssetMetadata() {
    return Object.fromEntries(
        Object.entries(gameAssetMetadataStore.items).map(([relativePath, entry]) => [
            relativePath,
            {
                ...entry,
                category: entry.category || inferGameAssetCategory(relativePath)
            }
        ])
    );
}

function decodeUploadedAssetBuffer(contentBase64) {
    const buffer = Buffer.from(contentBase64, 'base64');
    if (!buffer.length) {
        throw new Error('Uploaded file is empty or invalid.');
    }

    if (buffer.length > MAX_ASSET_UPLOAD_BYTES) {
        throw new Error(`File exceeds ${MAX_ASSET_UPLOAD_BYTES} bytes.`);
    }

    return buffer;
}

async function writeAssetFile({ directory = '', fileName, contentBase64, overwrite = false }) {
    if (!fileName || /[<>:"|?*\x00-\x1F\\/]/.test(fileName)) {
        throw new Error('File name is missing or contains invalid characters.');
    }

    const buffer = decodeUploadedAssetBuffer(contentBase64);
    const { absolutePath: targetDirectoryAbsolutePath, relativePath: targetDirectoryRelativePath } = resolveAssetRelativePath(directory);
    const targetFileAbsolutePath = path.join(targetDirectoryAbsolutePath, fileName);

    if (!isPathInside(ASSETS_ROOT, targetFileAbsolutePath)) {
        throw new Error('Upload path is invalid.');
    }

    await fs.promises.writeFile(targetFileAbsolutePath, buffer, { flag: overwrite ? 'w' : 'wx' });
    invalidateGameAssetCatalog();

    return {
        relativePath: targetDirectoryRelativePath ? `${targetDirectoryRelativePath}/${fileName}` : fileName,
        overwritten: overwrite
    };
}

function buildAdminGameAssetCatalogPayload() {
    const catalog = getGameAssetCatalog();
    return {
        ok: true,
        defaultSkinId: catalog.defaultSkinId,
        defaultWeaponId: catalog.defaultWeaponId,
        defaultEnemySpriteId: catalog.defaultEnemySpriteId,
        skins: catalog.skins,
        enemySprites: catalog.enemySprites,
        weapons: catalog.weapons,
        metadata: listConfiguredGameAssetMetadata()
    };
}

async function listAssetDirectory(relativeDirectory = '') {
    const { absolutePath, relativePath } = resolveAssetRelativePath(relativeDirectory);
    const stat = await fs.promises.stat(absolutePath).catch(() => null);

    if (!stat || !stat.isDirectory()) {
        throw new Error('Asset directory does not exist.');
    }

    const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
    const detailedEntries = await Promise.all(entries.map(async (entry) => {
        const entryRelativePath = relativePath
            ? `${relativePath}/${entry.name}`
            : entry.name;
        const entryAbsolutePath = path.join(absolutePath, entry.name);
        const entryStat = await fs.promises.stat(entryAbsolutePath);

        return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            relativePath: toForwardSlashPath(entryRelativePath),
            publicUrl: entry.isDirectory() ? null : getAssetPublicUrl(toForwardSlashPath(entryRelativePath)),
            size: entry.isDirectory() ? null : entryStat.size,
            modifiedAt: entryStat.mtime.toISOString()
        };
    }));

    detailedEntries.sort((left, right) => {
        if (left.type !== right.type) {
            return left.type === 'directory' ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
    });

    const segments = relativePath
        ? relativePath.split('/').filter(Boolean).map((segment, index, allSegments) => ({
            name: segment,
            relativePath: allSegments.slice(0, index + 1).join('/')
        }))
        : [];

    return {
        currentDirectory: relativePath,
        breadcrumbs: [
            { name: 'assets', relativePath: '' },
            ...segments
        ],
        entries: detailedEntries
    };
}

async function collectSvgTemplates(relativeDirectory = '') {
    const { absolutePath, relativePath } = resolveAssetRelativePath(relativeDirectory);
    const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
    const templates = [];

    for (const entry of entries) {
        const entryRelativePath = relativePath
            ? `${relativePath}/${entry.name}`
            : entry.name;

        if (entry.isDirectory()) {
            const nestedTemplates = await collectSvgTemplates(entryRelativePath);
            templates.push(...nestedTemplates);
            continue;
        }

        if (/\.svg$/i.test(entry.name)) {
            templates.push({
                name: entry.name,
                relativePath: toForwardSlashPath(entryRelativePath),
                publicUrl: getAssetPublicUrl(toForwardSlashPath(entryRelativePath))
            });
        }
    }

    templates.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return templates;
}

function normalizeIpAddress(ipAddress) {
    if (!ipAddress || typeof ipAddress !== 'string') {
        return 'unknown';
    }

    const trimmed = ipAddress.trim();
    if (!trimmed) {
        return 'unknown';
    }

    if (trimmed.includes(',')) {
        return normalizeIpAddress(trimmed.split(',')[0]);
    }

    if (trimmed.startsWith('::ffff:')) {
        return trimmed.slice(7);
    }

    return trimmed;
}

function getClientIp(source) {
    if (!source) {
        return 'unknown';
    }

    const headers = source.handshake?.headers || source.headers || {};
    const forwardedFor = headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return normalizeIpAddress(forwardedFor);
    }

    const address = source.handshake?.address
        || source.conn?.remoteAddress
        || source.request?.socket?.remoteAddress
        || source.socket?.remoteAddress
        || source.ip;

    return normalizeIpAddress(address);
}

function isIpBlocked(ipAddress) {
    return blockedIps.has(normalizeIpAddress(ipAddress));
}

function findRoomByPlayerId(playerId) {
    for (const room of gameRooms.values()) {
        if (room.players.has(playerId)) {
            return room;
        }
    }

    return null;
}

function disconnectSocketForModeration(socket, reason, metadata = {}) {
    if (!socket) {
        return;
    }

    socket.data = socket.data || {};
    socket.data.moderationReason = reason;
    socket.data.moderationMetadata = metadata;
    socket.emit('adminNotice', {
        type: reason,
        ...metadata
    });
    socket.disconnect(true);
}

function disconnectSocketsByIp(ipAddress, reason = 'ip_blocked') {
    const normalizedIp = normalizeIpAddress(ipAddress);

    for (const socket of io.sockets.sockets.values()) {
        if (normalizeIpAddress(socket.data?.clientIp) === normalizedIp) {
            disconnectSocketForModeration(socket, reason, { ipAddress: normalizedIp });
        }
    }
}

function disconnectSocketsByUserId(userId, reason = 'account_deleted') {
    for (const socket of io.sockets.sockets.values()) {
        if (socket.data?.authUserId === userId) {
            disconnectSocketForModeration(socket, reason, { userId });
        }
    }
}

function syncSocketsForAdminUserUpdate(user, forceReconnect = false) {
    for (const socket of io.sockets.sockets.values()) {
        if (socket.data?.authUserId !== user.id) {
            continue;
        }

        if (forceReconnect) {
            disconnectSocketForModeration(socket, 'account_password_reset', { userId: user.id });
            continue;
        }

        socket.data.authUsername = user.username;
        socket.emit('authState', {
            authenticated: true,
            profile: getPublicProfile(user)
        });
    }
}

function serializeRoomSummary(room) {
    return {
        id: room.id,
        name: room.name,
        mode: room.mode,
        matchSettings: room.isPvpMode()
            ? {
                killLimit: room.pvpState.killLimit,
                timeLimitMs: room.pvpState.timeLimitMs
            }
            : null,
        playerCount: room.players.size,
        spectatorCount: room.spectators.size,
        maxPlayers: GAME_CONFIG.maxPlayersPerRoom,
        gameStarted: room.gameStarted,
        locked: room.locked,
        hostId: room.hostId,
        players: Array.from(room.players.values()).map(player => ({
            id: player.id,
            name: player.name,
            alive: player.alive,
            score: player.score,
            skinTheme: player.skinTheme,
            isHost: player.id === room.hostId
        }))
    };
}

function emitRoomList(target = io) {
    target.emit('roomList', Array.from(gameRooms.values()).map(serializeRoomSummary));
}

function emitRoomState(room) {
    io.to(room.id).emit('roomState', room.getRoomState());
}

function endRoomByConsensus(room) {
    if (!room || !room.gameStarted) {
        return;
    }

    const finalWave = room.wave;
    const playerEntries = Array.from(room.players.entries());
    const spectatorIds = Array.from(room.spectators.values());

    room.gameStarted = false;
    room.shopPhase = false;
    room.shopEndTime = 0;
    room.resetEndMatchVotes();

    for (const [playerId, player] of playerEntries) {
        let rank = null;
        if (player.score > 0) {
            rank = addToLeaderboard(player.accountUsername || player.name, player.score, finalWave, {
                accountUserId: player.accountUserId
            });
        }

        const rewardSummary = room.awardPersistentProgress(player, finalWave);
        if (rewardSummary?.profile) {
            io.to(playerId).emit('profileUpdated', rewardSummary.profile);
        }

        io.to(playerId).emit('gameEndedPersonal', {
            finalScore: player.score,
            finalWave,
            rank,
            leaderboard: getLeaderboard(),
            metaReward: rewardSummary?.reward || 0,
            metaCurrency: rewardSummary?.profile?.metaCurrency ?? null,
            reason: 'consensus'
        });

        const playerSocket = io.sockets.sockets.get(playerId);
        if (playerSocket) {
            playerSocket.leave(room.id);
        }
    }

    for (const spectatorId of spectatorIds) {
        io.to(spectatorId).emit('gameEnded', {
            finalWave,
            leaderboard: getLeaderboard(),
            reason: 'consensus'
        });

        const spectatorSocket = io.sockets.sockets.get(spectatorId);
        if (spectatorSocket) {
            spectatorSocket.leave(room.id);
        }
    }

    room.players.clear();
    room.spectators.clear();
    room.hostId = null;
    gameRooms.delete(room.id);
    emitRoomList();
}

function normalizeLeaderboardDate(value) {
    const normalizedValue = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
        return normalizedValue;
    }
    return new Date().toISOString().split('T')[0];
}

function normalizeLeaderboardNameKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function compareLeaderboardEntries(left, right) {
    if (right.score !== left.score) {
        return right.score - left.score;
    }
    if (right.wave !== left.wave) {
        return right.wave - left.wave;
    }
    const dateCompare = left.date.localeCompare(right.date);
    if (dateCompare !== 0) {
        return dateCompare;
    }
    const nameCompare = left.name.localeCompare(right.name);
    if (nameCompare !== 0) {
        return nameCompare;
    }
    return left.id.localeCompare(right.id);
}

function isLeaderboardImprovement(candidate, existingEntry) {
    if (!existingEntry) {
        return true;
    }
    if (candidate.score !== existingEntry.score) {
        return candidate.score > existingEntry.score;
    }
    if (candidate.wave !== existingEntry.wave) {
        return candidate.wave > existingEntry.wave;
    }
    return false;
}

function getLeaderboardOwnerSnapshot(entry = {}) {
    const accountUserId = typeof entry.accountUserId === 'string' && entry.accountUserId.trim()
        ? entry.accountUserId.trim()
        : '';
    const ownerType = entry.ownerType === 'account' || entry.ownerType === 'guest'
        ? entry.ownerType
        : '';
    const ownerKey = typeof entry.ownerKey === 'string' ? entry.ownerKey.trim() : '';

    if (accountUserId) {
        return {
            ownerType: 'account',
            ownerKey: ownerKey || `account:${accountUserId}`,
            accountUserId
        };
    }

    if (ownerType && ownerKey) {
        return {
            ownerType,
            ownerKey,
            accountUserId: null
        };
    }

    const guestNameKey = normalizeLeaderboardNameKey(entry.name);
    return {
        ownerType: 'guest',
        ownerKey: guestNameKey ? `guest:${guestNameKey}` : '',
        accountUserId: null
    };
}

function normalizeLeaderboardEntry(entry = {}) {
    const owner = getLeaderboardOwnerSnapshot(entry);
    return {
        id: typeof entry.id === 'string' && entry.id ? entry.id : uuidv4(),
        name: String(entry.name || 'Player').trim().slice(0, 32) || 'Player',
        score: Math.max(0, Math.round(Number(entry.score) || 0)),
        wave: Math.max(0, Math.round(Number(entry.wave) || 0)),
        date: normalizeLeaderboardDate(entry.date),
        ownerType: owner.ownerType,
        ownerKey: owner.ownerKey,
        accountUserId: owner.accountUserId
    };
}

function createDefaultLeaderboardStore() {
    return {
        maxEntries: 10,
        topScores: [
            normalizeLeaderboardEntry({ name: 'TestPlayer1', score: 1500, wave: 8, date: '2025-10-16' }),
            normalizeLeaderboardEntry({ name: 'TestPlayer2', score: 1200, wave: 6, date: '2025-10-16' }),
            normalizeLeaderboardEntry({ name: 'TestPlayer3', score: 800, wave: 4, date: '2025-10-16' })
        ]
    };
}

function normalizeLeaderboardStore(store = {}) {
    const defaults = createDefaultLeaderboardStore();
    const maxEntries = Math.max(1, Math.round(Number(store?.maxEntries) || defaults.maxEntries));
    const bestEntriesByOwner = new Map();

    (Array.isArray(store?.topScores) ? store.topScores : defaults.topScores)
        .map(normalizeLeaderboardEntry)
        .forEach((entry) => {
            const ownerKey = entry.ownerKey || `entry:${entry.id}`;
            const existingEntry = bestEntriesByOwner.get(ownerKey);
            if (!existingEntry || isLeaderboardImprovement(entry, existingEntry)) {
                bestEntriesByOwner.set(ownerKey, entry);
            }
        });

    const topScores = Array.from(bestEntriesByOwner.values()).sort(compareLeaderboardEntries);

    return {
        maxEntries,
        topScores
    };
}

function loadLeaderboardStore() {
    ensureDataStorage();

    try {
        const raw = fs.readFileSync(LEADERBOARD_DB_PATH, 'utf8');
        return normalizeLeaderboardStore(JSON.parse(raw));
    } catch (error) {
        return createDefaultLeaderboardStore();
    }
}

let globalLeaderboard = loadLeaderboardStore();

function saveLeaderboardStore() {
    ensureDataStorage();
    globalLeaderboard = normalizeLeaderboardStore(globalLeaderboard);
    fs.writeFileSync(LEADERBOARD_DB_PATH, JSON.stringify(globalLeaderboard, null, 2));
}

function getSortedLeaderboardEntries() {
    return [...globalLeaderboard.topScores].sort(compareLeaderboardEntries);
}

function getLeaderboard() {
    return getSortedLeaderboardEntries()
        .slice(0, globalLeaderboard.maxEntries)
        .map((entry) => ({ ...entry }));
}

function getAdminLeaderboardEntries() {
    return getSortedLeaderboardEntries().map((entry) => ({ ...entry }));
}

function getLeaderboardRankByEntryId(entryId) {
    return getSortedLeaderboardEntries().findIndex((entry) => entry.id === entryId) + 1;
}

function addToLeaderboard(playerName, score, wave, options = {}) {
    const entry = normalizeLeaderboardEntry({
        name: playerName,
        score,
        wave,
        date: new Date().toISOString().split('T')[0],
        accountUserId: options.accountUserId,
        ownerType: options.ownerType,
        ownerKey: options.ownerKey
    });

    const existingIndex = globalLeaderboard.topScores.findIndex((leaderboardEntry) => {
        const existingOwnerKey = leaderboardEntry.ownerKey || `entry:${leaderboardEntry.id}`;
        const nextOwnerKey = entry.ownerKey || `entry:${entry.id}`;
        return existingOwnerKey === nextOwnerKey;
    });

    if (existingIndex === -1) {
        globalLeaderboard.topScores.push(entry);
        saveLeaderboardStore();
        return getLeaderboardRankByEntryId(entry.id);
    }

    const existingEntry = globalLeaderboard.topScores[existingIndex];
    if (!isLeaderboardImprovement(entry, existingEntry)) {
        saveLeaderboardStore();
        return getLeaderboardRankByEntryId(existingEntry.id);
    }

    globalLeaderboard.topScores.splice(existingIndex, 1, {
        ...existingEntry,
        ...entry,
        id: existingEntry.id,
        ownerType: existingEntry.ownerType || entry.ownerType,
        ownerKey: existingEntry.ownerKey || entry.ownerKey,
        accountUserId: existingEntry.accountUserId || entry.accountUserId
    });
    saveLeaderboardStore();
    return getLeaderboardRankByEntryId(existingEntry.id);
}

function getLeaderboardEntryById(entryId) {
    return globalLeaderboard.topScores.find((entry) => entry.id === entryId) || null;
}

function addLeaderboardEntryFromAdmin(payload = {}) {
    const entry = normalizeLeaderboardEntry(payload);
    const existingEntry = globalLeaderboard.topScores.find((candidate) => {
        const existingOwnerKey = candidate.ownerKey || `entry:${candidate.id}`;
        const nextOwnerKey = entry.ownerKey || `entry:${entry.id}`;
        return existingOwnerKey === nextOwnerKey;
    });

    if (!existingEntry) {
        globalLeaderboard.topScores.push(entry);
        saveLeaderboardStore();
        return getLeaderboardEntryById(entry.id);
    }

    if (!isLeaderboardImprovement(entry, existingEntry)) {
        saveLeaderboardStore();
        return getLeaderboardEntryById(existingEntry.id);
    }

    Object.assign(existingEntry, {
        ...entry,
        id: existingEntry.id,
        ownerType: existingEntry.ownerType || entry.ownerType,
        ownerKey: existingEntry.ownerKey || entry.ownerKey,
        accountUserId: existingEntry.accountUserId || entry.accountUserId
    });
    saveLeaderboardStore();
    return getLeaderboardEntryById(existingEntry.id);
}

function updateLeaderboardEntryFromAdmin(entryId, payload = {}) {
    const entry = getLeaderboardEntryById(entryId);
    if (!entry) {
        return {
            ok: false,
            reason: 'Leaderboard entry not found.'
        };
    }

    Object.assign(entry, normalizeLeaderboardEntry({
        ...entry,
        ...payload,
        id: entry.id
    }));
    saveLeaderboardStore();

    return {
        ok: true,
        entry: getLeaderboardEntryById(entryId)
    };
}

function deleteLeaderboardEntryFromAdmin(entryId) {
    const previousLength = globalLeaderboard.topScores.length;
    globalLeaderboard.topScores = globalLeaderboard.topScores.filter((entry) => entry.id !== entryId);
    if (globalLeaderboard.topScores.length === previousLength) {
        return {
            ok: false,
            reason: 'Leaderboard entry not found.'
        };
    }

    saveLeaderboardStore();
    return {
        ok: true
    };
}

function clearLeaderboardFromAdmin() {
    globalLeaderboard.topScores = [];
    saveLeaderboardStore();
}

function formatMilliseconds(ms) {
    if (!ms || ms < 0) {
        return '0s';
    }

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
}

function requireAdminAuth(req, res, next) {
    const user = getAuthenticatedUserFromRequest(req);
    if (!user) {
        return res.status(401).json({
            ok: false,
            error: 'Admin account sign-in required.'
        });
    }

    if (!isUserAdmin(user)) {
        return res.status(403).json({
            ok: false,
            error: 'This account does not have admin access.'
        });
    }

    req.user = user;
    next();
}

function getRoomAdminSnapshot(room) {
    const now = Date.now();
    const currentSpawnRate = typeof room.getCurrentSpawnRate === 'function'
        ? room.getCurrentSpawnRate()
        : Math.max(
            800,
            GAME_CONFIG.enemy.spawnRate - (room.wave - 1) * GAME_CONFIG.enemy.spawnRateDecrease
        );
    const players = Array.from(room.players.values());
    const alivePlayers = players.filter(player => player.alive).length;
    const hostPlayer = room.hostId ? room.players.get(room.hostId) : null;
    const endVoteState = room.getEndMatchVoteState();
    const votingPlayerIds = new Set(endVoteState.playerIds || []);
    const arena = room.arena
        ? {
            id: room.arena.id,
            name: room.arena.name,
            themeId: room.arena.themeId,
            layoutId: room.arena.layoutId,
            obstacleCount: Array.isArray(room.arena.obstacles) ? room.arena.obstacles.length : 0,
            decorCount: Array.isArray(room.arena.decor) ? room.arena.decor.length : 0
        }
        : null;

    return {
        id: room.id,
        name: room.name,
        locked: room.locked,
        hostId: room.hostId,
        hostName: hostPlayer ? hostPlayer.name : null,
        gameStarted: room.gameStarted,
        playerCount: room.players.size,
        spectatorCount: room.spectators.size,
        maxPlayers: GAME_CONFIG.maxPlayersPerRoom,
        alivePlayers,
        deadPlayers: room.players.size - alivePlayers,
        wave: room.wave,
        bossWave: Boolean(room.waveProfile?.bossWave),
        shopPhase: room.shopPhase,
        shopEndsAt: room.shopPhase ? room.shopEndTime : null,
        shopEndsInMs: room.shopPhase ? Math.max(0, room.shopEndTime - now) : 0,
        shopEndsInLabel: room.shopPhase ? formatMilliseconds(Math.max(0, room.shopEndTime - now)) : '0s',
        shopEndVote: endVoteState,
        gameStartTime: room.gameStartTime || null,
        gameDurationMs: room.gameStarted && room.gameStartTime ? now - room.gameStartTime : 0,
        gameDurationLabel: room.gameStarted && room.gameStartTime ? formatMilliseconds(now - room.gameStartTime) : '0s',
        waveStartTime: room.waveStartTime || null,
        enemiesAlive: room.enemies.size,
        enemiesSpawnedThisWave: room.enemiesThisWave,
        maxEnemiesPerWave: room.maxEnemiesPerWave,
        enemiesRemainingToSpawn: Math.max(0, room.maxEnemiesPerWave - room.enemiesThisWave),
        activeBullets: room.bullets.size,
        activePowerUps: room.powerUps.size,
        activeParticles: room.particles.size,
        currentEnemySpawnRateMs: currentSpawnRate,
        currentEnemySpawnRateLabel: `${currentSpawnRate} ms`,
        arena,
        players: players.map(player => ({
            id: player.id,
            name: player.name,
            alive: player.alive,
            isHost: player.id === room.hostId,
            health: Math.round(player.health),
            maxHealth: player.maxHealth,
            shield: Math.round(player.shield),
            score: player.score,
            money: player.money,
            ipAddress: player.ipAddress,
            ipBlocked: isIpBlocked(player.ipAddress),
            skinTheme: player.skinTheme,
            currentWeapon: player.currentWeapon,
            votedToEndMatch: votingPlayerIds.has(player.id),
            powerUps: {
                speed: player.powerUpEffects.speed > 0,
                damage: player.powerUpEffects.damage > 0,
                shield: player.powerUpEffects.shield > 0
            },
            upgradeLevels: { ...player.upgrades }
        }))
    };
}

function getAdminSummary() {
    const rooms = Array.from(gameRooms.values());
    const roomSnapshots = rooms.map(getRoomAdminSnapshot);
    const totals = roomSnapshots.reduce((accumulator, room) => {
        accumulator.players += room.playerCount;
        accumulator.spectators += room.spectatorCount;
        accumulator.alivePlayers += room.alivePlayers;
        accumulator.enemies += room.enemiesAlive;
        accumulator.bullets += room.activeBullets;
        accumulator.powerUps += room.activePowerUps;
        accumulator.particles += room.activeParticles;
        accumulator.shopRooms += room.shopPhase ? 1 : 0;
        return accumulator;
    }, {
        players: 0,
        spectators: 0,
        alivePlayers: 0,
        enemies: 0,
        bullets: 0,
        powerUps: 0,
        particles: 0,
        shopRooms: 0
    });

    return {
        generatedAt: new Date().toISOString(),
        uptimeMs: process.uptime() * 1000,
        uptimeLabel: formatMilliseconds(process.uptime() * 1000),
        adminAccountRequired: true,
        moderation: {
            blockNewConnections,
            blockedIps: Array.from(blockedIps.values()).sort()
        },
        totals: {
            connectedClients: io.engine.clientsCount,
            roomCount: rooms.length,
            activeGames: roomSnapshots.filter(room => room.gameStarted).length,
            userAccounts: userStore.users.length,
            players: totals.players,
            spectators: totals.spectators,
            alivePlayers: totals.alivePlayers,
            enemies: totals.enemies,
            bullets: totals.bullets,
            powerUps: totals.powerUps,
            particles: totals.particles,
            shopRooms: totals.shopRooms
        },
        memory: process.memoryUsage(),
        leaderboard: getLeaderboard(),
        rooms: roomSnapshots
    };
}

class Vector2D {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(vector) {
        return new Vector2D(this.x + vector.x, this.y + vector.y);
    }

    subtract(vector) {
        return new Vector2D(this.x - vector.x, this.y - vector.y);
    }

    distance(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    multiply(scalar) {
        return new Vector2D(this.x * scalar, this.y * scalar);
    }

    normalize() {
        const length = this.length();
        if (length === 0) return new Vector2D(0, 0);
        return new Vector2D(this.x / length, this.y / length);
    }

    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    distance(vector) {
        return this.subtract(vector).length();
    }
}

class ServerParticle {
    constructor(id, x, y, velX, velY, color, lifetime, size) {
        this.id = id;
        this.position = new Vector2D(x, y);
        this.velocity = new Vector2D(velX, velY);
        this.color = color;
        this.lifetime = lifetime;
        this.maxLifetime = lifetime;
        this.size = size;
        this.age = 0;
    }

    update(deltaTime) {
        this.position = this.position.add(this.velocity.multiply(deltaTime));
        this.velocity = this.velocity.multiply(0.95); // Friction
        this.age += deltaTime * 1000;
    }

    isExpired() {
        return this.age > this.lifetime;
    }

    serialize() {
        const alpha = 1 - (this.age / this.lifetime);
        return {
            id: this.id,
            x: this.position.x,
            y: this.position.y,
            color: this.color,
            size: this.size,
            alpha: alpha
        };
    }
}

class ServerPowerUp {
    constructor(id, x, y, type) {
        this.id = id;
        this.position = new Vector2D(x, y);
        this.type = type; // 'health', 'speed', 'damage', 'shield', 'grenade'
        this.lifetime = GAME_CONFIG.powerup.lifetime;
        this.age = 0;
        this.collected = false;
    }

    update(deltaTime) {
        this.age += deltaTime * 1000;
    }

    isExpired() {
        return this.age > this.lifetime || this.collected;
    }

    collect() {
        this.collected = true;
    }

    serialize() {
        const pulse = Math.sin(this.age / 200) * 0.2 + 0.8; // Pulsing effect
        return {
            id: this.id,
            x: this.position.x,
            y: this.position.y,
            type: this.type,
            pulse: pulse
        };
    }
}

class ServerGrenade {
    constructor(id, x, y, velX, velY, ownerId) {
        this.id = id;
        this.position = new Vector2D(x, y);
        this.velocity = new Vector2D(velX, velY);
        this.ownerId = ownerId;
        this.age = 0;
        this.fuse = GAME_CONFIG.grenade.fuse;
        this.radius = GAME_CONFIG.grenade.radius;
        this.damage = GAME_CONFIG.grenade.damage;
        this.size = GAME_CONFIG.grenade.size;
        this.color = '#7fd8ff';
    }

    update(deltaTime, arena = null) {
        const bounce = GAME_CONFIG.grenade.bounce;
        const friction = Math.pow(GAME_CONFIG.grenade.friction, deltaTime * 60);
        const arenaWidth = arena?.width || GAME_CONFIG.canvas.width;
        const arenaHeight = arena?.height || GAME_CONFIG.canvas.height;

        const horizontalTarget = new Vector2D(this.position.x + this.velocity.x * deltaTime, this.position.y);
        if (
            horizontalTarget.x < this.size
            || horizontalTarget.x > arenaWidth - this.size
            || isPositionBlockedInArena(arena, horizontalTarget, this.size, { margin: 1 })
        ) {
            this.velocity.x *= -bounce;
        } else {
            this.position.x = horizontalTarget.x;
        }

        const verticalTarget = new Vector2D(this.position.x, this.position.y + this.velocity.y * deltaTime);
        if (
            verticalTarget.y < this.size
            || verticalTarget.y > arenaHeight - this.size
            || isPositionBlockedInArena(arena, verticalTarget, this.size, { margin: 1 })
        ) {
            this.velocity.y *= -bounce;
        } else {
            this.position.y = verticalTarget.y;
        }

        this.velocity = this.velocity.multiply(friction);
        if (Math.abs(this.velocity.x) < 6) {
            this.velocity.x = 0;
        }
        if (Math.abs(this.velocity.y) < 6) {
            this.velocity.y = 0;
        }

        this.age += deltaTime * 1000;
    }

    isExpired() {
        return this.age >= this.fuse;
    }

    serialize() {
        const fuseProgress = Math.max(0, Math.min(1, this.age / Math.max(1, this.fuse)));
        return {
            id: this.id,
            x: this.position.x,
            y: this.position.y,
            vx: this.velocity.x,
            vy: this.velocity.y,
            ownerId: this.ownerId,
            size: this.size,
            radius: this.radius,
            color: this.color,
            fuseProgress
        };
    }
}

class ServerPlayer {
    constructor(id, name, x, y, skinTheme = null, ipAddress = 'unknown', account = null, loadout = null) {
        this.id = id;
        this.name = name;
        this.ipAddress = normalizeIpAddress(ipAddress);
        this.skinTheme = normalizeSkinTheme(skinTheme);
        this.unlockedWeapons = sanitizeUnlockedWeapons(loadout?.unlockedWeapons);
        this.selectedWeapon = this.unlockedWeapons.includes(normalizeWeaponType(loadout?.selectedWeapon))
            ? normalizeWeaponType(loadout.selectedWeapon)
            : getGameAssetCatalog().defaultWeaponId;
        this.position = new Vector2D(x, y);
        this.velocity = new Vector2D(0, 0);
        this.angle = 0;
        this.health = GAME_CONFIG.player.maxHealth;
        this.score = 0;
        this.kills = 0;
        this.deaths = 0;
        this.money = 0;
        this.alive = true;
        this.respawnAt = 0;
        this.lastShotTime = 0;
        this.currentWeapon = this.selectedWeapon;
        this.weaponAmmo = this.createDefaultWeaponAmmo();
        this.reloadState = {
            active: false,
            weaponType: null,
            endsAt: 0,
            durationMs: 0
        };
        this.chargeState = {
            active: false,
            weaponType: null,
            startedAt: 0,
            endsAt: 0,
            durationMs: 0
        };
        this.grenadeCount = GAME_CONFIG.grenade.maxCount;
        this.grenadeCooldownEndsAt = 0;
        this.accountUserId = account?.userId || null;
        this.accountUsername = account?.username || null;
        this.matchRewardGranted = false;
        this.lastRewardSummary = null;
        this.upgrades = {
            damage: 0,
            fireRate: 0,
            health: 0,
            speed: 0,
            shield: 0,
            grenade: 0
        };
        
        // Power-up effects
        this.speedBoost = 1.0;
        this.damageBoost = 1.0;
        this.shield = 0;
        this.powerUpEffects = {
            speed: 0,
            damage: 0,
            shield: 0
        };
        
        this.inputState = {
            up: false,
            down: false,
            left: false,
            right: false,
            shooting: false,
            mouseX: 0,
            mouseY: 0
        };
        this.spawnSlot = 0;
    }

    createDefaultWeaponAmmo() {
        return Object.fromEntries(
            Object.entries(WEAPON_CONFIG).map(([weaponType, weapon]) => [
                weaponType,
                weapon.magazineSize || 1
            ])
        );
    }

    getMagazineSize(weaponType = this.currentWeapon) {
        const weapon = getWeaponConfig(weaponType);
        return weapon.magazineSize || 1;
    }

    canUseWeapon(weaponType = this.currentWeapon) {
        return this.unlockedWeapons.includes(normalizeWeaponType(weaponType));
    }

    getAmmoForWeapon(weaponType = this.currentWeapon) {
        const normalizedWeapon = getSafeWeaponType(weaponType);
        if (!Number.isFinite(this.weaponAmmo[normalizedWeapon])) {
            this.weaponAmmo[normalizedWeapon] = this.getMagazineSize(normalizedWeapon);
        }
        return this.weaponAmmo[normalizedWeapon];
    }

    refillWeapon(weaponType = this.currentWeapon) {
        const normalizedWeapon = getSafeWeaponType(weaponType);
        this.weaponAmmo[normalizedWeapon] = this.getMagazineSize(normalizedWeapon);
    }

    refillAllWeapons() {
        Object.keys(WEAPON_CONFIG).forEach((weaponType) => {
            this.refillWeapon(weaponType);
        });
    }

    clearWeaponCharge() {
        if (!this.chargeState.active && !this.chargeState.weaponType) {
            return false;
        }

        this.chargeState = {
            active: false,
            weaponType: null,
            startedAt: 0,
            endsAt: 0,
            durationMs: 0
        };
        return true;
    }

    startWeaponCharge(weaponType = this.currentWeapon, now = Date.now()) {
        const normalizedWeapon = getSafeWeaponType(weaponType || this.currentWeapon);
        const weapon = getWeaponConfig(normalizedWeapon);
        const durationMs = weapon.chargeTime || 0;

        if (durationMs <= 0) {
            this.clearWeaponCharge();
            return this.getChargeSnapshot(now);
        }

        this.chargeState = {
            active: true,
            weaponType: normalizedWeapon,
            startedAt: now,
            endsAt: now + durationMs,
            durationMs
        };

        return this.getChargeSnapshot(now);
    }

    getChargeSnapshot(now = Date.now()) {
        const active = Boolean(this.chargeState.active && this.chargeState.weaponType);
        const durationMs = Number.isFinite(this.chargeState.durationMs) ? this.chargeState.durationMs : 0;
        const startedAt = Number.isFinite(this.chargeState.startedAt) ? this.chargeState.startedAt : 0;
        const endsAt = Number.isFinite(this.chargeState.endsAt) ? this.chargeState.endsAt : 0;
        const progress = active && durationMs > 0
            ? Math.min(1, Math.max(0, (now - startedAt) / durationMs))
            : 0;

        return {
            active,
            weaponType: this.chargeState.weaponType,
            startedAt,
            endsAt,
            durationMs,
            progress,
            ready: active && endsAt <= now
        };
    }

    refillGrenades() {
        this.grenadeCount = Math.max(Math.floor(this.grenadeCount || 0), GAME_CONFIG.grenade.maxCount);
        this.grenadeCooldownEndsAt = 0;
    }

    getGrenadeSnapshot(now = Date.now()) {
        const cooldownDurationMs = GAME_CONFIG.grenade.cooldown;
        const remainingCooldownMs = Math.max(0, this.grenadeCooldownEndsAt - now);
        return {
            count: Math.max(0, this.grenadeCount),
            maxCount: GAME_CONFIG.grenade.maxCount,
            cooldownEndsAt: this.grenadeCooldownEndsAt,
            cooldownDurationMs,
            minThrowScale: GAME_CONFIG.grenade.minThrowScale,
            maxThrowScale: GAME_CONFIG.grenade.maxThrowScale,
            chargeTimeMs: GAME_CONFIG.grenade.chargeTimeMs,
            remainingCooldownMs,
            ready: this.grenadeCount > 0 && remainingCooldownMs <= 0
        };
    }

    canThrowGrenade(now = Date.now()) {
        const grenade = this.getGrenadeSnapshot(now);
        return this.alive && grenade.count > 0 && grenade.remainingCooldownMs <= 0;
    }

    consumeGrenade(now = Date.now()) {
        if (!this.canThrowGrenade(now)) {
            return false;
        }

        this.grenadeCount = Math.max(0, this.grenadeCount - 1);
        this.grenadeCooldownEndsAt = now + GAME_CONFIG.grenade.cooldown;
        return true;
    }

    completeReloadIfReady(now = Date.now()) {
        if (!this.reloadState.active || this.reloadState.endsAt > now) {
            return false;
        }

        const weaponType = WEAPON_CONFIG[this.reloadState.weaponType]
            ? this.reloadState.weaponType
            : this.currentWeapon;
        this.refillWeapon(weaponType);
        this.reloadState = {
            active: false,
            weaponType: null,
            endsAt: 0,
            durationMs: 0
        };
        return true;
    }

    isReloadingWeapon(weaponType = this.currentWeapon, now = Date.now()) {
        this.completeReloadIfReady(now);
        return this.reloadState.active && this.reloadState.weaponType === weaponType;
    }

    cancelReload() {
        if (!this.reloadState.active) {
            return false;
        }

        this.reloadState = {
            active: false,
            weaponType: null,
            endsAt: 0,
            durationMs: 0
        };
        return true;
    }

    startReload(weaponType = this.currentWeapon, now = Date.now()) {
        const normalizedWeapon = getSafeWeaponType(weaponType || this.currentWeapon);
        this.completeReloadIfReady(now);
        this.clearWeaponCharge();

        if (!this.alive) {
            return { ok: false, reason: 'Cannot reload while down' };
        }

        if (this.reloadState.active) {
            if (this.reloadState.weaponType === normalizedWeapon) {
                return { ok: false, reason: 'Already reloading' };
            }
            this.cancelReload();
        }

        const magazineSize = this.getMagazineSize(normalizedWeapon);
        const currentAmmo = this.getAmmoForWeapon(normalizedWeapon);
        if (currentAmmo >= magazineSize) {
            return { ok: false, reason: 'Magazine already full' };
        }

        const weapon = getWeaponConfig(normalizedWeapon);
        this.reloadState = {
            active: true,
            weaponType: normalizedWeapon,
            endsAt: now + weapon.reloadTime,
            durationMs: weapon.reloadTime
        };

        return {
            ok: true,
            weaponType: normalizedWeapon,
            endsAt: this.reloadState.endsAt,
            durationMs: this.reloadState.durationMs
        };
    }

    setCurrentWeapon(weaponType) {
        if (!WEAPON_CONFIG[weaponType] || !this.canUseWeapon(weaponType)) {
            return;
        }

        if (this.currentWeapon !== weaponType) {
            if (this.reloadState.active) {
                this.cancelReload();
            }
            this.clearWeaponCharge();
        }

        this.currentWeapon = weaponType;
    }

    consumeAmmo(weaponType = this.currentWeapon, amount = 1) {
        const normalizedWeapon = getSafeWeaponType(weaponType || this.currentWeapon);
        const currentAmmo = this.getAmmoForWeapon(normalizedWeapon);
        this.weaponAmmo[normalizedWeapon] = Math.max(0, currentAmmo - amount);
        return this.weaponAmmo[normalizedWeapon];
    }

    getReloadSnapshot(now = Date.now()) {
        this.completeReloadIfReady(now);
        return {
            active: this.reloadState.active,
            weaponType: this.reloadState.weaponType,
            endsAt: this.reloadState.endsAt,
            durationMs: this.reloadState.durationMs
        };
    }

    update(deltaTime, arena = null) {
        if (!this.alive) {
            this.cancelReload();
            return;
        }

        this.completeReloadIfReady();

        // Update power-up effects
        for (const [effect, timer] of Object.entries(this.powerUpEffects)) {
            if (timer > 0) {
                this.powerUpEffects[effect] -= deltaTime * 1000;
                if (this.powerUpEffects[effect] <= 0) {
                    this.powerUpEffects[effect] = 0;
                    // Reset effect
                    switch (effect) {
                        case 'speed':
                            this.speedBoost = 1.0;
                            break;
                        case 'damage':
                            this.damageBoost = 1.0;
                            break;
                        case 'shield':
                            this.shield = 0;
                            break;
                    }
                }
            }
        }

        // Movement
        const moveVector = new Vector2D(0, 0);
        
        if (this.inputState.up) moveVector.y = -1;
        if (this.inputState.down) moveVector.y = 1;
        if (this.inputState.left) moveVector.x = -1;
        if (this.inputState.right) moveVector.x = 1;

        if (moveVector.length() > 0) {
            const normalized = moveVector.normalize();
            this.velocity = normalized.multiply(GAME_CONFIG.player.speed * this.getSpeedMultiplier() * this.speedBoost);
        } else {
            this.velocity = new Vector2D(0, 0);
        }

        // Update position
        const desiredPosition = this.position.add(this.velocity.multiply(deltaTime));
        this.position = resolveArenaMovement(arena, this.position, desiredPosition, GAME_CONFIG.player.size);

        // Update angle based on mouse position
        const direction = new Vector2D(this.inputState.mouseX, this.inputState.mouseY).subtract(this.position);
        this.angle = Math.atan2(direction.y, direction.x);
    }

    takeDamage(damage) {
        // Apply shield protection
        if (this.shield > 0) {
            this.shield -= damage;
            if (this.shield < 0) {
                this.health += this.shield; // Apply remaining damage to health
                this.shield = 0;
            }
        } else {
            this.health -= damage;
        }
        
        if (this.health <= 0) {
            this.health = 0;
            this.alive = false;
            this.cancelReload();
            this.clearWeaponCharge();
        }
    }

    applyPowerUp(type) {
        switch (type) {
            case 'health':
                this.health = Math.min(this.health + 50, this.getMaxHealth());
                break;
            case 'speed':
                this.speedBoost = 1.5;
                this.powerUpEffects.speed = 10000; // 10 seconds
                break;
            case 'damage':
                this.damageBoost = 2.0;
                this.powerUpEffects.damage = 8000; // 8 seconds
                break;
            case 'shield':
                this.shield = this.getMaxShield();
                this.powerUpEffects.shield = 15000; // 15 seconds
                break;
            case 'grenade':
                this.grenadeCount = Math.max(0, Math.floor(this.grenadeCount || 0)) + 1;
                break;
        }
    }

    getMaxHealth() {
        return GAME_CONFIG.player.maxHealth + (this.upgrades.health * 20);
    }

    getDamageMultiplier() {
        return 1 + (this.upgrades.damage * 0.2);
    }

    getFireRateMultiplier() {
        return Math.max(0.45, 1 - (this.upgrades.fireRate * 0.12));
    }

    getSpeedMultiplier() {
        return 1 + (this.upgrades.speed * 0.08);
    }

    getMaxShield() {
        return 100 + (this.upgrades.shield * 25);
    }

    addMoney(amount) {
        this.money += amount;
    }

    canBuyUpgrade(type) {
        const config = UPGRADE_CONFIG[type];
        if (!config) return false;
        return this.upgrades[type] < config.maxLevel && this.money >= getUpgradeCost(type, this.upgrades[type]);
    }

    buyUpgrade(type) {
        if (!this.canBuyUpgrade(type)) {
            return false;
        }

        const previousMaxHealth = this.getMaxHealth();
        const previousMaxShield = this.getMaxShield();
        const cost = getUpgradeCost(type, this.upgrades[type]);

        this.money -= cost;
        this.upgrades[type]++;

        if (type === 'grenade') {
            this.grenadeCount = Math.max(0, Math.floor(this.grenadeCount || 0)) + 1;
        }

        if (type === 'health') {
            this.health += this.getMaxHealth() - previousMaxHealth;
        }

        if (type === 'shield' && this.shield > 0) {
            this.shield += this.getMaxShield() - previousMaxShield;
        }

        this.health = Math.min(this.health, this.getMaxHealth());
        this.shield = Math.min(this.shield, this.getMaxShield());
        return true;
    }

    resetMatchStats() {
        this.score = 0;
        this.kills = 0;
        this.deaths = 0;
        this.money = 0;
        this.currentWeapon = this.selectedWeapon;
        this.lastShotTime = 0;
        this.respawnAt = 0;
        this.weaponAmmo = this.createDefaultWeaponAmmo();
        this.reloadState = {
            active: false,
            weaponType: null,
            endsAt: 0,
            durationMs: 0
        };
        this.chargeState = {
            active: false,
            weaponType: null,
            startedAt: 0,
            endsAt: 0,
            durationMs: 0
        };
        this.grenadeCount = 0;
        this.grenadeCooldownEndsAt = 0;
        this.refillGrenades();
        this.upgrades = {
            damage: 0,
            fireRate: 0,
            health: 0,
            speed: 0,
            shield: 0,
            grenade: 0
        };
        this.matchRewardGranted = false;
        this.lastRewardSummary = null;
    }

    respawn(spawnPoint = null) {
        this.health = this.getMaxHealth();
        this.alive = true;
        this.shield = 0;
        this.respawnAt = 0;
        this.cancelReload();
        this.clearWeaponCharge();
        this.refillAllWeapons();
        this.refillGrenades();
        this.speedBoost = 1.0;
        this.damageBoost = 1.0;
        this.powerUpEffects = { speed: 0, damage: 0, shield: 0 };
        this.velocity = new Vector2D(0, 0);
        this.position = spawnPoint
            ? new Vector2D(spawnPoint.x, spawnPoint.y)
            : new Vector2D(
                Math.random() * (GAME_CONFIG.canvas.width - 100) + 50,
                Math.random() * (GAME_CONFIG.canvas.height - 100) + 50
            );
    }

    prepareForMatch(spawnPoint = null) {
        this.resetMatchStats();
        this.respawn(spawnPoint);
    }

    serialize() {
        const now = Date.now();
        return {
            id: this.id,
            name: this.name,
            skinTheme: this.skinTheme,
            x: this.position.x,
            y: this.position.y,
            vx: this.velocity.x,
            vy: this.velocity.y,
            angle: this.angle,
            health: this.health,
            maxHealth: this.getMaxHealth(),
            shield: this.shield,
            maxShield: this.getMaxShield(),
            score: this.score,
            kills: this.kills,
            deaths: this.deaths,
            money: this.money,
            alive: this.alive,
            respawnAt: this.respawnAt,
            currentWeapon: this.currentWeapon,
            selectedWeapon: this.selectedWeapon,
            ammo: { ...this.weaponAmmo },
            currentAmmo: this.getAmmoForWeapon(this.currentWeapon),
            currentMagazineSize: this.getMagazineSize(this.currentWeapon),
            reload: this.getReloadSnapshot(now),
            charge: this.getChargeSnapshot(now),
            grenade: this.getGrenadeSnapshot(now),
            upgrades: { ...this.upgrades },
            powerUps: {
                speed: this.powerUpEffects.speed > 0,
                damage: this.powerUpEffects.damage > 0,
                shield: this.powerUpEffects.shield > 0
            }
        };
    }
}

class ServerBullet {
    constructor(id, x, y, velX, velY, ownerId, damage, range, weaponType = DEFAULT_WEAPON_ID, options = {}) {
        this.id = id;
        this.position = new Vector2D(x, y);
        this.startPosition = new Vector2D(x, y);
        this.velocity = new Vector2D(velX, velY);
        this.ownerId = ownerId;
        this.damage = Number.isFinite(damage) ? damage : GAME_CONFIG.bullet.damage;
        this.lifetime = GAME_CONFIG.bullet.lifetime;
        this.range = range || 300; // Weapon-specific range
        this.age = 0;
        this.weaponType = getSafeWeaponType(weaponType);
        this.style = typeof options.style === 'string' && options.style ? options.style : this.weaponType;
        this.color = typeof options.color === 'string' && options.color ? options.color : null;
        this.impactColor = typeof options.impactColor === 'string' && options.impactColor ? options.impactColor : null;
        this.hostile = Boolean(options.hostile);
        this.size = Number.isFinite(options.size)
            ? options.size
            : (getWeaponConfig(this.weaponType)?.hitRadius || GAME_CONFIG.bullet.size);
        this.canHitEnemies = options.canHitEnemies !== undefined ? Boolean(options.canHitEnemies) : true;
        this.canHitPlayers = options.canHitPlayers !== undefined ? Boolean(options.canHitPlayers) : true;
    }

    update(deltaTime) {
        this.position = this.position.add(this.velocity.multiply(deltaTime));
        this.age += deltaTime * 1000;
    }

    isExpired() {
        const distanceTraveled = this.position.distance(this.startPosition);
        return this.age > this.lifetime || this.isOutOfBounds() || distanceTraveled > this.range;
    }

    isOutOfBounds() {
        return this.position.x < 0 || this.position.x > GAME_CONFIG.canvas.width ||
               this.position.y < 0 || this.position.y > GAME_CONFIG.canvas.height;
    }

    serialize() {
        return {
            id: this.id,
            x: this.position.x,
            y: this.position.y,
            vx: this.velocity.x,
            vy: this.velocity.y,
            ownerId: this.ownerId,
            weaponType: this.weaponType,
            style: this.style,
            color: this.color,
            hostile: this.hostile
        };
    }
}

class ServerEnemy {
    constructor(id, x, y, wave = 1, spriteTheme = null, enemyType = 'grunt') {
        const archetype = getEnemyArchetype(enemyType);
        const baseHealth = GAME_CONFIG.enemy.health;
        const baseSpeed = GAME_CONFIG.enemy.speed;
        const waveHealth = baseHealth + (wave - 1) * GAME_CONFIG.enemy.healthIncrease;
        const waveSpeed = baseSpeed + (wave - 1) * GAME_CONFIG.enemy.speedIncrease;

        this.id = id;
        this.position = new Vector2D(x, y);
        this.velocity = new Vector2D(0, 0);
        this.type = archetype.id;
        this.label = archetype.label;
        this.attackMode = archetype.attackMode || 'melee';
        this.isBoss = Boolean(archetype.isBoss);
        this.size = archetype.size || GAME_CONFIG.enemy.size;
        this.renderSize = Math.max(28, Math.round(this.size * (archetype.renderScale || 2.25)));
        this.accentColor = archetype.accentColor || '#ff8b78';
        this.minimapColor = archetype.minimapColor || this.accentColor;
        this.rewardScore = archetype.rewardScore || 100;
        this.rewardMoney = Math.round((30 + wave * 5) * (archetype.rewardMoneyMultiplier || 1));
        this.contactDamage = GAME_CONFIG.enemy.damage * (archetype.contactDamageMultiplier || 1);
        this.attackRange = archetype.attackRange || 0;
        this.preferredRange = archetype.preferredRange || 0;
        this.attackCooldown = archetype.attackCooldown || 0;
        this.projectileSpeed = archetype.projectileSpeed || 0;
        this.projectileDamage = archetype.projectileDamage || 0;
        this.projectileSize = archetype.projectileSize || 4;
        this.projectileColor = archetype.projectileColor || '#ff7ab6';
        this.projectileImpactColor = archetype.projectileImpactColor || this.projectileColor;
        this.rangedBurstCount = archetype.rangedBurstCount || 1;
        this.rangedBurstSpread = archetype.rangedBurstSpread || 0;
        this.lastAttackTime = 0;
        this.strafeDirection = Math.random() < 0.5 ? -1 : 1;
        this.targetDistance = Infinity;

        this.health = Math.round(waveHealth * (archetype.healthMultiplier || 1));
        this.maxHealth = this.health;
        this.speed = waveSpeed * (archetype.speedMultiplier || 1);
        this.angle = 0;
        this.targetPlayerId = null;
        this.wave = wave;
        this.spriteTheme = spriteTheme || getGameAssetCatalog().defaultEnemySpriteId;
    }

    update(deltaTime, players, arena = null) {
        // Find nearest alive player
        let nearestPlayer = null;
        let nearestDistance = Infinity;

        for (const player of players.values()) {
            if (player.alive) {
                const distance = this.position.distance(player.position);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestPlayer = player;
                }
            }
        }

        if (nearestPlayer) {
            this.targetPlayerId = nearestPlayer.id;
            const targetDirection = nearestPlayer.position.subtract(this.position).normalize();
            this.targetDistance = nearestDistance;
            const avoidance = getObstacleAvoidanceVector(this.position, this.size, arena);
            let steering = targetDirection.add(avoidance.multiply(0.9));

            if (this.attackMode === 'ranged' && this.preferredRange > 0) {
                if (nearestDistance < this.preferredRange * 0.72) {
                    steering = targetDirection.multiply(-1).add(avoidance.multiply(1.2));
                } else if (nearestDistance > this.preferredRange * 1.08) {
                    steering = targetDirection.add(avoidance.multiply(0.85));
                } else {
                    const strafe = new Vector2D(-targetDirection.y * this.strafeDirection, targetDirection.x * this.strafeDirection);
                    steering = strafe.add(avoidance.multiply(0.55));
                }
                this.angle = Math.atan2(targetDirection.y, targetDirection.x);
            } else {
                this.angle = Math.atan2(targetDirection.y, targetDirection.x);
            }

            const movementDirection = steering.length() > 0.01 ? steering.normalize() : new Vector2D(0, 0);
            this.velocity = movementDirection.multiply(this.speed);
        } else {
            this.velocity = new Vector2D(0, 0);
            this.targetPlayerId = null;
            this.targetDistance = Infinity;
        }

        const desiredPosition = this.position.add(this.velocity.multiply(deltaTime));
        this.position = resolveArenaMovement(arena, this.position, desiredPosition, this.size);
    }

    getAttackActions(players, now = Date.now()) {
        if (this.attackMode !== 'ranged' || !this.attackCooldown || !this.attackRange) {
            return [];
        }

        const targetPlayer = this.targetPlayerId ? players.get(this.targetPlayerId) : null;
        if (!targetPlayer || !targetPlayer.alive) {
            return [];
        }

        const toTarget = targetPlayer.position.subtract(this.position);
        const distance = toTarget.length();
        if (distance <= this.size + GAME_CONFIG.player.size || distance > this.attackRange) {
            return [];
        }

        if (now - this.lastAttackTime < this.attackCooldown) {
            return [];
        }

        this.lastAttackTime = now;

        const aimDirection = distance > 0.001
            ? toTarget.normalize()
            : new Vector2D(Math.cos(this.angle), Math.sin(this.angle));
        const aimAngle = Math.atan2(aimDirection.y, aimDirection.x);
        const burstCount = Math.max(1, this.rangedBurstCount);
        const spread = this.rangedBurstSpread || 0;
        const shots = [];

        for (let index = 0; index < burstCount; index++) {
            const burstOffset = burstCount === 1
                ? 0
                : index - ((burstCount - 1) / 2);
            const burstAngle = aimAngle + burstOffset * spread;
            shots.push({
                direction: new Vector2D(Math.cos(burstAngle), Math.sin(burstAngle)),
                damage: this.projectileDamage,
                speed: this.projectileSpeed,
                range: this.attackRange + 40,
                size: this.projectileSize,
                color: this.projectileColor,
                impactColor: this.projectileImpactColor,
                style: this.isBoss ? 'boss-bolt' : 'enemy-bolt'
            });
        }

        return shots;
    }

    takeDamage(damage) {
        this.health -= damage;
    }

    isDead() {
        return this.health <= 0;
    }

    serialize() {
        return {
            id: this.id,
            x: this.position.x,
            y: this.position.y,
            vx: this.velocity.x,
            vy: this.velocity.y,
            angle: this.angle,
            health: this.health,
            maxHealth: this.maxHealth,
            wave: this.wave,
            spriteTheme: this.spriteTheme,
            type: this.type,
            label: this.label,
            size: this.size,
            renderSize: this.renderSize,
            isBoss: this.isBoss,
            accentColor: this.accentColor,
            minimapColor: this.minimapColor
        };
    }
}

class GameRoom {
    constructor(id, name, options = {}) {
        this.id = id;
        this.name = name;
        this.mode = normalizeRoomMode(options?.mode);
        const requestedPvp = options?.pvpSettings && typeof options.pvpSettings === 'object' ? options.pvpSettings : {};
        const rawKillLimit = Number(requestedPvp.killLimit);
        const killLimit = Math.max(
            5,
            Math.min(150, Math.floor(Number.isFinite(rawKillLimit) ? rawKillLimit : PVP_CONFIG.killLimit))
        );
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

        this.pvpState = {
            killLimit,
            timeLimitMs,
            respawnDelayMs: PVP_CONFIG.respawnDelayMs,
            startedAt: 0,
            endsAt: 0
        };
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
        this.waveProfile = {
            bossWave: false,
            label: 'Wave 1',
            bossType: null,
            summary: []
        };
        this.waveStartTime = 0;
        this.gameStartTime = 0;
        this.shopPhase = false;
        this.shopEndTime = 0;
        this.shopDurationMs = 15000;
        this.endMatchVotes = new Set();
        this.arena = generateArenaDefinition();
    }

    isPvpMode() {
        return this.mode === ROOM_MODES.PVP_FFA;
    }

    getMatchState(now = Date.now()) {
        if (!this.isPvpMode()) {
            return {
                mode: ROOM_MODES.PVE
            };
        }

        return {
            mode: ROOM_MODES.PVP_FFA,
            killLimit: this.pvpState.killLimit,
            timeLimitMs: this.pvpState.timeLimitMs,
            startedAt: this.pvpState.startedAt,
            endsAt: this.pvpState.endsAt,
            timeLeftMs: this.pvpState.endsAt ? Math.max(0, this.pvpState.endsAt - now) : null
        };
    }

    getArenaState() {
        return serializeArena(this.arena);
    }

    getCurrentSpawnRate() {
        const baseSpawnRate = Math.max(
            800,
            GAME_CONFIG.enemy.spawnRate - (this.wave - 1) * GAME_CONFIG.enemy.spawnRateDecrease
        );
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
            if (this.enemiesThisWave >= this.maxEnemiesPerWave) {
                break;
            }

            if (this.spawnEnemy()) {
                this.enemiesThisWave += 1;
            }
        }
    }

    emitWaveStart() {
        io.to(this.id).emit('waveStart', {
            wave: this.wave,
            enemyCount: this.maxEnemiesPerWave,
            spawnRate: this.getCurrentSpawnRate(),
            ...this.getWaveInfo()
        });
    }

    spawnEnemyProjectile(enemy, shot) {
        if (!enemy || !shot?.direction) {
            return null;
        }

        const direction = shot.direction.normalize();
        const bulletStart = enemy.position.add(direction.multiply(enemy.size + 8));
        const bullet = new ServerBullet(
            uuidv4(),
            bulletStart.x,
            bulletStart.y,
            direction.x * shot.speed,
            direction.y * shot.speed,
            enemy.id,
            shot.damage,
            shot.range,
            'pistol',
            {
                hostile: true,
                style: shot.style || (enemy.isBoss ? 'boss-bolt' : 'enemy-bolt'),
                color: shot.color || enemy.accentColor,
                impactColor: shot.impactColor || shot.color || enemy.accentColor,
                size: shot.size || 4
            }
        );

        this.bullets.set(bullet.id, bullet);
        this.createImpactParticles(
            bulletStart.x,
            bulletStart.y,
            shot.color || enemy.accentColor,
            enemy.isBoss ? 5 : 3
        );
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
        if (this.players.size >= GAME_CONFIG.maxPlayersPerRoom) {
            return false;
        }

        const spawnIndex = this.players.size;
        const spawnPoint = this.getPlayerSpawnPointByIndex(spawnIndex);
        const authUser = socket.data?.authUserId ? getUserById(socket.data.authUserId) : null;
        const { defaultSkinId, defaultWeaponId } = getGameAssetCatalog();
        const unlockedSkins = authUser ? sanitizeUnlockedSkins(authUser.progression.unlockedSkins) : sanitizeUnlockedSkins([]);
        const unlockedWeapons = authUser ? sanitizeUnlockedWeapons(authUser.progression.unlockedWeapons) : sanitizeUnlockedWeapons([]);
        const requestedSkin = normalizeSkinTheme(skinTheme);
        const requestedWeapon = normalizeWeaponType(selectedWeapon);
        const resolvedSkin = unlockedSkins.includes(requestedSkin)
            ? requestedSkin
            : normalizeSkinTheme(authUser?.progression?.selectedSkin || defaultSkinId);
        const resolvedWeapon = unlockedWeapons.includes(requestedWeapon)
            ? requestedWeapon
            : normalizeWeaponType(authUser?.progression?.selectedWeapon || defaultWeaponId);

        if (authUser) {
            authUser.progression.selectedSkin = resolvedSkin;
            authUser.progression.unlockedWeapons = unlockedWeapons;
            authUser.progression.selectedWeapon = resolvedWeapon;
            saveUserStore();
        }

        const player = new ServerPlayer(
            socket.id,
            playerName,
            spawnPoint.x,
            spawnPoint.y,
            resolvedSkin,
            socket.data?.clientIp,
            authUser ? { userId: authUser.id, username: authUser.username } : null,
            {
                unlockedWeapons,
                selectedWeapon: resolvedWeapon
            }
        );
        player.spawnSlot = spawnIndex;
        this.players.set(socket.id, player);
        if (!this.hostId) {
            this.hostId = socket.id;
        }
        
        socket.join(this.id);
        return true;
    }

    removePlayer(socketId) {
        this.players.delete(socketId);
        this.endMatchVotes.delete(socketId);
        if (this.shopPhase) {
            this.endMatchVotes.clear();
        }

        if (this.hostId === socketId) {
            this.hostId = this.players.size > 0 ? Array.from(this.players.keys())[0] : null;
        }
        
        // If no players left, the room can be cleaned up
        if (this.players.size === 0) {
            this.gameStarted = false;
        }
    }

    addSpectator(socket) {
        this.spectators.add(socket.id);
        socket.join(this.id);
    }

    removeSpectator(socketId) {
        this.spectators.delete(socketId);
    }

    awardPersistentProgress(player, waveOverride = this.wave) {
        if (!player || player.matchRewardGranted || !player.accountUserId) {
            return null;
        }

        const user = getUserById(player.accountUserId);
        if (!user) {
            return null;
        }

        const rewardSummary = awardProgressionToUser(user, player.score, waveOverride, player.skinTheme);
        player.matchRewardGranted = true;
        player.lastRewardSummary = rewardSummary;
        return rewardSummary;
    }

    resetEndMatchVotes() {
        this.endMatchVotes.clear();
    }

    getEndMatchVoteState() {
        return {
            votes: this.endMatchVotes.size,
            required: this.players.size,
            playerIds: Array.from(this.endMatchVotes)
        };
    }

    toggleEndMatchVote(socketId) {
        if (!this.shopPhase) {
            return { ok: false, reason: 'End-match voting is only available between waves.' };
        }

        if (!this.players.has(socketId)) {
            return { ok: false, reason: 'Player not found.' };
        }

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
        if (!this.gameStarted) {
            return;
        }

        const player = this.players.get(socketId);
        if (player) {
            player.inputState = { ...inputState };
            const requestedWeaponType = inputState.weaponType && WEAPON_CONFIG[inputState.weaponType]
                ? inputState.weaponType
                : player.currentWeapon;

            if (requestedWeaponType && WEAPON_CONFIG[requestedWeaponType]) {
                player.setCurrentWeapon(requestedWeaponType);
            }

            const now = Date.now();
            player.completeReloadIfReady(now);

            if (!inputState.shooting || this.shopPhase || !player.alive) {
                player.clearWeaponCharge();
                return;
            }

            const weapon = getWeaponConfig(player.currentWeapon);
            if (!weapon.chargeTime) {
                player.clearWeaponCharge();
                return;
            }

            if (player.isReloadingWeapon(player.currentWeapon, now) || player.getAmmoForWeapon(player.currentWeapon) <= 0) {
                player.clearWeaponCharge();
                return;
            }

            const effectiveCooldown = weapon.cooldown * player.getFireRateMultiplier();
            if (now - player.lastShotTime < effectiveCooldown) {
                player.clearWeaponCharge();
                return;
            }

            const currentCharge = player.getChargeSnapshot(now);
            if (!currentCharge.active || currentCharge.weaponType !== player.currentWeapon) {
                player.startWeaponCharge(player.currentWeapon, now);
            }
        }
    }

    playerShoot(socketId, weaponType = null) {
        const player = this.players.get(socketId);
        if (!this.gameStarted || !player || !player.alive || this.shopPhase) {
            return { ok: false, reason: 'Cannot fire right now' };
        }

        // Use weapon from input or player's current weapon
        const selectedWeaponType = getSafeWeaponType(weaponType || player.currentWeapon);
        player.setCurrentWeapon(selectedWeaponType);
        const weapon = getWeaponConfig(player.currentWeapon);
        
        const now = Date.now();
        player.completeReloadIfReady(now);
        if (player.isReloadingWeapon(player.currentWeapon, now)) {
            player.clearWeaponCharge();
            return { ok: false, reason: 'Reloading' };
        }

        if (player.getAmmoForWeapon(player.currentWeapon) <= 0) {
            player.clearWeaponCharge();
            return { ok: false, reason: 'Magazine empty' };
        }

        const effectiveCooldown = weapon.cooldown * player.getFireRateMultiplier();
        if (now - player.lastShotTime < effectiveCooldown) {
            return { ok: false, reason: 'Weapon cooling down' };
        }

        const chargeDuration = weapon.chargeTime || 0;
        if (chargeDuration > 0) {
            const currentCharge = player.getChargeSnapshot(now);
            if (!currentCharge.active || currentCharge.weaponType !== player.currentWeapon) {
                return {
                    ok: false,
                    charging: true,
                    weaponType: player.currentWeapon,
                    charge: player.startWeaponCharge(player.currentWeapon, now),
                    player: player.serialize()
                };
            }

            if (!currentCharge.ready) {
                return {
                    ok: false,
                    charging: true,
                    weaponType: player.currentWeapon,
                    charge: currentCharge,
                    player: player.serialize()
                };
            }
        }

        player.lastShotTime = now;
        player.clearWeaponCharge();
        player.consumeAmmo(player.currentWeapon, 1);

        const liveAimDirection = new Vector2D(player.inputState.mouseX, player.inputState.mouseY).subtract(player.position);
        if (liveAimDirection.length() > 0.001) {
            player.angle = Math.atan2(liveAimDirection.y, liveAimDirection.x);
        }

        const centerDirection = new Vector2D(Math.cos(player.angle), Math.sin(player.angle));
        const bulletStart = player.position.add(centerDirection.multiply(GAME_CONFIG.player.size + 5));
        
        // Calculate base damage with boost
        const baseDamage = weapon.damage * player.getDamageMultiplier() * player.damageBoost;
        let projectileRange = weapon.range;
        const impactColor = this.getWeaponImpactColor(player.currentWeapon);
        let sniperTarget = null;
        let sniperBlockDistance = weapon.range;
        const usesChargeShotRaycast = weapon.behaviorId === 'charge_shot';

        if (usesChargeShotRaycast) {
            sniperBlockDistance = this.getNearestObstacleRayDistance(
                bulletStart,
                centerDirection,
                weapon.range,
                weapon.hitRadius || GAME_CONFIG.bullet.size
            );

            sniperTarget = this.isPvpMode()
                ? this.findPlayerAlongRay(
                    bulletStart,
                    centerDirection,
                    sniperBlockDistance,
                    weapon.hitRadius || GAME_CONFIG.bullet.size,
                    socketId
                )
                : this.findEnemyAlongRay(
                    bulletStart,
                    centerDirection,
                    sniperBlockDistance,
                    weapon.hitRadius || GAME_CONFIG.bullet.size
                );

            if (sniperTarget) {
                if (this.isPvpMode()) {
                    this.applyPlayerHit(sniperTarget.playerId, baseDamage, socketId, {
                        weaponType: player.currentWeapon,
                        impactPoint: sniperTarget.hitPoint,
                        scoreAward: 150
                    });
                } else {
                    this.applyEnemyHit(sniperTarget.enemyId, baseDamage, socketId, sniperTarget.hitPoint);
                }
                projectileRange = Math.max(28, sniperTarget.distance);
                this.createImpactParticles(
                    sniperTarget.hitPoint.x,
                    sniperTarget.hitPoint.y,
                    impactColor,
                    8
                );
            } else {
                projectileRange = sniperBlockDistance;
                if (sniperBlockDistance < weapon.range - 1) {
                    const obstacleImpact = bulletStart.add(centerDirection.multiply(sniperBlockDistance));
                    this.createImpactParticles(
                        obstacleImpact.x,
                        obstacleImpact.y,
                        impactColor,
                        7
                    );
                }
            }
        }
        
        // Fire multiple pellets for shotgun, single bullet for others
        for (let i = 0; i < weapon.pelletCount; i++) {
            // Calculate spread for each pellet
            const spreadAngle = (Math.random() - 0.5) * weapon.spread;
            const pelletAngle = player.angle + spreadAngle;
            const direction = new Vector2D(Math.cos(pelletAngle), Math.sin(pelletAngle));
            
            const bullet = new ServerBullet(
                uuidv4(),
                bulletStart.x,
                bulletStart.y,
                direction.x * weapon.speed,
                direction.y * weapon.speed,
                socketId,
                usesChargeShotRaycast ? 0 : baseDamage,
                usesChargeShotRaycast ? projectileRange : weapon.range,
                player.currentWeapon
            );

            if (usesChargeShotRaycast) {
                bullet.canHitEnemies = false;
                bullet.canHitPlayers = false;
            }

            this.bullets.set(bullet.id, bullet);
        }

        // Add muzzle flash particles
        for (let i = 0; i < 3; i++) {
            const particle = new ServerParticle(
                uuidv4(),
                bulletStart.x,
                bulletStart.y,
                centerDirection.x * 50 + (Math.random() - 0.5) * 100,
                centerDirection.y * 50 + (Math.random() - 0.5) * 100,
                '#ffff00',
                GAME_CONFIG.particles.muzzleLifetime,
                Math.random() * 3 + 1
            );
            this.particles.set(particle.id, particle);
        }

        return {
            ok: true,
            weaponType: player.currentWeapon,
            player: player.serialize()
        };
    }

    throwGrenade(socketId, options = {}) {
        const player = this.players.get(socketId);
        if (!this.gameStarted || !player || !player.alive || this.shopPhase) {
            return { ok: false, reason: 'Cannot throw a grenade right now' };
        }

        const now = Date.now();
        if (!player.canThrowGrenade(now)) {
            const grenadeState = player.getGrenadeSnapshot(now);
            if (grenadeState.count <= 0) {
                return { ok: false, reason: 'Out of grenades', player: player.serialize() };
            }
            return {
                ok: false,
                reason: `Grenade cooling down ${(grenadeState.remainingCooldownMs / 1000).toFixed(1)}s`,
                player: player.serialize()
            };
        }

        const aimDirection = new Vector2D(player.inputState.mouseX, player.inputState.mouseY).subtract(player.position);
        const throwDirection = aimDirection.length() > 0.001
            ? aimDirection.normalize()
            : new Vector2D(Math.cos(player.angle), Math.sin(player.angle));
        const rawChargeRatio = Number(options?.chargeRatio);
        const chargeRatio = Math.max(0, Math.min(1, Number.isFinite(rawChargeRatio) ? rawChargeRatio : 0));
        const throwScale = GAME_CONFIG.grenade.minThrowScale
            + ((GAME_CONFIG.grenade.maxThrowScale - GAME_CONFIG.grenade.minThrowScale) * chargeRatio);
        const spawnPoint = player.position.add(throwDirection.multiply(GAME_CONFIG.player.size + 12));

        player.consumeGrenade(now);

        const grenade = new ServerGrenade(
            uuidv4(),
            spawnPoint.x,
            spawnPoint.y,
            throwDirection.x * GAME_CONFIG.grenade.speed * throwScale,
            throwDirection.y * GAME_CONFIG.grenade.speed * throwScale,
            socketId
        );
        this.grenades.set(grenade.id, grenade);

        return {
            ok: true,
            chargeRatio,
            throwScale,
            player: player.serialize(),
            grenade: grenade.serialize()
        };
    }

    detonateGrenade(grenade) {
        if (!grenade) {
            return;
        }

        this.grenades.delete(grenade.id);

        const impactedEnemyIds = [];
        for (const [enemyId, enemy] of this.enemies) {
            const distance = grenade.position.distance(enemy.position);
            if (distance > grenade.radius + (enemy.size || GAME_CONFIG.enemy.size)) {
                continue;
            }

            const proximity = Math.max(0, 1 - (distance / Math.max(1, grenade.radius)));
            const damageMultiplier = 0.35 + (proximity * 0.65);
            const damage = Math.max(20, Math.round(grenade.damage * damageMultiplier));
            this.applyEnemyHit(enemyId, damage, grenade.ownerId, grenade.position);
            impactedEnemyIds.push(enemyId);
        }

        const impactedPlayerIds = [];
        if (this.isPvpMode()) {
            for (const [playerId, player] of this.players) {
                if (!player.alive) {
                    continue;
                }
                const distance = grenade.position.distance(player.position);
                if (distance > grenade.radius + GAME_CONFIG.player.size) {
                    continue;
                }

                const proximity = Math.max(0, 1 - (distance / Math.max(1, grenade.radius)));
                const damageMultiplier = 0.25 + (proximity * 0.75);
                const damage = Math.max(25, Math.round(grenade.damage * damageMultiplier));
                this.applyPlayerHit(playerId, damage, grenade.ownerId, {
                    weaponType: 'grenade',
                    impactPoint: grenade.position,
                    scoreAward: 125
                });
                impactedPlayerIds.push(playerId);
            }
        }

        this.createImpactParticles(grenade.position.x, grenade.position.y, '#7fd8ff', 10);
        this.createImpactParticles(grenade.position.x, grenade.position.y, '#ff9f43', 14);
        this.createBloodParticles(grenade.position.x, grenade.position.y, 6);

        io.to(this.id).emit('grenadeExploded', {
            x: grenade.position.x,
            y: grenade.position.y,
            radius: grenade.radius,
            ownerId: grenade.ownerId,
            impactedEnemyIds,
            impactedPlayerIds
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
            const particle = new ServerParticle(
                uuidv4(),
                x,
                y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                '#ff0000',
                GAME_CONFIG.particles.bloodLifetime,
                Math.random() * 4 + 2
            );
            this.particles.set(particle.id, particle);
        }
    }

    createImpactParticles(x, y, color = '#ffffff', count = 4) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 140 + 30;
            const particle = new ServerParticle(
                uuidv4(),
                x,
                y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                color,
                260,
                Math.random() * 3 + 1.5
            );
            this.particles.set(particle.id, particle);
        }

    }

    getWeaponImpactColor(weaponType) {
        return WEAPON_CONFIG[weaponType]?.impactColor
            || this.arena?.palette?.wallTrim
            || '#ffffff';
    }

    getRayObstacleIntersectionDistance(origin, direction, obstacle, padding = 0) {
        if (!obstacle?.solid) {
            return null;
        }

        const minX = obstacle.x - padding;
        const maxX = obstacle.x + obstacle.width + padding;
        const minY = obstacle.y - padding;
        const maxY = obstacle.y + obstacle.height + padding;

        let tMin = 0;
        let tMax = Infinity;

        if (Math.abs(direction.x) < 0.00001) {
            if (origin.x < minX || origin.x > maxX) {
                return null;
            }
        } else {
            const tx1 = (minX - origin.x) / direction.x;
            const tx2 = (maxX - origin.x) / direction.x;
            tMin = Math.max(tMin, Math.min(tx1, tx2));
            tMax = Math.min(tMax, Math.max(tx1, tx2));
        }

        if (Math.abs(direction.y) < 0.00001) {
            if (origin.y < minY || origin.y > maxY) {
                return null;
            }
        } else {
            const ty1 = (minY - origin.y) / direction.y;
            const ty2 = (maxY - origin.y) / direction.y;
            tMin = Math.max(tMin, Math.min(ty1, ty2));
            tMax = Math.min(tMax, Math.max(ty1, ty2));
        }

        if (tMax < tMin || tMax < 0) {
            return null;
        }

        return Math.max(0, tMin);
    }

    getNearestObstacleRayDistance(origin, direction, maxRange, padding = 0) {
        let nearest = maxRange;
        const obstacles = this.arena?.obstacles || [];

        for (const obstacle of obstacles) {
            const hitDistance = this.getRayObstacleIntersectionDistance(origin, direction, obstacle, padding);
            if (hitDistance !== null && hitDistance < nearest) {
                nearest = hitDistance;
            }
        }

        return nearest;
    }

    findEnemyAlongRay(origin, direction, maxRange, hitPadding = 0) {
        let closestHit = null;

        for (const [enemyId, enemy] of this.enemies) {
            const toEnemy = enemy.position.subtract(origin);
            const projectedDistance = (toEnemy.x * direction.x) + (toEnemy.y * direction.y);

            if (projectedDistance < 0 || projectedDistance > maxRange) {
                continue;
            }

            const closestPoint = origin.add(direction.multiply(projectedDistance));
            const missDistance = enemy.position.distance(closestPoint);
            const hitRadius = (enemy.size || GAME_CONFIG.enemy.size) + hitPadding;
            if (missDistance > hitRadius) {
                continue;
            }

            if (!closestHit || projectedDistance < closestHit.distance) {
                closestHit = {
                    enemyId,
                    distance: projectedDistance,
                    hitPoint: closestPoint
                };
            }
        }

        return closestHit;
    }

    findPlayerAlongRay(origin, direction, maxRange, hitPadding = 0, excludePlayerId = null) {
        let closestHit = null;

        for (const [playerId, player] of this.players) {
            if (!player.alive || playerId === excludePlayerId) {
                continue;
            }

            const toPlayer = player.position.subtract(origin);
            const projectedDistance = (toPlayer.x * direction.x) + (toPlayer.y * direction.y);

            if (projectedDistance < 0 || projectedDistance > maxRange) {
                continue;
            }

            const closestPoint = origin.add(direction.multiply(projectedDistance));
            const missDistance = player.position.distance(closestPoint);
            const hitRadius = GAME_CONFIG.player.size + hitPadding;
            if (missDistance > hitRadius) {
                continue;
            }

            if (!closestHit || projectedDistance < closestHit.distance) {
                closestHit = {
                    playerId,
                    distance: projectedDistance,
                    hitPoint: closestPoint
                };
            }
        }

        return closestHit;
    }

    applyEnemyHit(enemyId, damage, ownerId, impactPoint = null) {
        const enemy = this.enemies.get(enemyId);
        if (!enemy) {
            return { ok: false, reason: 'Enemy not found' };
        }

        enemy.takeDamage(damage);
        this.createBloodParticles(
            impactPoint?.x ?? enemy.position.x,
            impactPoint?.y ?? enemy.position.y,
            enemy.isBoss ? 6 : 3
        );

        if (enemy.isDead()) {
            const shooter = this.players.get(ownerId);
            if (shooter) {
                shooter.score += enemy.rewardScore || 100;
                shooter.addMoney(enemy.rewardMoney || (30 + this.wave * 5));
            }

            this.createBloodParticles(enemy.position.x, enemy.position.y, enemy.isBoss ? 16 : 8);
            if (enemy.isBoss) {
                this.createImpactParticles(enemy.position.x, enemy.position.y, enemy.accentColor || '#ffd166', 10);
            }
            this.enemies.delete(enemyId);
            return { ok: true, killed: true };
        }

        return { ok: true, killed: false };
    }

    applyPlayerHit(playerId, damage, attackerId, options = {}) {
        if (!this.gameStarted) {
            return { ok: false, reason: 'Match not started' };
        }

        const victim = this.players.get(playerId);
        if (!victim || !victim.alive) {
            return { ok: false, reason: 'Player not found' };
        }

        const safeDamage = Math.max(0, Number(damage) || 0);
        if (safeDamage <= 0) {
            return { ok: false, reason: 'No damage' };
        }

        const impactPoint = options?.impactPoint || victim.position;
        victim.takeDamage(safeDamage);
        this.createBloodParticles(
            impactPoint?.x ?? victim.position.x,
            impactPoint?.y ?? victim.position.y,
            3
        );

        if (victim.alive) {
            return { ok: true, killed: false };
        }

        const now = Date.now();
        victim.deaths = Math.max(0, Math.floor(victim.deaths || 0)) + 1;
        if (this.isPvpMode()) {
            victim.respawnAt = now + (this.pvpState.respawnDelayMs || PVP_CONFIG.respawnDelayMs);
        }

        const killer = attackerId ? this.players.get(attackerId) : null;
        const weaponType = typeof options?.weaponType === 'string' && options.weaponType ? options.weaponType : null;
        if (killer && killer.id !== victim.id) {
            killer.kills = Math.max(0, Math.floor(killer.kills || 0)) + 1;
            killer.score += Number.isFinite(options?.scoreAward) ? options.scoreAward : 100;
        }

        io.to(this.id).emit('killFeed', {
            killerId: killer?.id || null,
            killerName: killer?.name || null,
            victimId: victim.id,
            victimName: victim.name,
            weaponType
        });

        if (this.isPvpMode() && killer && killer.id !== victim.id && killer.kills >= this.pvpState.killLimit) {
            this.endPvpMatch({ reason: 'kill_limit', winnerId: killer.id });
        }

        return { ok: true, killed: true };
    }

    getPvpScoreboard() {
        return Array.from(this.players.values())
            .map((player) => ({
                id: player.id,
                name: player.name,
                kills: Math.max(0, Math.floor(player.kills || 0)),
                deaths: Math.max(0, Math.floor(player.deaths || 0)),
                score: Math.max(0, Math.floor(player.score || 0))
            }))
            .sort((left, right) => {
                if (right.kills !== left.kills) {
                    return right.kills - left.kills;
                }
                if (left.deaths !== right.deaths) {
                    return left.deaths - right.deaths;
                }
                if (right.score !== left.score) {
                    return right.score - left.score;
                }
                return String(left.name || '').localeCompare(String(right.name || ''));
            });
    }

    endPvpMatch({ reason = 'time_limit', winnerId = null } = {}) {
        if (!this.gameStarted) {
            return;
        }

        this.gameStarted = false;
        this.shopPhase = false;
        this.shopEndTime = 0;
        this.resetEndMatchVotes();

        const scoreboard = this.getPvpScoreboard();
        const resolvedWinnerId = winnerId || scoreboard[0]?.id || null;
        const now = Date.now();

        for (const player of this.players.values()) {
            const rewardSummary = this.awardPersistentProgress(player, 1);
            if (rewardSummary?.profile) {
                io.to(player.id).emit('profileUpdated', rewardSummary.profile);
            }
        }

        io.to(this.id).emit('matchEnded', {
            mode: this.mode,
            reason,
            winnerId: resolvedWinnerId,
            scoreboard,
            match: this.getMatchState(now)
        });

        emitRoomState(this);
        emitRoomList();
    }

    requestReload(socketId, weaponType = null) {
        const player = this.players.get(socketId);
        if (!player) {
            return { ok: false, reason: 'Player not found' };
        }

        if (!this.gameStarted) {
            return { ok: false, reason: 'Match not started' };
        }

        if (this.shopPhase) {
            return { ok: false, reason: 'Weapons are topped off during armory break' };
        }

        const selectedWeaponType = getSafeWeaponType(weaponType || player.currentWeapon);
        player.setCurrentWeapon(selectedWeaponType);
        return player.startReload(selectedWeaponType);
    }

    update() {
        if (!this.gameStarted || this.players.size === 0) return;

        const now = Date.now();
        const deltaTime = (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;

        // Update players
        for (const player of this.players.values()) {
            player.update(deltaTime, this.arena);
        }

        if (this.isPvpMode()) {
            for (const player of this.players.values()) {
                if (!player.alive && player.respawnAt && now >= player.respawnAt) {
                    const shuffledSpawns = Array.isArray(this.arena?.playerSpawns)
                        ? [...this.arena.playerSpawns].sort(() => Math.random() - 0.5)
                        : [];
                    player.respawn(findOpenArenaPoint(this.arena, shuffledSpawns, GAME_CONFIG.player.size));
                }
            }
        }

        // Update grenades
        for (const [grenadeId, grenade] of this.grenades) {
            grenade.update(deltaTime, this.arena);
            if (grenade.isExpired()) {
                this.detonateGrenade(grenade);
                continue;
            }
        }

        // Update bullets
        for (const [bulletId, bullet] of this.bullets) {
            bullet.update(deltaTime);
            
            if (bullet.isExpired()) {
                this.bullets.delete(bulletId);
                continue;
            }

            const hitObstacle = this.arena?.obstacles?.find((obstacle) =>
                isCircleCollidingWithObstacle(bullet.position, bullet.size + 1, obstacle)
            );
            if (hitObstacle) {
                this.bullets.delete(bulletId);
                const impactColor = bullet.impactColor
                    || WEAPON_CONFIG[bullet.weaponType]?.impactColor
                    || this.arena?.palette?.wallTrim
                    || '#ffffff';
                this.createImpactParticles(
                    bullet.position.x,
                    bullet.position.y,
                    impactColor,
                    bullet.style === 'boss-bolt' ? 7 : bullet.weaponType === 'sniper' ? 7 : 5
                );
                continue;
            }

            if (bullet.hostile) {
                for (const player of this.players.values()) {
                    if (!player.alive) {
                        continue;
                    }

                    const distance = bullet.position.distance(player.position);
                    if (distance < bullet.size + GAME_CONFIG.player.size) {
                        this.bullets.delete(bulletId);
                        player.takeDamage(bullet.damage);
                        this.createImpactParticles(
                            bullet.position.x,
                            bullet.position.y,
                            bullet.color || '#ff9fb7',
                            4
                        );
                        break;
                    }
                }
                continue;
            }

            if (this.isPvpMode() && bullet.canHitPlayers !== false) {
                for (const player of this.players.values()) {
                    if (!player.alive || player.id === bullet.ownerId) {
                        continue;
                    }

                    const distance = bullet.position.distance(player.position);
                    if (distance < bullet.size + GAME_CONFIG.player.size) {
                        this.bullets.delete(bulletId);
                        this.applyPlayerHit(player.id, bullet.damage, bullet.ownerId, {
                            weaponType: bullet.weaponType,
                            impactPoint: bullet.position
                        });
                        this.createImpactParticles(
                            bullet.position.x,
                            bullet.position.y,
                            bullet.color || '#9cecff',
                            5
                        );
                        break;
                    }
                }

                if (!this.bullets.has(bulletId)) {
                    continue;
                }
            }

            // Check bullet-enemy collisions
            for (const [enemyId, enemy] of this.enemies) {
                if (bullet.canHitEnemies === false) {
                    break;
                }

                const distance = bullet.position.distance(enemy.position);
                if (distance < bullet.size + (enemy.size || GAME_CONFIG.enemy.size)) {
                    this.bullets.delete(bulletId);
                    this.applyEnemyHit(enemyId, bullet.damage, bullet.ownerId, bullet.position);
                    break;
                }
            }
        }

        // Update particles
        for (const [particleId, particle] of this.particles) {
            particle.update(deltaTime);
            if (particle.isExpired()) {
                this.particles.delete(particleId);
            }
        }

        // Limit particle count for performance
        if (this.particles.size > GAME_CONFIG.particles.maxParticles) {
            const particleArray = Array.from(this.particles.entries());
            particleArray.sort((a, b) => b[1].age - a[1].age); // Sort by age, oldest first
            
            // Remove oldest particles
            for (let i = GAME_CONFIG.particles.maxParticles; i < particleArray.length; i++) {
                this.particles.delete(particleArray[i][0]);
            }
        }

        // Update power-ups
        for (const [powerUpId, powerUp] of this.powerUps) {
            powerUp.update(deltaTime);
            if (powerUp.isExpired()) {
                this.powerUps.delete(powerUpId);
                continue;
            }

            // Check power-up collection
            for (const player of this.players.values()) {
                if (player.alive) {
                    const distance = powerUp.position.distance(player.position);
                    if (distance < GAME_CONFIG.powerup.size + GAME_CONFIG.player.size) {
                        player.applyPowerUp(powerUp.type);
                        powerUp.collect();
                        
                        // Create collection effect particles
                        for (let i = 0; i < 6; i++) {
                            const angle = (Math.PI * 2 * i) / 6;
                            const particle = new ServerParticle(
                                uuidv4(),
                                powerUp.position.x,
                                powerUp.position.y,
                                Math.cos(angle) * 100,
                                Math.sin(angle) * 100,
                                this.getPowerUpColor(powerUp.type),
                                300,
                                3
                            );
                            this.particles.set(particle.id, particle);
                        }
                        break;
                    }
                }
            }
        }

        if (this.isPvpMode()) {
            if (this.pvpState.endsAt && now >= this.pvpState.endsAt) {
                this.endPvpMatch({ reason: 'time_limit' });
            }
            return;
        }

        if (this.shopPhase) {
            if (now >= this.shopEndTime) {
                this.shopPhase = false;
                this.startNextWave();
            }
            return;
        }

        // Update enemies
        for (const enemy of this.enemies.values()) {
            enemy.update(deltaTime, this.players, this.arena);
            const shots = enemy.getAttackActions(this.players, now);
            shots.forEach((shot) => this.spawnEnemyProjectile(enemy, shot));
        }

        // Spawn enemies
        const currentSpawnRate = this.getCurrentSpawnRate();
        this.enemySpawnTimer += deltaTime * 1000;
        if (this.enemySpawnTimer > currentSpawnRate && this.enemiesThisWave < this.maxEnemiesPerWave) {
            this.spawnEnemy();
            this.enemySpawnTimer = 0;
            this.enemiesThisWave++;
        }

        // Spawn power-ups
        this.powerUpSpawnTimer += deltaTime * 1000;
        if (this.powerUpSpawnTimer > GAME_CONFIG.powerup.spawnRate) {
            this.spawnPowerUp();
            this.powerUpSpawnTimer = 0;
        }

        // Check enemy-player collisions
        for (const enemy of this.enemies.values()) {
            for (const player of this.players.values()) {
                if (player.alive) {
                    const distance = enemy.position.distance(player.position);
                    if (distance < (enemy.size || GAME_CONFIG.enemy.size) + GAME_CONFIG.player.size) {
                        player.takeDamage((enemy.contactDamage || GAME_CONFIG.enemy.damage) * deltaTime);
                    }
                }
            }
        }

        // Check for wave completion
        if (this.enemiesThisWave >= this.maxEnemiesPerWave && this.enemies.size === 0) {
            this.startShopPhase();
        }
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
        const shuffledSpawns = Array.isArray(this.arena?.enemySpawns)
            ? [...this.arena.enemySpawns].sort(() => Math.random() - 0.5)
            : [];
        const spawnPoint = findOpenArenaPoint(
            this.arena,
            shuffledSpawns,
            archetype.size + 8
        ) || createArenaSpawn(
            Math.random() * GAME_CONFIG.canvas.width,
            -archetype.size
        );

        const { enemySprites, defaultEnemySpriteId } = getGameAssetCatalog();
        const enemyIds = enemySprites.map((entry) => entry.id);
        const spriteTheme = enemyIds.length > 0
            ? enemyIds[Math.floor(Math.random() * enemyIds.length)]
            : defaultEnemySpriteId;
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
        this.spawnWaveFrontline(this.waveProfile?.bossWave ? 1 : 1);

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

        io.to(this.id).emit('shopStarted', {
            wave: this.wave,
            endsAt: this.shopEndTime,
            durationMs: this.shopDurationMs
        });
    }

    purchaseUpgrade(socketId, upgradeType) {
        if (!this.shopPhase) {
            return { ok: false, reason: 'Shop is closed' };
        }

        const player = this.players.get(socketId);
        if (!player) {
            return { ok: false, reason: 'Player not found' };
        }

        const normalizedUpgradeType = typeof upgradeType === 'string' ? upgradeType.trim() : '';
        if (!normalizedUpgradeType || !UPGRADE_CONFIG[normalizedUpgradeType]) {
            return { ok: false, reason: 'Unknown upgrade' };
        }

        const config = UPGRADE_CONFIG[normalizedUpgradeType];
        const level = Number.isFinite(player.upgrades?.[normalizedUpgradeType])
            ? player.upgrades[normalizedUpgradeType]
            : 0;
        const cost = getUpgradeCost(normalizedUpgradeType, level);

        if (level >= config.maxLevel) {
            return { ok: false, reason: 'Upgrade already maxed' };
        }

        if (player.money < cost) {
            return { ok: false, reason: `Need $${cost} for this upgrade` };
        }

        if (!player.canBuyUpgrade(normalizedUpgradeType)) {
            return { ok: false, reason: 'Cannot buy upgrade right now' };
        }

        player.buyUpgrade(normalizedUpgradeType);
        return {
            ok: true,
            upgradeType: normalizedUpgradeType,
            player: player.serialize()
        };
    }

    startGame() {
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
        io.to(this.id).emit('arenaState', this.getArenaState());

        if (this.isPvpMode()) {
            this.maxEnemiesPerWave = 0;
            this.waveSpawnQueue = [];
            this.waveProfile = {
                bossWave: false,
                label: 'Free For All',
                bossType: null,
                summary: []
            };
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
        
        // Add all players to leaderboard
        for (const player of this.players.values()) {
            if (player.score > 0) {
                const rank = addToLeaderboard(player.accountUsername || player.name, player.score, this.wave, {
                    accountUserId: player.accountUserId
                });
                console.log(`Player ${player.name} finished with score ${player.score}, wave ${this.wave}, rank ${rank}`);
            }

            const rewardSummary = this.awardPersistentProgress(player, this.wave);
            if (rewardSummary?.profile) {
                io.to(player.id).emit('profileUpdated', rewardSummary.profile);
            }
        }
        
        // Notify players about final scores and leaderboard
        io.to(this.id).emit('gameEnded', {
            finalWave: this.wave,
            leaderboard: getLeaderboard()
        });
    }

    getGameState() {
        const currentSpawnRate = this.getCurrentSpawnRate();
        
        return {
            mode: this.mode,
            match: this.getMatchState(),
            players: Array.from(this.players.values()).map(p => p.serialize()),
            bullets: Array.from(this.bullets.values()).map(b => b.serialize()),
            grenades: Array.from(this.grenades.values()).map(g => g.serialize()),
            enemies: Array.from(this.enemies.values()).map(e => e.serialize()),
            particles: Array.from(this.particles.values()).map(p => p.serialize()),
            powerUps: Array.from(this.powerUps.values()).map(p => p.serialize()),
            wave: this.wave,
            gameStarted: this.gameStarted,
            shop: {
                active: this.shopPhase,
                endsAt: this.shopEndTime,
                durationMs: this.shopDurationMs,
                endVote: this.getEndMatchVoteState()
            },
            difficulty: {
                enemiesPerWave: this.maxEnemiesPerWave,
                spawnRate: currentSpawnRate,
                enemiesRemaining: this.waveSpawnQueue.length,
                enemiesAlive: this.enemies.size
            },
            waveInfo: this.getWaveInfo()
        };
    }

    getRoomState() {
        return {
            id: this.id,
            name: this.name,
            mode: this.mode,
            matchSettings: this.isPvpMode()
                ? {
                    killLimit: this.pvpState.killLimit,
                    timeLimitMs: this.pvpState.timeLimitMs
                }
                : null,
            arenaName: this.arena?.name || null,
            arenaThemeId: this.arena?.themeId || null,
            hostId: this.hostId,
            gameStarted: this.gameStarted,
            locked: this.locked,
            playerCount: this.players.size,
            spectatorCount: this.spectators.size,
            maxPlayers: GAME_CONFIG.maxPlayersPerRoom,
            players: Array.from(this.players.values()).map(player => ({
                id: player.id,
                name: player.name,
                alive: player.alive,
                score: player.score,
                skinTheme: player.skinTheme,
                selectedWeapon: player.selectedWeapon,
                isHost: player.id === this.hostId
            }))
        };
    }
}

app.get('/api/admin/summary', requireAdminAuth, (req, res) => {
    res.json({
        ...getAdminSummary(),
        viewer: {
            id: req.user.id,
            username: req.user.username,
            isAdmin: true
        }
    });
});

app.get('/api/admin/users', requireAdminAuth, (req, res) => {
    res.json(getAdminUsersPayload());
});

app.post('/api/admin/users/:userId', requireAdminAuth, (req, res) => {
    const user = getUserById(req.params.userId);
    if (!user) {
        return res.status(404).json({
            ok: false,
            error: 'User account not found.'
        });
    }

    const result = updateUserAccountFromAdmin(user, req.body || {});
    if (!result.ok) {
        return res.status(400).json({
            ok: false,
            error: result.reason
        });
    }

    res.json({
        ok: true,
        user: result.user,
        passwordChanged: result.passwordChanged,
        users: getAdminUsersPayload().users
    });
});

app.delete('/api/admin/users/:userId', requireAdminAuth, (req, res) => {
    const result = deleteUserAccountFromAdmin(req.params.userId);
    if (!result.ok) {
        const statusCode = result.reason === 'User account not found.' ? 404 : 400;
        return res.status(statusCode).json({
            ok: false,
            error: result.reason
        });
    }

    res.json({
        ok: true,
        deletedUserId: req.params.userId,
        users: getAdminUsersPayload().users
    });
});

app.get('/api/admin/leaderboard', requireAdminAuth, (req, res) => {
    res.json({
        ok: true,
        maxEntries: globalLeaderboard.maxEntries,
        entries: getAdminLeaderboardEntries()
    });
});

app.post('/api/admin/leaderboard', requireAdminAuth, (req, res) => {
    const entry = addLeaderboardEntryFromAdmin(req.body || {});
    res.json({
        ok: true,
        entry,
        entries: getAdminLeaderboardEntries()
    });
});

app.post('/api/admin/leaderboard/reset', requireAdminAuth, (req, res) => {
    clearLeaderboardFromAdmin();
    res.json({
        ok: true,
        entries: getAdminLeaderboardEntries()
    });
});

app.post('/api/admin/leaderboard/:entryId', requireAdminAuth, (req, res) => {
    const result = updateLeaderboardEntryFromAdmin(req.params.entryId, req.body || {});
    if (!result.ok) {
        return res.status(404).json({
            ok: false,
            error: result.reason
        });
    }

    res.json({
        ok: true,
        entry: result.entry,
        entries: getAdminLeaderboardEntries()
    });
});

app.delete('/api/admin/leaderboard/:entryId', requireAdminAuth, (req, res) => {
    const result = deleteLeaderboardEntryFromAdmin(req.params.entryId);
    if (!result.ok) {
        return res.status(404).json({
            ok: false,
            error: result.reason
        });
    }

    res.json({
        ok: true,
        entries: getAdminLeaderboardEntries()
    });
});

app.get('/api/game-assets', (req, res) => {
    const catalog = getGameAssetCatalog();
    res.json({
        ok: true,
        defaultSkinId: catalog.defaultSkinId,
        defaultWeaponId: catalog.defaultWeaponId,
        defaultEnemySpriteId: catalog.defaultEnemySpriteId,
        skins: catalog.skins,
        enemySprites: catalog.enemySprites,
        weapons: catalog.weapons
    });
});

app.get('/api/admin/game-assets/catalog', requireAdminAuth, (req, res) => {
    res.json(buildAdminGameAssetCatalogPayload());
});

app.post('/api/admin/game-assets/import', requireAdminAuth, async (req, res) => {
    try {
        const assetKind = typeof req.body?.assetKind === 'string' ? req.body.assetKind.trim() : '';
        const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
        const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
        const fileNameInput = typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';
        const contentBase64 = typeof req.body?.contentBase64 === 'string' ? req.body.contentBase64 : '';
        const overwrite = Boolean(req.body?.overwrite);
        const safeCost = req.body?.cost === '' || req.body?.cost === undefined || req.body?.cost === null
            ? 0
            : Math.max(0, Math.round(Number(req.body.cost) || 0));

        const assetDirectoryByKind = {
            playerSkin: 'sprites',
            enemySprite: 'sprites',
            weaponArt: 'weapons'
        };

        const targetDirectory = assetDirectoryByKind[assetKind];
        if (!targetDirectory) {
            return res.status(400).json({ error: 'Choose a valid game asset type.' });
        }

        const fileStem = sanitizeAssetSlug(fileNameInput || label || `asset-${Date.now()}`);
        if (!fileStem) {
            return res.status(400).json({ error: 'Provide a label or file name for the new asset.' });
        }

        let normalizedFileStem = fileStem;
        if (assetKind === 'enemySprite' && !normalizedFileStem.includes('enemy')) {
            normalizedFileStem = `enemy-${normalizedFileStem}`;
        }

        const resolvedFileName = `${normalizedFileStem}.svg`;
        const uploadResult = await writeAssetFile({
            directory: targetDirectory,
            fileName: resolvedFileName,
            contentBase64,
            overwrite
        });

        setGameAssetMetadataEntry(uploadResult.relativePath, {
            label: label || humanizeAssetName(resolvedFileName),
            description: description || '',
            cost: safeCost,
            category: assetKind
        });

        res.json({
            ok: true,
            imported: uploadResult.relativePath,
            catalog: buildAdminGameAssetCatalogPayload()
        });
    } catch (error) {
        res.status(400).json({
            error: error.code === 'EEXIST'
                ? 'A file with that name already exists.'
                : (error.message || 'Unable to import asset.')
        });
    }
});

app.post('/api/admin/game-assets/metadata', requireAdminAuth, async (req, res) => {
    try {
        const relativePath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
        if (!relativePath) {
            return res.status(400).json({ error: 'Asset path is required.' });
        }

        const { absolutePath, relativePath: normalizedRelativePath } = resolveAssetRelativePath(relativePath);
        const stat = await fs.promises.stat(absolutePath).catch(() => null);
        if (!stat || !stat.isFile()) {
            return res.status(400).json({ error: 'Select an existing file asset to edit metadata.' });
        }

        setGameAssetMetadataEntry(normalizedRelativePath, {
            label: req.body?.label,
            description: req.body?.description,
            cost: req.body?.cost,
            category: req.body?.category || inferGameAssetCategory(normalizedRelativePath)
        });

        res.json({
            ok: true,
            path: normalizedRelativePath,
            metadata: getGameAssetMetadataEntry(normalizedRelativePath),
            catalog: buildAdminGameAssetCatalogPayload()
        });
    } catch (error) {
        res.status(400).json({
            error: error.message || 'Unable to update asset metadata.'
        });
    }
});

app.get('/api/admin/assets', requireAdminAuth, async (req, res) => {
    try {
        const directory = typeof req.query.dir === 'string' ? req.query.dir : '';
        const listing = await listAssetDirectory(directory);
        res.json({
            ok: true,
            ...listing
        });
    } catch (error) {
        res.status(400).json({
            error: error.message || 'Unable to list assets.'
        });
    }
});

app.get('/api/admin/assets/svg-templates', requireAdminAuth, async (req, res) => {
    try {
        const templates = await collectSvgTemplates('');
        res.json({
            ok: true,
            templates
        });
    } catch (error) {
        res.status(400).json({
            error: error.message || 'Unable to list SVG templates.'
        });
    }
});

app.post('/api/admin/assets/folders', requireAdminAuth, async (req, res) => {
    try {
        const parentDirectory = typeof req.body?.dir === 'string' ? req.body.dir : '';
        const folderName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';

        if (!folderName || /[<>:"|?*\x00-\x1F\\/]/.test(folderName)) {
            return res.status(400).json({ error: 'Folder name is missing or contains invalid characters.' });
        }

        const { absolutePath: parentAbsolutePath, relativePath: parentRelativePath } = resolveAssetRelativePath(parentDirectory);
        const newFolderAbsolutePath = path.join(parentAbsolutePath, folderName);

        if (!isPathInside(ASSETS_ROOT, newFolderAbsolutePath)) {
            return res.status(400).json({ error: 'Folder path is invalid.' });
        }

        await fs.promises.mkdir(newFolderAbsolutePath, { recursive: false });
        invalidateGameAssetCatalog();
        res.json({
            ok: true,
            created: parentRelativePath ? `${parentRelativePath}/${folderName}` : folderName
        });
    } catch (error) {
        res.status(400).json({
            error: error.code === 'EEXIST'
                ? 'A folder with that name already exists.'
                : (error.message || 'Unable to create folder.')
        });
    }
});

app.post('/api/admin/assets/upload', requireAdminAuth, async (req, res) => {
    try {
        const directory = typeof req.body?.dir === 'string' ? req.body.dir : '';
        const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';
        const contentBase64 = typeof req.body?.contentBase64 === 'string' ? req.body.contentBase64 : '';
        const overwrite = Boolean(req.body?.overwrite);

        if (!contentBase64) {
            return res.status(400).json({ error: 'File content is required.' });
        }

        const uploadResult = await writeAssetFile({
            directory,
            fileName,
            contentBase64,
            overwrite
        });
        res.json({
            ok: true,
            uploaded: uploadResult.relativePath,
            overwritten: uploadResult.overwritten
        });
    } catch (error) {
        res.status(400).json({
            error: error.code === 'EEXIST'
                ? 'A file with that name already exists.'
                : (error.message || 'Unable to upload asset.')
        });
    }
});

app.post('/api/admin/assets/rename', requireAdminAuth, async (req, res) => {
    try {
        const currentPath = typeof req.body?.path === 'string' ? req.body.path : '';
        const newName = typeof req.body?.newName === 'string' ? req.body.newName.trim() : '';

        if (!currentPath) {
            return res.status(400).json({ error: 'Select a specific asset or folder to rename.' });
        }

        if (!newName || /[<>:"|?*\x00-\x1F\\/]/.test(newName)) {
            return res.status(400).json({ error: 'New name is missing or contains invalid characters.' });
        }

        const { absolutePath: currentAbsolutePath, relativePath: currentRelativePath } = resolveAssetRelativePath(currentPath);
        const targetAbsolutePath = path.join(path.dirname(currentAbsolutePath), newName);

        if (!isPathInside(ASSETS_ROOT, targetAbsolutePath)) {
            return res.status(400).json({ error: 'Rename target is invalid.' });
        }

        const currentStat = await fs.promises.stat(currentAbsolutePath);
        await fs.promises.rename(currentAbsolutePath, targetAbsolutePath);
        const renamedRelativePath = toForwardSlashPath(path.relative(ASSETS_ROOT, targetAbsolutePath));
        if (currentStat.isDirectory()) {
            renameGameAssetMetadataPrefix(currentRelativePath, renamedRelativePath);
        } else {
            renameGameAssetMetadataEntry(currentRelativePath, renamedRelativePath);
        }
        invalidateGameAssetCatalog();
        res.json({
            ok: true,
            renamedFrom: currentRelativePath,
            renamedTo: renamedRelativePath
        });
    } catch (error) {
        res.status(400).json({
            error: error.code === 'EEXIST'
                ? 'A file or folder with that name already exists.'
                : (error.message || 'Unable to rename asset.')
        });
    }
});

app.delete('/api/admin/assets', requireAdminAuth, async (req, res) => {
    try {
        const targetPath = typeof req.query.path === 'string' ? req.query.path : '';
        const confirmName = typeof req.query.confirmName === 'string' ? req.query.confirmName.trim() : '';

        if (!targetPath) {
            return res.status(400).json({ error: 'Select a specific asset or folder to delete.' });
        }

        const { absolutePath, relativePath } = resolveAssetRelativePath(targetPath);
        const expectedName = path.basename(relativePath);
        if (!confirmName || confirmName !== expectedName) {
            return res.status(400).json({ error: `Type "${expectedName}" to confirm deletion.` });
        }

        const stat = await fs.promises.stat(absolutePath);

        if (stat.isDirectory()) {
            await fs.promises.rm(absolutePath, { recursive: true, force: false });
            Object.keys(gameAssetMetadataStore.items)
                .filter((entryPath) => entryPath === relativePath || entryPath.startsWith(`${relativePath}/`))
                .forEach((entryPath) => delete gameAssetMetadataStore.items[entryPath]);
            saveGameAssetMetadataStore();
        } else {
            await fs.promises.unlink(absolutePath);
            deleteGameAssetMetadataEntry(relativePath);
        }

        invalidateGameAssetCatalog();
        res.json({
            ok: true,
            deleted: relativePath
        });
    } catch (error) {
        res.status(400).json({
            error: error.message || 'Unable to delete asset.'
        });
    }
});

app.get('/api/admin/rooms/:roomId', requireAdminAuth, (req, res) => {
    const room = gameRooms.get(req.params.roomId);

    if (!room) {
        return res.status(404).json({
            error: 'Room not found'
        });
    }

    res.json({
        generatedAt: new Date().toISOString(),
        room: getRoomAdminSnapshot(room)
    });
});

app.post('/api/admin/server/connections', requireAdminAuth, (req, res) => {
    blockNewConnections = Boolean(req.body?.blocked);

    res.json({
        ok: true,
        blockNewConnections
    });
});

app.post('/api/admin/rooms/:roomId/lock', requireAdminAuth, (req, res) => {
    const room = gameRooms.get(req.params.roomId);

    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }

    room.locked = Boolean(req.body?.locked);
    emitRoomState(room);
    emitRoomList();

    return res.json({
        ok: true,
        room: getRoomAdminSnapshot(room)
    });
});

app.post('/api/admin/rooms/:roomId/players/:playerId/kick', requireAdminAuth, (req, res) => {
    const room = gameRooms.get(req.params.roomId);

    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }

    if (!room.players.has(req.params.playerId)) {
        return res.status(404).json({ error: 'Player not found in room' });
    }

    const socket = io.sockets.sockets.get(req.params.playerId);
    if (!socket) {
        return res.status(404).json({ error: 'Player socket not connected' });
    }

    disconnectSocketForModeration(socket, 'player_kicked', {
        roomId: room.id,
        roomName: room.name
    });

    return res.json({
        ok: true
    });
});

app.post('/api/admin/ip-blocks', requireAdminAuth, (req, res) => {
    const ipAddress = normalizeIpAddress(req.body?.ipAddress);
    const disconnectExisting = req.body?.disconnectExisting !== false;

    if (!ipAddress || ipAddress === 'unknown') {
        return res.status(400).json({ error: 'A valid IP address is required' });
    }

    blockedIps.add(ipAddress);

    if (disconnectExisting) {
        disconnectSocketsByIp(ipAddress, 'ip_blocked');
    }

    return res.json({
        ok: true,
        blockedIps: Array.from(blockedIps.values()).sort()
    });
});

app.delete('/api/admin/ip-blocks/:ipAddress', requireAdminAuth, (req, res) => {
    const ipAddress = normalizeIpAddress(decodeURIComponent(req.params.ipAddress));
    blockedIps.delete(ipAddress);

    return res.json({
        ok: true,
        blockedIps: Array.from(blockedIps.values()).sort()
    });
});

app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body || {};
    const result = createUserAccount(username, password);

    if (!result.ok) {
        return res.status(400).json({
            ok: false,
            error: result.reason
        });
    }

    const token = createAuthToken(result.user);
    setAuthCookie(res, token);
    return res.json({
        ok: true,
        token,
        profile: getPublicProfile(result.user)
    });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    const result = loginUserAccount(username, password);

    if (!result.ok) {
        return res.status(400).json({
            ok: false,
            error: result.reason
        });
    }

    const token = createAuthToken(result.user);
    setAuthCookie(res, token);
    return res.json({
        ok: true,
        token,
        profile: getPublicProfile(result.user)
    });
});

app.get('/api/auth/session', requireUserAuth, (req, res) => {
    setAuthCookie(res, createAuthToken(req.user));
    res.json({
        ok: true,
        profile: getPublicProfile(req.user)
    });
});

app.post('/api/auth/logout', requireUserAuth, (req, res) => {
    req.user.sessionNonce = crypto.randomBytes(16).toString('hex');
    saveUserStore();
    clearAuthCookie(res);

    res.json({
        ok: true
    });
});

app.post('/api/profile/skin/select', requireUserAuth, (req, res) => {
    const { skinTheme } = req.body || {};
    const result = updateUserSelectedSkin(req.user, skinTheme);

    if (!result.ok) {
        return res.status(400).json({
            ok: false,
            error: result.reason
        });
    }

    res.json({
        ok: true,
        profile: result.profile
    });
});

app.post('/api/profile/skin/unlock', requireUserAuth, (req, res) => {
    const { skinTheme } = req.body || {};
    const result = unlockSkinForUser(req.user, skinTheme);

    if (!result.ok) {
        return res.status(400).json({
            ok: false,
            error: result.reason
        });
    }

    res.json({
        ok: true,
        profile: result.profile,
        unlockedSkin: result.unlockedSkin
    });
});

app.post('/api/profile/weapon/select', requireUserAuth, (req, res) => {
    const { weaponType } = req.body || {};
    const result = updateUserSelectedWeapon(req.user, weaponType);

    if (!result.ok) {
        return res.status(400).json({
            ok: false,
            error: result.reason
        });
    }

    res.json({
        ok: true,
        profile: result.profile
    });
});

app.post('/api/profile/weapon/unlock', requireUserAuth, (req, res) => {
    const { weaponType } = req.body || {};
    const result = unlockWeaponForUser(req.user, weaponType);

    if (!result.ok) {
        return res.status(400).json({
            ok: false,
            error: result.reason
        });
    }

    res.json({
        ok: true,
        profile: result.profile,
        unlockedWeapon: result.unlockedWeapon
    });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    socket.data = socket.data || {};
    socket.data.clientIp = getClientIp(socket);
    const authUser = getAuthenticatedUserFromSocket(socket);
    socket.data.authUserId = authUser?.id || null;
    socket.data.authUsername = authUser?.username || null;

    if (blockNewConnections) {
        socket.emit('joinRoomFailed', 'Server is temporarily locked to new connections');
        socket.disconnect(true);
        return;
    }

    if (isIpBlocked(socket.data.clientIp)) {
        socket.emit('joinRoomFailed', 'This IP address has been blocked by an admin');
        socket.disconnect(true);
        return;
    }

    console.log(`Player connected: ${socket.id} (Total clients: ${io.engine.clientsCount})`);

    socket.emit('authState', {
        authenticated: Boolean(authUser),
        profile: authUser ? getPublicProfile(authUser) : null
    });

    // Send available rooms
    emitRoomList(socket);

    // Handle manual room list refresh
    socket.on('getRooms', () => {
        console.log(`Player ${socket.id} requested room list refresh`);
        emitRoomList(socket);
    });

    socket.on('createRoom', (roomName, playerName, skinTheme, selectedWeapon, roomMode, roomOptions) => {
        console.log(`Creating room: ${roomName} by player: ${playerName}`);
        const roomId = uuidv4();
        const normalizedMode = normalizeRoomMode(roomMode);
        const pvpSettings = roomOptions && typeof roomOptions === 'object' ? roomOptions : {};
        const room = new GameRoom(roomId, roomName, { mode: normalizedMode, pvpSettings });
        gameRooms.set(roomId, room);
        
        if (room.addPlayer(socket, playerName, skinTheme, selectedWeapon)) {
            console.log(`Room created successfully. Room ID: ${roomId}`);
            socket.emit('roomJoined', {
                roomId: roomId,
                roomName: roomName,
                playerId: socket.id
            });
            emitRoomState(room);
            
            // Broadcast room list update
            console.log(`Broadcasting room list update. Total rooms: ${gameRooms.size}`);
            const roomListData = Array.from(gameRooms.values()).map(serializeRoomSummary);
            console.log('Room list being sent:', roomListData);
            console.log(`Broadcasting to ${io.engine.clientsCount} connected clients`);
            emitRoomList();
        }
    });

    socket.on('spectateRoom', (roomId) => {
        const room = gameRooms.get(roomId);
        if (!room) {
            socket.emit('joinRoomFailed', 'Room does not exist for spectating');
            return;
        }

        room.addSpectator(socket);
        socket.emit('spectatorJoined', {
            roomId: room.id,
            roomName: room.name
        });
        emitRoomState(room);

        if (room.gameStarted) {
            socket.emit('arenaState', room.getArenaState());
            socket.emit('gameStarted');
            socket.emit('gameState', room.getGameState());
        }

        emitRoomList();
    });

    socket.on('joinRoom', (roomId, playerName, skinTheme, selectedWeapon) => {
        const room = gameRooms.get(roomId);
        if (room && room.locked) {
            socket.emit('joinRoomFailed', 'This room has been locked by an admin');
            return;
        }

        if (room && room.addPlayer(socket, playerName, skinTheme, selectedWeapon)) {
            socket.emit('roomJoined', {
                roomId: roomId,
                roomName: room.name,
                playerId: socket.id
            });
            emitRoomState(room);
            
             // If game is already started, immediately put player into game
             if (room.gameStarted) {
                 socket.emit('arenaState', room.getArenaState());
                 socket.emit('gameStarted');
                 if (!room.isPvpMode()) {
                     socket.emit('waveStart', {
                         wave: room.wave,
                         enemyCount: room.maxEnemiesPerWave,
                         spawnRate: room.getCurrentSpawnRate(),
                         ...room.getWaveInfo()
                     });
                 }
                 console.log(`Player ${playerName} joined game in progress`);
             }
            
            // Notify other players in the room
            socket.to(roomId).emit('playerJoined', {
                playerId: socket.id,
                playerName: playerName
            });
            emitRoomState(room);
            
            // Broadcast room list update
            emitRoomList();
        } else {
            socket.emit('joinRoomFailed', 'Room is full or does not exist');
        }
    });

    socket.on('startGame', () => {
        // Find the room this player is in
        for (const room of gameRooms.values()) {
            if (room.players.has(socket.id)) {
                if (room.hostId !== socket.id) {
                    socket.emit('joinRoomFailed', 'Only the host can start this room');
                    break;
                }
                if (!room.gameStarted && room.players.size > 0) {
                    room.startGame();
                    emitRoomState(room);
                    io.to(room.id).emit('gameStarted');
                    room.emitWaveStart();
                }
                break;
            }
        }
    });

    socket.on('playerInput', (inputState) => {
        for (const room of gameRooms.values()) {
            if (room.players.has(socket.id)) {
                room.updatePlayerInput(socket.id, inputState);
                break;
            }
        }
    });

    socket.on('playerShoot', (weaponType, callback) => {
        let handled = false;

        for (const room of gameRooms.values()) {
            if (room.players.has(socket.id)) {
                handled = true;
                const result = room.playerShoot(socket.id, weaponType);
                if (typeof callback === 'function') {
                    callback(result);
                }
                if (result?.ok) {
                    io.to(room.id).emit('gameState', room.getGameState());
                }
                break;
            }
        }

        if (!handled && typeof callback === 'function') {
            callback({ ok: false, reason: 'Player is not in an active room' });
        }
    });

    socket.on('reloadWeapon', (weaponType, callback) => {
        let handled = false;

        for (const room of gameRooms.values()) {
            if (room.players.has(socket.id)) {
                handled = true;
                const result = room.requestReload(socket.id, weaponType);
                if (result.ok) {
                    io.to(room.id).emit('gameState', room.getGameState());
                }
                if (typeof callback === 'function') {
                    callback(result);
                }
                break;
            }
        }

        if (!handled && typeof callback === 'function') {
            callback({ ok: false, reason: 'Room not found' });
        }
    });

    socket.on('throwGrenade', (options, callback) => {
        let handled = false;

        for (const room of gameRooms.values()) {
            if (room.players.has(socket.id)) {
                handled = true;
                const result = room.throwGrenade(socket.id, options);
                if (result?.ok) {
                    io.to(room.id).emit('gameState', room.getGameState());
                }
                if (typeof callback === 'function') {
                    callback(result);
                }
                break;
            }
        }

        if (!handled && typeof callback === 'function') {
            callback({ ok: false, reason: 'Room not found' });
        }
    });

    socket.on('buyUpgrade', (upgradeType, callback) => {
        let handled = false;

        for (const room of gameRooms.values()) {
            if (room.players.has(socket.id)) {
                handled = true;
                const result = room.purchaseUpgrade(socket.id, upgradeType);
                if (result.ok) {
                    if (typeof callback === 'function') {
                        callback(result);
                    }
                    socket.emit('shopPurchaseResult', result);
                    io.to(room.id).emit('gameState', room.getGameState());
                } else {
                    if (typeof callback === 'function') {
                        callback(result);
                    }
                    socket.emit('shopPurchaseResult', result);
                    socket.emit('shopError', result.reason);
                }
                break;
            }
        }

        if (!handled && typeof callback === 'function') {
            callback({ ok: false, reason: 'Player not found in active room' });
        }
    });

    socket.on('voteEndMatch', (callback) => {
        let handled = false;

        for (const room of gameRooms.values()) {
            if (room.players.has(socket.id)) {
                handled = true;
                const result = room.toggleEndMatchVote(socket.id);

                if (typeof callback === 'function') {
                    callback(result);
                }

                if (!result.ok) {
                    socket.emit('shopError', result.reason);
                    break;
                }

                io.to(room.id).emit('gameState', room.getGameState());

                if (result.completed) {
                    endRoomByConsensus(room);
                }
                break;
            }
        }

        if (!handled && typeof callback === 'function') {
            callback({ ok: false, reason: 'Player not found in active room' });
        }
    });

    socket.on('respawn', () => {
        for (const room of gameRooms.values()) {
            const player = room.players.get(socket.id);
            if (player && !player.alive) {
                player.respawn(room.getPlayerSpawnPoint(player));
                break;
            }
        }
    });

    socket.on('endGame', () => {
        for (const room of gameRooms.values()) {
            const player = room.players.get(socket.id);
            if (player) {
                const rewardSummary = room.awardPersistentProgress(player, room.wave);
                if (rewardSummary?.profile) {
                    socket.emit('profileUpdated', rewardSummary.profile);
                }

                let rank = null;
                // Add player to leaderboard
                if (player.score > 0) {
                    rank = addToLeaderboard(player.accountUsername || player.name, player.score, room.wave, {
                        accountUserId: player.accountUserId
                    });
                    console.log(`Player ${player.name} ended game with score ${player.score}, wave ${room.wave}, rank ${rank}`);
                }

                socket.emit('gameEndedPersonal', {
                    finalScore: player.score,
                    finalWave: room.wave,
                    rank,
                    leaderboard: getLeaderboard(),
                    metaReward: rewardSummary?.reward || 0,
                    metaCurrency: rewardSummary?.profile?.metaCurrency ?? null
                });
                
                // Remove player from room
                room.removePlayer(socket.id);
                socket.leave(room.id);
                
                // Notify other players
                socket.to(room.id).emit('playerLeft', socket.id);
                emitRoomState(room);
                
                // If room becomes empty, clean it up
                if (room.players.size === 0) {
                    room.endGame();
                    gameRooms.delete(room.id);
                }
                
                // Update room list
                emitRoomList();
                
                break;
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id} (Remaining clients: ${io.engine.clientsCount - 1})`);

        for (const room of gameRooms.values()) {
            if (room.spectators.has(socket.id)) {
                room.removeSpectator(socket.id);
                emitRoomState(room);
                emitRoomList();
                break;
            }
        }
        
        // Remove player from their room
        for (const [roomId, room] of gameRooms) {
            if (room.players.has(socket.id)) {
                const player = room.players.get(socket.id);
                
                if (player && room.gameStarted) {
                    room.awardPersistentProgress(player, room.wave);
                }

                // Add to leaderboard if they had a score
                if (player && player.score > 0 && room.gameStarted) {
                    addToLeaderboard(player.accountUsername || player.name, player.score, room.wave, {
                        accountUserId: player.accountUserId
                    });
                }
                
                room.removePlayer(socket.id);
                
                // End game if all players left
                if (room.players.size === 0 && room.gameStarted) {
                    room.endGame();
                }
                
                // Notify other players in the room
                socket.to(roomId).emit('playerLeft', socket.id);
                emitRoomState(room);
                
                // Remove empty rooms
                if (room.players.size === 0) {
                    gameRooms.delete(roomId);
                }
                
                // Broadcast room list update
                emitRoomList();
                break;
            }
        }
    });

    socket.on('getLeaderboard', () => {
        console.log(`Player ${socket.id} requested leaderboard`);
        const leaderboard = getLeaderboard();
        console.log(`Sending leaderboard with ${leaderboard.length} entries`);
        socket.emit('leaderboard', leaderboard);
    });
});

// Game loop - update all rooms
setInterval(() => {
    for (const room of gameRooms.values()) {
        room.update();
        
        if (room.gameStarted && room.players.size > 0) {
            io.to(room.id).emit('gameState', room.getGameState());
        }
    }
}, 1000 / GAME_CONFIG.tickRate);

// Periodic room list synchronization (every 5 seconds)
setInterval(() => {
    if (io.engine.clientsCount > 0) {
        const roomListData = Array.from(gameRooms.values()).map(serializeRoomSummary);
        
        if (roomListData.length > 0) {
            console.log(`Periodic sync: Broadcasting ${roomListData.length} rooms to ${io.engine.clientsCount} clients`);
            io.emit('roomList', roomListData);
        }
    }
}, 5000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Game accessible at http://localhost:${PORT}`);

    const interfaces = os.networkInterfaces();
    const addresses = Object.values(interfaces)
        .flatMap((entries) => Array.isArray(entries) ? entries : [])
        .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
        .map((entry) => entry.address)
        .filter(Boolean);
    const uniqueAddresses = Array.from(new Set(addresses));
    if (uniqueAddresses.length > 0) {
        console.log(`Network access: ${uniqueAddresses.map((ip) => `http://${ip}:${PORT}`).join(' | ')}`);
    } else {
        console.log(`Network access: http://[YOUR_IP_ADDRESS]:${PORT}`);
        console.log(`To find your IP: run 'ipconfig' in command prompt`);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server shut down.');
        process.exit(0);
    });
});
