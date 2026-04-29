'use strict';

const Vector2D = require('./Vector2D');
const { GAME_CONFIG } = require('../config');
const { WEAPON_CONFIG, UPGRADE_CONFIG: _UNUSED, getWeaponConfig, getSafeWeaponType } = require('../weapons');
const { UPGRADE_CONFIG } = require('../upgrades');
const { resolveArenaMovement } = require('../upgrades');
const { getUpgradeCost, normalizeIpAddress } = require('../utils');

// These are injected by the entry point after all modules load (avoids circular deps)
let _normalizeSkinTheme;
let _normalizeWeaponType;
let _sanitizeUnlockedWeapons;
let _getGameAssetCatalog;

function initServerPlayerDeps(deps) {
    _normalizeSkinTheme = deps.normalizeSkinTheme;
    _normalizeWeaponType = deps.normalizeWeaponType;
    _sanitizeUnlockedWeapons = deps.sanitizeUnlockedWeapons;
    _getGameAssetCatalog = deps.getGameAssetCatalog;
}

class ServerPlayer {
    constructor(id, name, x, y, skinTheme = null, ipAddress = 'unknown', account = null, loadout = null) {
        this.id = id;
        this.name = name;
        this.ipAddress = normalizeIpAddress(ipAddress);
        this.skinTheme = _normalizeSkinTheme(skinTheme);
        this.unlockedWeapons = _sanitizeUnlockedWeapons(loadout?.unlockedWeapons);
        this.selectedWeapon = this.unlockedWeapons.includes(_normalizeWeaponType(loadout?.selectedWeapon))
            ? _normalizeWeaponType(loadout.selectedWeapon)
            : _getGameAssetCatalog().defaultWeaponId;
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
        this.reloadState = { active: false, weaponType: null, endsAt: 0, durationMs: 0 };
        this.chargeState = { active: false, weaponType: null, startedAt: 0, endsAt: 0, durationMs: 0 };
        this.grenadeCount = GAME_CONFIG.grenade.maxCount;
        this.grenadeCooldownEndsAt = 0;
        this.accountUserId = account?.userId || null;
        this.accountUsername = account?.username || null;
        this.matchRewardGranted = false;
        this.lastRewardSummary = null;
        this.upgrades = { damage: 0, fireRate: 0, health: 0, speed: 0, shield: 0, grenade: 0 };
        this.speedBoost = 1.0;
        this.damageBoost = 1.0;
        this.shield = 0;
        this.powerUpEffects = { speed: 0, damage: 0, shield: 0 };
        this.inputState = { up: false, down: false, left: false, right: false, shooting: false, mouseX: 0, mouseY: 0 };
        this.spawnSlot = 0;
    }

    createDefaultWeaponAmmo() {
        return Object.fromEntries(
            Object.entries(WEAPON_CONFIG).map(([weaponType, weapon]) => [weaponType, weapon.magazineSize || 1])
        );
    }

    getMagazineSize(weaponType = this.currentWeapon) {
        const weapon = getWeaponConfig(weaponType);
        return weapon.magazineSize || 1;
    }

    canUseWeapon(weaponType = this.currentWeapon) {
        return this.unlockedWeapons.includes(_normalizeWeaponType(weaponType));
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
        Object.keys(WEAPON_CONFIG).forEach((weaponType) => this.refillWeapon(weaponType));
    }

    clearWeaponCharge() {
        if (!this.chargeState.active && !this.chargeState.weaponType) return false;
        this.chargeState = { active: false, weaponType: null, startedAt: 0, endsAt: 0, durationMs: 0 };
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

        this.chargeState = { active: true, weaponType: normalizedWeapon, startedAt: now, endsAt: now + durationMs, durationMs };
        return this.getChargeSnapshot(now);
    }

    getChargeSnapshot(now = Date.now()) {
        const active = Boolean(this.chargeState.active && this.chargeState.weaponType);
        const durationMs = Number.isFinite(this.chargeState.durationMs) ? this.chargeState.durationMs : 0;
        const startedAt = Number.isFinite(this.chargeState.startedAt) ? this.chargeState.startedAt : 0;
        const endsAt = Number.isFinite(this.chargeState.endsAt) ? this.chargeState.endsAt : 0;
        const progress = active && durationMs > 0 ? Math.min(1, Math.max(0, (now - startedAt) / durationMs)) : 0;
        return { active, weaponType: this.chargeState.weaponType, startedAt, endsAt, durationMs, progress, ready: active && endsAt <= now };
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
        if (!this.canThrowGrenade(now)) return false;
        this.grenadeCount = Math.max(0, this.grenadeCount - 1);
        this.grenadeCooldownEndsAt = now + GAME_CONFIG.grenade.cooldown;
        return true;
    }

    completeReloadIfReady(now = Date.now()) {
        if (!this.reloadState.active || this.reloadState.endsAt > now) return false;
        const weaponType = WEAPON_CONFIG[this.reloadState.weaponType] ? this.reloadState.weaponType : this.currentWeapon;
        this.refillWeapon(weaponType);
        this.reloadState = { active: false, weaponType: null, endsAt: 0, durationMs: 0 };
        return true;
    }

    isReloadingWeapon(weaponType = this.currentWeapon, now = Date.now()) {
        this.completeReloadIfReady(now);
        return this.reloadState.active && this.reloadState.weaponType === weaponType;
    }

