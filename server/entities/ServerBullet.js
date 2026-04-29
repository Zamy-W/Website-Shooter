'use strict';

const Vector2D = require('./Vector2D');
const { GAME_CONFIG } = require('../config');
const { WEAPON_CONFIG, DEFAULT_WEAPON_ID, getSafeWeaponType, getWeaponConfig } = require('../weapons');

class ServerBullet {
    constructor(id, x, y, velX, velY, ownerId, damage, range, weaponType = DEFAULT_WEAPON_ID, options = {}) {
        this.id = id;
        this.position = new Vector2D(x, y);
        this.startPosition = new Vector2D(x, y);
        this.velocity = new Vector2D(velX, velY);
        this.ownerId = ownerId;
        this.damage = Number.isFinite(damage) ? damage : GAME_CONFIG.bullet.damage;
        this.lifetime = GAME_CONFIG.bullet.lifetime;
        this.range = range || 300;
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

module.exports = ServerBullet;
