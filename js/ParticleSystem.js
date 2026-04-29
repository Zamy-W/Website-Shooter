/**
 * Particle System for Visual Effects
 * Enhanced version with multiple particle types and advanced rendering
 */

class Particle {
    constructor(x, y, config = {}) {
        // Position and movement
        this.x = x;
        this.y = y;
        this.vx = config.vx || (Math.random() - 0.5) * 10;
        this.vy = config.vy || (Math.random() - 0.5) * 10;
        this.gravity = config.gravity || 0;
        this.friction = config.friction || 1;
        this.bounce = config.bounce || 0;

        // Visual properties
        this.size = config.size || Math.random() * 5 + 2;
        this.color = config.color || '#ffffff';
        this.alpha = config.alpha || 1;
        this.fadeRate = config.fadeRate || 0.02;

        // Lifecycle
        this.life = config.life || 60; // frames
        this.maxLife = this.life;
        this.isDead = false;

        // Animation properties
        this.rotation = config.rotation || 0;
        this.rotationSpeed = config.rotationSpeed || 0;
        this.scaleSpeed = config.scaleSpeed || 0;

        // Sprite rendering
        this.sprite = config.sprite || null;
        this.frame = config.frame || 0;
        this.frameRate = config.frameRate || 0;
        this.frameTimer = 0;
        this.groundY = Number.isFinite(config.groundY) ? config.groundY : 580;
        this.shape = config.shape || 'circle';
    }

    update(deltaTime = 1 / 60) {
        if (this.isDead) return;

        const frameScale = deltaTime * 60;

        // Update position
        this.x += this.vx * frameScale;
        this.y += this.vy * frameScale;

        // Apply forces
        this.vy += this.gravity * frameScale;
        this.vx *= Math.pow(this.friction, frameScale);
        this.vy *= Math.pow(this.friction, frameScale);

        // Bounce off bottom (simple ground collision)
        if (this.y > this.groundY && this.bounce > 0) {
            this.vy *= -this.bounce;
            this.y = this.groundY;
        }

        // Update visual properties
        this.rotation += this.rotationSpeed * frameScale;
        this.size += this.scaleSpeed * frameScale;
        this.alpha -= this.fadeRate * frameScale;

        // Update sprite animation
        if (this.sprite && this.frameRate > 0) {
            this.frameTimer += frameScale;
            if (this.frameTimer >= this.frameRate) {
                this.frame++;
                this.frameTimer = 0;
            }
        }

        // Update lifecycle
        this.life -= frameScale;
        if (this.life <= 0 || this.alpha <= 0 || this.size <= 0) {
            this.isDead = true;
        }
    }