    cancelReload() {
        if (!this.reloadState.active) return false;
        this.reloadState = { active: false, weaponType: null, endsAt: 0, durationMs: 0 };
        return true;
    }

    startReload(weaponType = this.currentWeapon, now = Date.now()) {
        const normalizedWeapon = getSafeWeaponType(weaponType || this.currentWeapon);
        this.completeReloadIfReady(now);
        this.clearWeaponCharge();

        if (!this.alive) return { ok: false, reason: 'Cannot reload while down' };
        if (this.reloadState.active) {
            if (this.reloadState.weaponType === normalizedWeapon) return { ok: false, reason: 'Already reloading' };
            this.cancelReload();
        }

        const magazineSize = this.getMagazineSize(normalizedWeapon);
        const currentAmmo = this.getAmmoForWeapon(normalizedWeapon);
        if (currentAmmo >= magazineSize) return { ok: false, reason: 'Magazine already full' };

        const weapon = getWeaponConfig(normalizedWeapon);
        this.reloadState = { active: true, weaponType: normalizedWeapon, endsAt: now + weapon.reloadTime, durationMs: weapon.reloadTime };
        return { ok: true, weaponType: normalizedWeapon, endsAt: this.reloadState.endsAt, durationMs: this.reloadState.durationMs };
    }

    setCurrentWeapon(weaponType) {
        if (!WEAPON_CONFIG[weaponType] || !this.canUseWeapon(weaponType)) return;
        if (this.currentWeapon !== weaponType) {
            if (this.reloadState.active) this.cancelReload();
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
        return { active: this.reloadState.active, weaponType: this.reloadState.weaponType, endsAt: this.reloadState.endsAt, durationMs: this.reloadState.durationMs };
    }

    update(deltaTime, arena = null) {
        if (!this.alive) { this.cancelReload(); return; }
        this.completeReloadIfReady();

        for (const [effect, timer] of Object.entries(this.powerUpEffects)) {
            if (timer > 0) {
                this.powerUpEffects[effect] -= deltaTime * 1000;
                if (this.powerUpEffects[effect] <= 0) {
                    this.powerUpEffects[effect] = 0;
                    switch (effect) {
                        case 'speed': this.speedBoost = 1.0; break;
                        case 'damage': this.damageBoost = 1.0; break;
                        case 'shield': this.shield = 0; break;
                    }
                }
            }
        }

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

        const desiredPosition = this.position.add(this.velocity.multiply(deltaTime));
        this.position = resolveArenaMovement(arena, this.position, desiredPosition, GAME_CONFIG.player.size);

        const direction = new Vector2D(this.inputState.mouseX, this.inputState.mouseY).subtract(this.position);
        this.angle = Math.atan2(direction.y, direction.x);
    }

    takeDamage(damage) {
        if (this.shield > 0) {
            this.shield -= damage;
            if (this.shield < 0) {
                this.health += this.shield;
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
            case 'health': this.health = Math.min(this.health + 50, this.getMaxHealth()); break;
            case 'speed': this.speedBoost = 1.5; this.powerUpEffects.speed = 10000; break;
            case 'damage': this.damageBoost = 2.0; this.powerUpEffects.damage = 8000; break;
            case 'shield': this.shield = this.getMaxShield(); this.powerUpEffects.shield = 15000; break;
            case 'grenade': this.grenadeCount = Math.max(0, Math.floor(this.grenadeCount || 0)) + 1; break;
        }
    }

    getMaxHealth() { return GAME_CONFIG.player.maxHealth + (this.upgrades.health * 20); }
    getDamageMultiplier() { return 1 + (this.upgrades.damage * 0.2); }
    getFireRateMultiplier() { return Math.max(0.45, 1 - (this.upgrades.fireRate * 0.12)); }
    getSpeedMultiplier() { return 1 + (this.upgrades.speed * 0.08); }
    getMaxShield() { return 100 + (this.upgrades.shield * 25); }
    addMoney(amount) { this.money += amount; }

    canBuyUpgrade(type) {
        const config = UPGRADE_CONFIG[type];
        if (!config) return false;
        return this.upgrades[type] < config.maxLevel && this.money >= getUpgradeCost(type, this.upgrades[type], UPGRADE_CONFIG);
    }

    buyUpgrade(type) {
        if (!this.canBuyUpgrade(type)) return false;

        const previousMaxHealth = this.getMaxHealth();
        const previousMaxShield = this.getMaxShield();
        const cost = getUpgradeCost(type, this.upgrades[type], UPGRADE_CONFIG);

        this.money -= cost;
        this.upgrades[type]++;

        if (type === 'grenade') this.grenadeCount = Math.max(0, Math.floor(this.grenadeCount || 0)) + 1;
        if (type === 'health') this.health += this.getMaxHealth() - previousMaxHealth;
        if (type === 'shield' && this.shield > 0) this.shield += this.getMaxShield() - previousMaxShield;

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
        this.reloadState = { active: false, weaponType: null, endsAt: 0, durationMs: 0 };
        this.chargeState = { active: false, weaponType: null, startedAt: 0, endsAt: 0, durationMs: 0 };
        this.grenadeCount = 0;
        this.grenadeCooldownEndsAt = 0;
        this.refillGrenades();
        this.upgrades = { damage: 0, fireRate: 0, health: 0, speed: 0, shield: 0, grenade: 0 };
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

module.exports = { ServerPlayer, initServerPlayerDeps };
