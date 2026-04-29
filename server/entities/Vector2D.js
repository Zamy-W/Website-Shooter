'use strict';

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

module.exports = Vector2D;
