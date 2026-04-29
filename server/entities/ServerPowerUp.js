'use strict';

const Vector2D = require('./Vector2D');
const { GAME_CONFIG } = require('../config');

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

module.exports = ServerPowerUp;
