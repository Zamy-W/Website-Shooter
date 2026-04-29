/**
 * Modern Sprite Renderer for 2D Game
 * Handles animated sprites, sprite sheets, and cartoon-style character rendering
 */

class SpriteRenderer {
    constructor(assetManager) {
        this.assetManager = assetManager;
        
        // Animation states for different entities
        this.animationStates = {
            player: {
                idle: { frames: 4, fps: 8, loop: true },
                walk: { frames: 6, fps: 12, loop: true },
                run: { frames: 8, fps: 16, loop: true },
                shoot: { frames: 3, fps: 15, loop: false },
                reload: { frames: 6, fps: 10, loop: false },
                hit: { frames: 2, fps: 20, loop: false },
                death: { frames: 5, fps: 8, loop: false }
            },
            enemy: {
                idle: { frames: 4, fps: 6, loop: true },
                walk: { frames: 4, fps: 10, loop: true },
                attack: { frames: 3, fps: 12, loop: false },
                hit: { frames: 2, fps: 15, loop: false },
                death: { frames: 4, fps: 8, loop: false }
            },
            weapon: {
                pistol: { frames: 1, fps: 1, loop: false },
                rifle: { frames: 1, fps: 1, loop: false },
                shotgun: { frames: 1, fps: 1, loop: false },
                muzzleFlash: { frames: 3, fps: 30, loop: false }
            }
        };
        
        // Current animations for entities
        this.activeAnimations = new Map();
        
        // Sprite colors and themes
        this.colorThemes = {
            player1: { primary: '#4a90e2', secondary: '#2c3e50', accent: '#e74c3c' },
            player2: { primary: '#2ecc71', secondary: '#27ae60', accent: '#f39c12' },
            player3: { primary: '#9b59b6', secondary: '#8e44ad', accent: '#e67e22' },
            player4: { primary: '#f39c12', secondary: '#d35400', accent: '#3498db' },
            enemy: { primary: '#e74c3c', secondary: '#c0392b', accent: '#34495e' }
        };
    }

    /**
     * Initialize sprite animations for an entity
     */
    initializeEntity(entityId, entityType, colorTheme = 'player1') {
        this.activeAnimations.set(entityId, {
            type: entityType,
            state: 'idle',
            frame: 0,
            frameTime: 0,
            direction: 1, // 1 for right, -1 for left
            colorTheme: colorTheme,
            scale: 1.0,
            rotation: 0,
            alpha: 1.0,
            effects: {
                flash: 0, // For hit effects
                shake: 0, // For impact effects
                glow: 0   // For power-up effects
            }
        });
    }

    /**
     * Update animation states
     */
    update(deltaTime) {
        for (let [entityId, animation] of this.activeAnimations) {
            const stateConfig = this.animationStates[animation.type]?.[animation.state];
            if (!stateConfig) continue;

            // Update frame timing
            animation.frameTime += deltaTime * 1000;
            const frameInterval = 1000 / stateConfig.fps;

            if (animation.frameTime >= frameInterval) {
                animation.frameTime = 0;
                animation.frame++;

                // Handle frame wrapping
                if (animation.frame >= stateConfig.frames) {
                    if (stateConfig.loop) {
                        animation.frame = 0;
                    } else {
                        animation.frame = stateConfig.frames - 1;
                        // Animation finished, reset to idle if not already
                        if (animation.state !== 'idle') {
                            this.setState(entityId, 'idle');
                        }
                    }
                }
            }

            // Update effects
            animation.effects.flash = Math.max(0, animation.effects.flash - deltaTime * 5);
            animation.effects.shake = Math.max(0, animation.effects.shake - deltaTime * 3);
            animation.effects.glow = Math.max(0, animation.effects.glow - deltaTime * 2);
        }
    }

    /**
     * Set animation state for an entity
     */
    setState(entityId, state) {
        const animation = this.activeAnimations.get(entityId);
        if (!animation) return;

        if (animation.state !== state) {
            animation.state = state;
            animation.frame = 0;
            animation.frameTime = 0;
        }
    }

    /**
     * Set entity direction (facing left or right)
     */
    setDirection(entityId, direction) {
        const animation = this.activeAnimations.get(entityId);
        if (animation) {
            animation.direction = direction;
        }
    }

    /**
     * Add visual effect to entity
     */
    addEffect(entityId, effectType, intensity = 1.0) {
        const animation = this.activeAnimations.get(entityId);
        if (animation && animation.effects[effectType] !== undefined) {
            animation.effects[effectType] = intensity;
        }
    }