    render(ctx) {
        if (this.isDead) return;

        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        if (this.sprite) {
            // Render sprite
            const spriteSize = this.size;
            ctx.drawImage(
                this.sprite,
                -spriteSize / 2,
                -spriteSize / 2,
                spriteSize,
                spriteSize
            );
        } else {
            if (this.shape === 'casing') {
                ctx.fillStyle = '#8b5d0a';
                ctx.fillRect(-this.size * 0.85, -this.size * 0.35, this.size * 1.7, this.size * 0.7);
                ctx.fillStyle = this.color;
                ctx.fillRect(-this.size * 0.55, -this.size * 0.2, this.size * 1.1, this.size * 0.4);
            } else {
                // Render as circle
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(0, 0, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
        this.emitters = new Map();
        this.presets = new Map();
        this.worldGroundY = 580;
        this.setupPresets();
    }

    setupPresets() {
        // Muzzle flash preset
        this.presets.set('muzzleFlash', {
            count: 15,
            life: 20,
            size: 8,
            color: '#ffaa00',
            fadeRate: 0.1,
            spread: Math.PI / 4,
            speed: 12,
            gravity: 0,
            friction: 0.9
        });

        this.presets.set('laserMuzzleFlash', {
            count: 14,
            life: 26,
            size: 9,
            color: '#67c9ff',
            fadeRate: 0.09,
            spread: Math.PI / 7,
            speed: 15,
            gravity: 0,
            friction: 0.92
        });

        // Shell casing preset
        this.presets.set('shellCasing', {
            count: 1,
            life: 120,
            size: 4,
            color: '#ffd700',
            fadeRate: 0.005,
            spread: Math.PI / 8,
            speed: 8,
            gravity: 0.3,
            friction: 0.98,
            bounce: 0.4,
            rotationSpeed: 0.2,
            shape: 'casing'
        });

        // Hit spark preset
        this.presets.set('hitSpark', {
            count: 8,
            life: 25,
            size: 3,
            color: '#ff4444',
            fadeRate: 0.08,
            spread: Math.PI,
            speed: 10,
            gravity: 0.1,
            friction: 0.95
        });

        // Blood splatter preset
        this.presets.set('bloodSplatter', {
            count: 6,
            life: 40,
            size: 5,
            color: '#aa0000',
            fadeRate: 0.025,
            spread: Math.PI / 3,
            speed: 8,
            gravity: 0.2,
            friction: 0.97
        });

        // Explosion preset
        this.presets.set('explosion', {
            count: 25,
            life: 60,
            size: 12,
            color: '#ff6600',
            fadeRate: 0.03,
            spread: Math.PI * 2,
            speed: 15,
            gravity: 0.1,
            friction: 0.95
        });

        // Smoke trail preset
        this.presets.set('smokeTrail', {
            count: 3,
            life: 80,
            size: 6,
            color: '#666666',
            fadeRate: 0.015,
            spread: Math.PI / 6,
            speed: 2,
            gravity: -0.05,
            friction: 0.99,
            scaleSpeed: 0.1
        });
    }

    /**
     * Emit particles using a preset
     */
    emit(x, y, presetName, direction = 0, intensity = 1) {
        const preset = this.presets.get(presetName);
        if (!preset) {
            console.warn(`Particle preset not found: ${presetName}`);
            return;
        }

        const count = Math.floor(preset.count * intensity);
        for (let i = 0; i < count; i++) {
            const angle = direction + (Math.random() - 0.5) * preset.spread;
            const speed = preset.speed * (0.5 + Math.random() * 0.5) * intensity;
            
            const particle = new Particle(x, y, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: preset.size * (0.7 + Math.random() * 0.6),
                color: preset.color,
                life: preset.life * (0.8 + Math.random() * 0.4),
                fadeRate: preset.fadeRate,
                gravity: preset.gravity,
                friction: preset.friction,
                bounce: preset.bounce || 0,
                rotationSpeed: preset.rotationSpeed || 0,
                scaleSpeed: preset.scaleSpeed || 0,
                groundY: preset.groundY ?? this.worldGroundY,
                shape: preset.shape || 'circle'
            });

            this.particles.push(particle);
        }
    }

    /**
     * Create continuous particle emitter
     */
    createEmitter(id, x, y, presetName, options = {}) {
        const emitter = {
            x: x,
            y: y,
            preset: presetName,
            rate: options.rate || 5, // particles per second
            duration: options.duration || -1, // -1 for infinite
            direction: options.direction || 0,
            intensity: options.intensity || 1,
            timer: 0,
            active: true,
            elapsed: 0
        };

        this.emitters.set(id, emitter);
    }

    /**
     * Update emitter position
     */
    updateEmitterPosition(id, x, y) {
        const emitter = this.emitters.get(id);
        if (emitter) {
            emitter.x = x;
            emitter.y = y;
        }
    }

    /**
     * Stop and remove emitter
     */
    removeEmitter(id) {
        this.emitters.delete(id);
    }

    /**
     * Update all particles and emitters
     */
    update(deltaTime) {
        // Update existing particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.update(deltaTime);
            
            if (particle.isDead) {
                this.particles.splice(i, 1);
            }
        }

        // Update emitters
        for (const [id, emitter] of this.emitters) {
            if (!emitter.active) continue;

            const deltaMs = deltaTime * 1000;
            emitter.elapsed += deltaMs;
            emitter.timer += deltaMs;

            // Check if emitter should expire
            if (emitter.duration > 0 && emitter.elapsed >= emitter.duration * 1000) {
                emitter.active = false;
                continue;
            }

            // Emit particles based on rate
            const interval = 1000 / emitter.rate;
            if (emitter.timer >= interval) {
                this.emit(
                    emitter.x,
                    emitter.y,
                    emitter.preset,
                    emitter.direction,
                    emitter.intensity
                );
                emitter.timer = 0;
            }
        }

        // Clean up inactive emitters
        for (const [id, emitter] of this.emitters) {
            if (!emitter.active) {
                this.emitters.delete(id);
            }
        }
    }

    /**
     * Render all particles
     */
    render(ctx) {
        for (const particle of this.particles) {
            particle.render(ctx);
        }
    }

    setWorldGroundY(groundY) {
        if (Number.isFinite(groundY)) {
            this.worldGroundY = groundY;
        }
    }

    /**
     * Clear all particles
     */
    clear() {
        this.particles = [];
        this.emitters.clear();
    }

    /**
     * Get particle count for performance monitoring
     */
    getParticleCount() {
        return this.particles.length;
    }
}

// Export for use in other modules
window.ParticleSystem = ParticleSystem;
