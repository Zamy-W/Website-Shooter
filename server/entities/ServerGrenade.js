'use strict';

const Vector2D = require('./Vector2D');
const { GAME_CONFIG } = require('../config');
const { isPositionBlockedInArena } = require('../upgrades');

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
        if (Math.abs(this.velocity.x) < 6) this.velocity.x = 0;
        if (Math.abs(this.velocity.y) < 6) this.velocity.y = 0;

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

module.exports = ServerGrenade;