    /**
     * Render entity with modern cartoon-style graphics
     */
    renderEntity(ctx, entityId, x, y, width = 32, height = 32) {
        const animation = this.activeAnimations.get(entityId);
        if (!animation) {
            // Fallback to simple colored rectangle
            ctx.fillStyle = '#4a90e2';
            ctx.fillRect(x - width/2, y - height/2, width, height);
            return;
        }

        ctx.save();

        // Apply effects
        if (animation.effects.shake > 0) {
            const shakeX = (Math.random() - 0.5) * animation.effects.shake * 4;
            const shakeY = (Math.random() - 0.5) * animation.effects.shake * 4;
            ctx.translate(shakeX, shakeY);
        }

        // Position and scale
        ctx.translate(x, y);
        ctx.scale(animation.direction * animation.scale, animation.scale);
        ctx.rotate(animation.rotation);
        ctx.globalAlpha = animation.alpha;

        const theme = this.colorThemes[animation.colorTheme] || this.colorThemes.enemy || this.colorThemes.player1;
        const spriteKey = `sprite-${animation.colorTheme}`;
        const sprite = this.assetManager ? this.assetManager.get(spriteKey) : null;

        // Glow effect
        if (animation.effects.glow > 0) {
            ctx.shadowBlur = animation.effects.glow * 20;
            ctx.shadowColor = theme.accent;
        }

        if (sprite) {
            this.renderImageSprite(ctx, sprite, animation, theme, width, height);
        } else {
            // Render based on entity type
            this.renderCartoonSprite(ctx, animation, width, height);
        }

        ctx.restore();
    }

