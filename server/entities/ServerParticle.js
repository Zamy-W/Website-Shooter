'use strict';

const Vector2D = require('./Vector2D');

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

module.exports = ServerParticle;
