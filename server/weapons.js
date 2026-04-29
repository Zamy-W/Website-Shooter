'use strict';

const fs = require('fs');
const path = require('path');
const { sanitizeAssetSlug } = require('./utils');

const PROJECT_ROOT = path.join(__dirname, '..');
const ASSETS_ROOT = path.join(PROJECT_ROOT, 'assets');
const DATA_CATALOG_ROOT = path.join(PROJECT_ROOT, 'data', 'catalog');
const WEAPON_CATALOG_PATH = path.join(DATA_CATALOG_ROOT, 'weapons.json');

const SUPPORTED_WEAPON_BEHAVIORS = new Set(['projectile', 'spread', 'charge_shot']);

const DEFAULT_WEAPON_CATALOG_STORE = {
    version: 1,
    defaultWeaponId: 'pistol',
    weapons: [
        {
            id: 'pistol', label: 'Pistol',
            description: 'Standard sidearm issued to every new operator.',
            cost: 0, sortOrder: 10, behaviorId: 'projectile', slot: 'sidearm',
            artPath: 'weapons/pistol.svg', playable: true,
            stats: { pelletCount: 1, damage: 40, range: 300, spread: 0.05, cooldown: 300, speed: 600, magazineSize: 12, reloadTime: 1100, chargeTime: 0 },
            fx: { recoilForce: 5, muzzleFlashDuration: 80, shellEjection: true, energyBeam: false, sound: 'pistol_fire', impactColor: '#57ff8c', hitRadius: 3 },
            presentation: { crosshairColor: '#00ff00', spreadGuideColor: 'rgba(0, 255, 0, 0.2)', holdOffset: 18, muzzleOffset: 16, ejectBackOffset: 5, ejectSideOffset: -7, shellEjectAngleBias: -0.08, smokeTrailScale: 0, showSpreadIndicator: false }
        },
        {
            id: 'shotgun', label: 'Shotgun',
            description: 'Heavy close-range option with a brutal blast pattern.',
            cost: 320, sortOrder: 20, behaviorId: 'spread', slot: 'primary',
            artPath: 'weapons/shotgun.svg', playable: true,
            stats: { pelletCount: 8, damage: 25, range: 200, spread: 0.3, cooldown: 800, speed: 800, magazineSize: 6, reloadTime: 1450, chargeTime: 0 },
            fx: { recoilForce: 15, muzzleFlashDuration: 100, shellEjection: true, energyBeam: false, sound: 'shotgun_fire', impactColor: '#ff9f43', hitRadius: 3 },
            presentation: { crosshairColor: '#ff8800', spreadGuideColor: 'rgba(255, 136, 0, 0.3)', holdOffset: 20, muzzleOffset: 22, ejectBackOffset: 8, ejectSideOffset: -10, shellEjectAngleBias: -0.18, smokeTrailScale: 0.8, showSpreadIndicator: true }
        },
        {
            id: 'rifle', label: 'Rifle',
            description: 'Reliable high-pressure weapon for sustained fire.',
            cost: 460, sortOrder: 30, behaviorId: 'projectile', slot: 'primary',
            artPath: 'weapons/rifle.svg', playable: true,
            stats: { pelletCount: 1, damage: 60, range: 400, spread: 0.02, cooldown: 150, speed: 1000, magazineSize: 24, reloadTime: 1600, chargeTime: 0 },
            fx: { recoilForce: 8, muzzleFlashDuration: 60, shellEjection: true, energyBeam: false, sound: 'rifle_fire', impactColor: '#63b3ff', hitRadius: 3 },
            presentation: { crosshairColor: '#0099ff', spreadGuideColor: 'rgba(0, 153, 255, 0.24)', holdOffset: 21, muzzleOffset: 20, ejectBackOffset: 7, ejectSideOffset: -8, shellEjectAngleBias: -0.1, smokeTrailScale: 0.8, showSpreadIndicator: false }
        },
        {
            id: 'sniper', label: 'Sniper Laser',
            description: 'Charge a single blue laser round and crack long lanes with heavy recoil.',
            cost: 620, sortOrder: 40, behaviorId: 'charge_shot', slot: 'primary',
            artPath: 'weapons/sniper.svg', playable: true,
            stats: { pelletCount: 1, damage: 300, range: 900, spread: 0.008, cooldown: 1500, speed: 1900, magazineSize: 3, reloadTime: 2100, chargeTime: 420 },
            fx: { recoilForce: 18, muzzleFlashDuration: 140, shellEjection: false, energyBeam: true, sound: 'sniper_laser', impactColor: '#67c9ff', hitRadius: 9 },
            presentation: { crosshairColor: '#67c9ff', spreadGuideColor: 'rgba(103, 201, 255, 0.2)', holdOffset: 24, muzzleOffset: 28, ejectBackOffset: 0, ejectSideOffset: 0, shellEjectAngleBias: -0.04, smokeTrailScale: 0, showSpreadIndicator: false }
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
    const baseEntry = fallbackEntries.find((w) => w.id === requestedId) || safeFallback;
    const rawStats = entry?.stats && typeof entry.stats === 'object' ? entry.stats : {};
    const rawFx = entry?.fx && typeof entry.fx === 'object' ? entry.fx : {};
    const rawPres = entry?.presentation && typeof entry.presentation === 'object' ? entry.presentation : {};
    const resolvedId = sanitizeAssetSlug(baseEntry.id || safeFallback.id);
    const num = (value, fallback) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };

    return {
        id: resolvedId,
        label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : baseEntry.label,
        description: typeof entry.description === 'string' && entry.description.trim() ? entry.description.trim() : baseEntry.description,
        cost: Math.max(0, Math.round(num(entry.cost, baseEntry.cost))),
        sortOrder: Math.max(0, Math.round(num(entry.sortOrder, baseEntry.sortOrder))),
        behaviorId: SUPPORTED_WEAPON_BEHAVIORS.has(entry.behaviorId) ? entry.behaviorId : baseEntry.behaviorId,
        slot: typeof entry.slot === 'string' && entry.slot.trim() ? entry.slot.trim() : baseEntry.slot,
        artPath: typeof entry.artPath === 'string' && entry.artPath.trim() ? entry.artPath.replace(/\\/g, '/').replace(/^\/+/, '').trim() : baseEntry.artPath,
        playable: entry.playable !== undefined ? Boolean(entry.playable) : baseEntry.playable !== false,
        stats: {
            pelletCount: Math.max(1, Math.round(num(rawStats.pelletCount ?? entry.pelletCount, baseEntry.stats.pelletCount))),
            damage: Math.max(1, num(rawStats.damage ?? entry.damage, baseEntry.stats.damage)),
            range: Math.max(1, num(rawStats.range ?? entry.range, baseEntry.stats.range)),
            spread: Math.max(0, num(rawStats.spread ?? entry.spread, baseEntry.stats.spread)),
            cooldown: Math.max(0, Math.round(num(rawStats.cooldown ?? entry.cooldown, baseEntry.stats.cooldown))),
            speed: Math.max(1, num(rawStats.speed ?? entry.speed, baseEntry.stats.speed)),
            magazineSize: Math.max(1, Math.round(num(rawStats.magazineSize ?? entry.magazineSize, baseEntry.stats.magazineSize))),
            reloadTime: Math.max(0, Math.round(num(rawStats.reloadTime ?? entry.reloadTime, baseEntry.stats.reloadTime))),
            chargeTime: Math.max(0, Math.round(num(rawStats.chargeTime ?? entry.chargeTime, baseEntry.stats.chargeTime || 0)))
        },
        fx: {
            recoilForce: Math.max(0, num(rawFx.recoilForce ?? entry.recoilForce, baseEntry.fx.recoilForce)),
            muzzleFlashDuration: Math.max(0, Math.round(num(rawFx.muzzleFlashDuration ?? entry.muzzleFlashDuration, baseEntry.fx.muzzleFlashDuration))),
            shellEjection: rawFx.shellEjection !== undefined ? Boolean(rawFx.shellEjection) : Boolean(entry.shellEjection !== undefined ? entry.shellEjection : baseEntry.fx.shellEjection),
            energyBeam: rawFx.energyBeam !== undefined ? Boolean(rawFx.energyBeam) : Boolean(entry.energyBeam !== undefined ? entry.energyBeam : baseEntry.fx.energyBeam),
            sound: typeof (rawFx.sound ?? entry.sound) === 'string' && String(rawFx.sound ?? entry.sound).trim() ? String(rawFx.sound ?? entry.sound).trim() : baseEntry.fx.sound,
            impactColor: typeof (rawFx.impactColor ?? entry.impactColor) === 'string' && String(rawFx.impactColor ?? entry.impactColor).trim() ? String(rawFx.impactColor ?? entry.impactColor).trim() : baseEntry.fx.impactColor,
            hitRadius: Math.max(1, num(rawFx.hitRadius ?? entry.hitRadius, baseEntry.fx.hitRadius))
        },
        presentation: {
            crosshairColor: typeof (rawPres.crosshairColor ?? entry.crosshairColor) === 'string' && String(rawPres.crosshairColor ?? entry.crosshairColor).trim() ? String(rawPres.crosshairColor ?? entry.crosshairColor).trim() : baseEntry.presentation.crosshairColor,
            spreadGuideColor: typeof (rawPres.spreadGuideColor ?? entry.spreadGuideColor) === 'string' && String(rawPres.spreadGuideColor ?? entry.spreadGuideColor).trim() ? String(rawPres.spreadGuideColor ?? entry.spreadGuideColor).trim() : baseEntry.presentation.spreadGuideColor,
            holdOffset: num(rawPres.holdOffset ?? entry.holdOffset, baseEntry.presentation.holdOffset),
            muzzleOffset: num(rawPres.muzzleOffset ?? entry.muzzleOffset, baseEntry.presentation.muzzleOffset),
            ejectBackOffset: num(rawPres.ejectBackOffset ?? entry.ejectBackOffset, baseEntry.presentation.ejectBackOffset),
            ejectSideOffset: num(rawPres.ejectSideOffset ?? entry.ejectSideOffset, baseEntry.presentation.ejectSideOffset),
            shellEjectAngleBias: num(rawPres.shellEjectAngleBias ?? entry.shellEjectAngleBias, baseEntry.presentation.shellEjectAngleBias),
            smokeTrailScale: Math.max(0, num(rawPres.smokeTrailScale ?? entry.smokeTrailScale, baseEntry.presentation.smokeTrailScale)),
            showSpreadIndicator: rawPres.showSpreadIndicator !== undefined ? Boolean(rawPres.showSpreadIndicator) : Boolean(entry.showSpreadIndicator !== undefined ? entry.showSpreadIndicator : baseEntry.presentation.showSpreadIndicator)
        }
    };
}

function normalizeWeaponCatalogStore(store = {}) {
    const sourceWeapons = Array.isArray(store.weapons) && store.weapons.length > 0 ? store.weapons : DEFAULT_WEAPON_CATALOG_STORE.weapons;
    const seenIds = new Set();
    const normalizedWeapons = sourceWeapons
        .map((entry, i) => normalizeWeaponCatalogEntry(entry, i))
        .filter((entry) => { if (!entry?.id || seenIds.has(entry.id)) return false; seenIds.add(entry.id); return true; });

    const playableWeapons = normalizedWeapons.filter((w) => w.playable !== false);
    const defaultCandidate = typeof store.defaultWeaponId === 'string' ? store.defaultWeaponId.trim() : '';
    const defaultWeaponId = playableWeapons.some((w) => w.id === defaultCandidate) ? defaultCandidate : (playableWeapons[0]?.id || DEFAULT_WEAPON_CATALOG_STORE.defaultWeaponId);

    normalizedWeapons.sort((a, b) => a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.label.localeCompare(b.label));
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
        if (seenIds.has(weapon.id)) { warnings.push(`Duplicate weapon id "${weapon.id}" ignored.`); return; }
        seenIds.add(weapon.id);
        if (!SUPPORTED_WEAPON_BEHAVIORS.has(weapon.behaviorId)) warnings.push(`Weapon "${weapon.id}" uses unknown behavior "${weapon.behaviorId}".`);
        if (weapon.artPath && !fs.existsSync(path.join(ASSETS_ROOT, weapon.artPath))) warnings.push(`Weapon "${weapon.id}" points to missing art "${weapon.artPath}".`);
    });
    if (!store.weapons.some((w) => w.playable !== false)) warnings.push('Weapon catalog has no playable weapons.');
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
        const normalized = normalizeWeaponCatalogStore(JSON.parse(fs.readFileSync(WEAPON_CATALOG_PATH, 'utf8')));
        validateWeaponCatalogStore(normalized).forEach((w) => console.warn(`[weapon-catalog] ${w}`));
        return normalized;
    } catch (error) {
        console.warn('Unable to load weapon catalog, using defaults:', error.message);
        const fallback = normalizeWeaponCatalogStore(createDefaultWeaponCatalogStore());
        validateWeaponCatalogStore(fallback).forEach((w) => console.warn(`[weapon-catalog] ${w}`));
        return fallback;
    }
}