    renderImageSprite(ctx, sprite, animation, theme, width, height) {
        let bobOffset = 0;
        let lean = 0;
        let squashX = 1;
        let squashY = 1;

        if (animation.state === 'walk' || animation.state === 'run') {
            const bobStrength = animation.state === 'run' ? 2.6 : 1.5;
            bobOffset = Math.sin(animation.frame * Math.PI / 2) * bobStrength;
            lean = Math.sin(animation.frame * Math.PI / 2) * (animation.state === 'run' ? 0.06 : 0.03);
        }

        if (animation.state === 'shoot') {
            squashX = 1.04;
            squashY = 0.97;
        }

        ctx.save();
        ctx.globalAlpha *= 0.28;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(0, height * 0.4, width * 0.4, height * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (animation.effects.flash > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(0.5, animation.effects.flash * 0.35);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(0, 0, width * 0.48, height * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.save();
        ctx.translate(0, bobOffset);
        ctx.rotate(lean);
        ctx.scale(squashX, squashY);
        if (animation.effects.glow > 0) {
            ctx.shadowBlur = 12 + animation.effects.glow * 12;
            ctx.shadowColor = theme.accent;
        }

        ctx.drawImage(
            sprite,
            -width / 2,
            -height / 2,
            width,
            height
        );
        ctx.restore();
    }

    /**
     * Render cartoon-style sprite
     */
    renderCartoonSprite(ctx, animation, width, height) {
        const theme = this.colorThemes[animation.colorTheme] || this.colorThemes.enemy || this.colorThemes.player1;
        const halfWidth = width / 2;
        const halfHeight = height / 2;

        // Flash effect
        if (animation.effects.flash > 0) {
            ctx.globalAlpha = Math.min(1, ctx.globalAlpha + animation.effects.flash);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-halfWidth, -halfHeight, width, height);
            ctx.globalAlpha = ctx.globalAlpha - animation.effects.flash;
        }

        if (animation.type === 'player') {
            this.renderPlayer(ctx, animation, theme, width, height);
        } else if (animation.type === 'enemy') {
            this.renderEnemy(ctx, animation, theme, width, height);
        }
    }

    /**
     * Render cartoon-style player
     */
    renderPlayer(ctx, animation, theme, width, height) {
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        
        // Body animation offset based on state
        let bobOffset = 0;
        if (animation.state === 'walk' || animation.state === 'run') {
            bobOffset = Math.sin(animation.frame * Math.PI / 2) * 2;
        }

        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(0, halfHeight * 0.9, width * 0.38, height * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Body (rounded rectangle)
        ctx.fillStyle = '#0b1117';
        ctx.beginPath();
        ctx.roundRect(-halfWidth * 0.62, -halfHeight * 0.42 + bobOffset, width * 0.64, height * 0.64, 5);
        ctx.fill();

        ctx.fillStyle = theme.primary;
        ctx.beginPath();
        ctx.roundRect(-halfWidth * 0.6, -halfHeight * 0.4 + bobOffset, width * 0.6, height * 0.6, 4);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.roundRect(-halfWidth * 0.5, -halfHeight * 0.34 + bobOffset, width * 0.18, height * 0.42, 3);
        ctx.fill();

        // Head (circle)
        ctx.fillStyle = '#0b1117';
        ctx.beginPath();
        ctx.arc(0, -halfHeight * 0.8 + bobOffset, width * 0.28, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = theme.secondary;
        ctx.beginPath();
        ctx.arc(0, -halfHeight * 0.8 + bobOffset, width * 0.25, 0, Math.PI * 2);
        ctx.fill();

        // Visor / faceplate
        ctx.fillStyle = '#dff6ff';
        ctx.beginPath();
        ctx.roundRect(-width * 0.17, -halfHeight * 0.95 + bobOffset, width * 0.34, height * 0.12, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(-width * 0.14, -halfHeight * 0.93 + bobOffset, width * 0.1, 2);

        // Eyes (simple dots)
        ctx.fillStyle = theme.accent;
        ctx.beginPath();
        ctx.arc(-width * 0.08, -halfHeight * 0.89 + bobOffset, 1.5, 0, Math.PI * 2);
        ctx.arc(width * 0.08, -halfHeight * 0.89 + bobOffset, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Arms animation
        if (animation.state === 'shoot') {
            // Extended arm for shooting
            ctx.strokeStyle = theme.primary;
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(halfWidth * 0.5, 0 + bobOffset);
            ctx.lineTo(halfWidth * 1.2, -halfHeight * 0.2 + bobOffset);
            ctx.stroke();
        } else {
            // Normal arms
            ctx.strokeStyle = theme.primary;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-halfWidth * 0.5, 0 + bobOffset);
            ctx.lineTo(-halfWidth * 0.8, halfHeight * 0.3 + bobOffset);
            ctx.moveTo(halfWidth * 0.5, 0 + bobOffset);
            ctx.lineTo(halfWidth * 0.8, halfHeight * 0.3 + bobOffset);
            ctx.stroke();
        }

        // Legs animation
        let legOffset = 0;
        if (animation.state === 'walk') {
            legOffset = Math.sin(animation.frame * Math.PI / 1.5) * 3;
        } else if (animation.state === 'run') {
            legOffset = Math.sin(animation.frame * Math.PI / 2) * 5;
        }

        ctx.strokeStyle = theme.secondary;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        // Left leg
        ctx.moveTo(-halfWidth * 0.2, halfHeight * 0.3);
        ctx.lineTo(-halfWidth * 0.3 + legOffset, halfHeight * 0.9);
        // Right leg  
        ctx.moveTo(halfWidth * 0.2, halfHeight * 0.3);
        ctx.lineTo(halfWidth * 0.3 - legOffset, halfHeight * 0.9);
        ctx.stroke();

        // Accent details (belt, etc.)
        ctx.fillStyle = theme.accent;
        ctx.fillRect(-halfWidth * 0.5, halfHeight * 0.1, width * 0.5, 3);
        ctx.fillRect(-halfWidth * 0.45, -halfHeight * 0.05, width * 0.12, height * 0.16);
    }

    /**
     * Render cartoon-style enemy
     */
    renderEnemy(ctx, animation, theme, width, height) {
        const halfWidth = width / 2;
        const halfHeight = height / 2;

        ctx.save();
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(0, halfHeight * 0.88, width * 0.36, height * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // Make enemies slightly more angular and menacing
        // Body (angular shape)
        ctx.fillStyle = '#12090b';
        ctx.beginPath();
        ctx.moveTo(-halfWidth * 0.66, -halfHeight * 0.2);
        ctx.lineTo(halfWidth * 0.66, -halfHeight * 0.42);
        ctx.lineTo(halfWidth * 0.78, halfHeight * 0.46);
        ctx.lineTo(-halfWidth * 0.78, halfHeight * 0.65);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = theme.primary;
        ctx.beginPath();
        ctx.moveTo(-halfWidth * 0.6, -halfHeight * 0.2);
        ctx.lineTo(halfWidth * 0.6, -halfHeight * 0.4);
        ctx.lineTo(halfWidth * 0.7, halfHeight * 0.4);
        ctx.lineTo(-halfWidth * 0.7, halfHeight * 0.6);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.moveTo(-halfWidth * 0.35, -halfHeight * 0.1);
        ctx.lineTo(halfWidth * 0.18, -halfHeight * 0.22);
        ctx.lineTo(halfWidth * 0.14, halfHeight * 0.18);
        ctx.lineTo(-halfWidth * 0.4, halfHeight * 0.28);
        ctx.closePath();
        ctx.fill();

        // Head (angular)
        ctx.fillStyle = theme.secondary;
        ctx.beginPath();
        ctx.moveTo(-halfWidth * 0.3, -halfHeight * 0.9);
        ctx.lineTo(halfWidth * 0.3, -halfHeight * 0.9);
        ctx.lineTo(halfWidth * 0.4, -halfHeight * 0.4);
        ctx.lineTo(-halfWidth * 0.4, -halfHeight * 0.4);
        ctx.closePath();
        ctx.fill();

        // Glowing red eyes
        ctx.fillStyle = '#ff0000';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#ff0000';
        ctx.beginPath();
        ctx.arc(-width * 0.1, -halfHeight * 0.7, 2, 0, Math.PI * 2);
        ctx.arc(width * 0.1, -halfHeight * 0.7, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Spiky details
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const spikeX = -halfWidth * 0.5 + (i * halfWidth * 0.5);
            ctx.moveTo(spikeX, -halfHeight);
            ctx.lineTo(spikeX, -halfHeight * 1.2);
        }
        ctx.stroke();

        ctx.fillStyle = '#f7f7f7';
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 4 - 2, -halfHeight * 0.32);
            ctx.lineTo(i * 4 + 1, -halfHeight * 0.12);
            ctx.lineTo(i * 4 + 4, -halfHeight * 0.32);
            ctx.closePath();
            ctx.fill();
        }
    }

    /**
     * Render weapon sprite
     */
    renderWeapon(ctx, weaponType, x, y, rotation = 0, muzzleFlash = false, options = {}) {
        const alpha = Number.isFinite(options.alpha) ? options.alpha : 1;
        const scale = Number.isFinite(options.scale) ? options.scale : 1;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.scale(scale, scale);
        ctx.globalAlpha *= alpha;

        const sprite = this.assetManager ? this.assetManager.get(`weapon-${weaponType}`) : null;
        if (sprite) {
            const weaponWidth = weaponType === 'rifle' ? 32 : weaponType === 'shotgun' ? 34 : 24;
            const weaponHeight = weaponType === 'rifle' ? 14 : weaponType === 'shotgun' ? 16 : 12;
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
            ctx.drawImage(sprite, -10, -weaponHeight / 2, weaponWidth, weaponHeight);
            ctx.shadowBlur = 0;
        } else {
        // Weapon colors based on type
            const weaponColors = {
                pistol: { barrel: '#2c3e50', body: '#34495e', accent: '#95a5a6' },
                rifle: { barrel: '#2c3e50', body: '#34495e', accent: '#e74c3c' },
                shotgun: { barrel: '#1a1a1a', body: '#2c3e50', accent: '#f39c12' }
            };

            const colors = weaponColors[weaponType] || weaponColors.pistol;

            if (weaponType === 'pistol') {
                this.renderPistol(ctx, colors);
            } else if (weaponType === 'rifle') {
                this.renderRifle(ctx, colors);
            } else if (weaponType === 'shotgun') {
                this.renderShotgun(ctx, colors);
            }
        }

        // Muzzle flash effect
        if (muzzleFlash) {
            ctx.fillStyle = '#ffff00';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ff6600';
            ctx.beginPath();
            ctx.arc(25, 0, 8 + Math.random() * 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }

    renderPistol(ctx, colors) {
        // Barrel
        ctx.fillStyle = colors.barrel;
        ctx.fillRect(0, -3, 20, 6);
        
        // Body
        ctx.fillStyle = colors.body;
        ctx.fillRect(-10, -6, 15, 12);
        
        // Grip
        ctx.fillRect(-12, 2, 6, 8);
        
        // Trigger guard
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(-6, 4, 3, 0, Math.PI);
        ctx.stroke();
    }

    renderRifle(ctx, colors) {
        // Barrel
        ctx.fillStyle = colors.barrel;
        ctx.fillRect(0, -2, 30, 4);
        
        // Body
        ctx.fillStyle = colors.body;
        ctx.fillRect(-15, -5, 20, 10);
        
        // Stock
        ctx.fillRect(-25, -4, 12, 8);
        
        // Scope (accent)
        ctx.fillStyle = colors.accent;
        ctx.fillRect(5, -8, 15, 3);
    }

    renderShotgun(ctx, colors) {
        // Barrel (wider)
        ctx.fillStyle = colors.barrel;
        ctx.fillRect(0, -4, 25, 8);
        
        // Body
        ctx.fillStyle = colors.body;
        ctx.fillRect(-12, -6, 18, 12);
        
        // Pump action
        ctx.fillStyle = colors.accent;
        ctx.fillRect(-5, -7, 8, 4);
        
        // Stock
        ctx.fillStyle = colors.body;
        ctx.fillRect(-20, -5, 10, 10);
    }

    /**
     * Clean up animations for removed entities
     */
    removeEntity(entityId) {
        this.activeAnimations.delete(entityId);
    }

    /**
     * Get current animation info for debugging
     */
    getAnimationInfo(entityId) {
        return this.activeAnimations.get(entityId);
    }
}

// Helper function for rounded rectangles (if not available)
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
        this.beginPath();
        this.moveTo(x + radius, y);
        this.lineTo(x + width - radius, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.lineTo(x + width, y + height - radius);
        this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.lineTo(x + radius, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.lineTo(x, y - radius);
        this.quadraticCurveTo(x, y, x + radius, y);
        this.closePath();
    };
}