function createWeaponRuntimeConfigMap(weapons) {
    return Object.fromEntries(
        weapons.filter((w) => w.playable !== false).map((w) => [w.id, { name: w.label, label: w.label, description: w.description, cost: w.cost, behaviorId: w.behaviorId, slot: w.slot, sortOrder: w.sortOrder, artPath: w.artPath, ...w.stats, ...w.fx, ...w.presentation }])
    );
}

function createWeaponShopCatalog(weapons) {
    return Object.fromEntries(
        weapons.map((w) => [w.id, { id: w.id, label: w.label, cost: w.cost, description: w.description, sortOrder: w.sortOrder, behaviorId: w.behaviorId, slot: w.slot, artPath: w.artPath, playable: w.playable !== false, stats: { ...w.stats }, fx: { ...w.fx }, presentation: { ...w.presentation }, ...w.stats, ...w.fx, ...w.presentation }])
    );
}

const weaponCatalogStore = loadWeaponCatalogStore();
const BUILT_IN_WEAPON_SHOP_CATALOG = Object.freeze(createWeaponShopCatalog(weaponCatalogStore.weapons));
const WEAPON_CONFIG = Object.freeze(createWeaponRuntimeConfigMap(weaponCatalogStore.weapons));
const DEFAULT_WEAPON_ID = weaponCatalogStore.weapons.some((w) => w.id === weaponCatalogStore.defaultWeaponId && w.playable !== false)
    ? weaponCatalogStore.defaultWeaponId
    : (Object.keys(WEAPON_CONFIG)[0] || 'pistol');

function getWeaponConfig(weaponType) {
    return WEAPON_CONFIG[weaponType] || WEAPON_CONFIG[DEFAULT_WEAPON_ID] || Object.values(WEAPON_CONFIG)[0];
}

function getSafeWeaponType(weaponType) {
    return WEAPON_CONFIG[weaponType] ? weaponType : DEFAULT_WEAPON_ID;
}

module.exports = {
    SUPPORTED_WEAPON_BEHAVIORS,
    DEFAULT_WEAPON_CATALOG_STORE,
    weaponCatalogStore,
    BUILT_IN_WEAPON_SHOP_CATALOG,
    WEAPON_CONFIG,
    DEFAULT_WEAPON_ID,
    createDefaultWeaponCatalogStore,
    normalizeWeaponCatalogEntry,
    normalizeWeaponCatalogStore,
    validateWeaponCatalogStore,
    ensureWeaponCatalogStorage,
    loadWeaponCatalogStore,
    createWeaponRuntimeConfigMap,
    createWeaponShopCatalog,
    getWeaponConfig,
    getSafeWeaponType
};
