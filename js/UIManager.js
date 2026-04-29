/**
 * Modern UI System with Smooth Animations and Visual Polish
 */

class UIManager {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.elements = new Map();
        this.animations = new Map();
        this.theme = this.createModernTheme();
    }

    createModernTheme() {
        return {
            colors: {
                primary: '#00d4ff',
                secondary: '#ff6b35',
                accent: '#ffd23f',
                background: 'rgba(20, 25, 40, 0.95)',
                backgroundLight: 'rgba(30, 35, 50, 0.9)',
                text: '#ffffff',
                textSecondary: '#a0a0a0',
                success: '#00ff88',
                warning: '#ffaa00',
                danger: '#ff4444',
                border: 'rgba(255, 255, 255, 0.2)'
            },
            fonts: {
                title: '24px "Orbitron", monospace',
                subtitle: '18px "Orbitron", monospace',
                body: '14px "Roboto", sans-serif',
                button: '16px "Orbitron", monospace',
                hud: '12px "Roboto Mono", monospace'
            },
            effects: {
                glow: '0 0 20px',
                shadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
                borderRadius: 8,
                animationDuration: 300
            }
        };
    }

    /**
     * Create animated loading screen
     */
    createLoadingScreen() {
        const loadingScreen = {
            type: 'loading',
            visible: true,
            progress: 0,
            message: 'Loading...',
            particles: []
        };

        // Create loading particles
        for (let i = 0; i < 20; i++) {
            loadingScreen.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                size: Math.random() * 3 + 1,
                alpha: Math.random() * 0.5 + 0.3
            });
        }

        this.elements.set('loadingScreen', loadingScreen);
    }

    /**
     * Update loading progress
     */
    updateLoadingProgress(progress, message) {
        const loadingScreen = this.elements.get('loadingScreen');
        if (loadingScreen) {
            loadingScreen.progress = progress;
            loadingScreen.message = message;
        }
    }

    /**
     * Hide loading screen with animation
     */
    hideLoadingScreen() {
        const loadingScreen = this.elements.get('loadingScreen');
        if (loadingScreen) {
            this.animateOut('loadingScreen', () => {
                this.elements.delete('loadingScreen');
            });
        }
    }

    /**
     * Create modern HUD overlay
     */
    createHUD(playerData) {
        const hud = {
            type: 'hud',
            visible: true,
            health: playerData.health || 100,
            maxHealth: playerData.maxHealth || 100,
            ammo: playerData.ammo || 30,
            maxAmmo: playerData.maxAmmo || 30,
            weapon: playerData.weapon || 'Pistol',
            score: playerData.score || 0,
            kills: playerData.kills || 0,
            matchMode: playerData.matchMode || 'pve',
            matchTimeLeftMs: playerData.matchTimeLeftMs ?? null,
            killLimit: playerData.killLimit ?? null,
            animations: {
                healthPulse: 0,
                ammoPulse: 0,
                scorePop: 0
            }
        };

        this.elements.set('hud', hud);
    }

    /**
     * Update HUD data with animations
     */
    updateHUD(data) {
        const hud = this.elements.get('hud');
        if (!hud) return;

        // Animate health changes
        if (data.health !== undefined && data.health < hud.health) {
            hud.animations.healthPulse = 1;
        }
        
        // Animate ammo changes
        if (data.ammo !== undefined && data.ammo !== hud.ammo) {
            hud.animations.ammoPulse = 1;
        }
        
        // Animate score changes
        if (data.score !== undefined && data.score > hud.score) {
            hud.animations.scorePop = 1;
        }

        // Update values
        Object.assign(hud, data);
    }

    /**
     * Create crosshair with dynamic effects
     */
    createCrosshair() {
        const crosshair = {
            type: 'crosshair',
            visible: true,
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            size: 20,
            spread: 0,
            color: this.theme.colors.primary,
            hitIndicator: 0
        };

        this.elements.set('crosshair', crosshair);
    }

    /**
     * Update crosshair position and effects
     */
    updateCrosshair(x, y, spread = 0) {
        const crosshair = this.elements.get('crosshair');
        if (crosshair) {
            crosshair.x = x;
            crosshair.y = y;
            crosshair.spread = spread;
        }
    }

    /**
     * Trigger hit indicator on crosshair
     */
    triggerHitIndicator() {
        const crosshair = this.elements.get('crosshair');
        if (crosshair) {
            crosshair.hitIndicator = 1;
        }
    }

    /**
     * Create kill feed display
     */
    createKillFeed() {
        const killFeed = {
            type: 'killFeed',
            visible: true,
            kills: [],
            maxEntries: 5
        };

        this.elements.set('killFeed', killFeed);
    }

    /**
     * Add kill to feed
     */
    addKill(killer, victim, weapon) {
        const killFeed = this.elements.get('killFeed');
        if (!killFeed) return;

        const kill = {
            killer,
            victim,
            weapon,
            timestamp: Date.now(),
            alpha: 1
        };

        killFeed.kills.unshift(kill);
        if (killFeed.kills.length > killFeed.maxEntries) {
            killFeed.kills.pop();
        }
    }

    /**
     * Create damage indicator
     */
    createDamageIndicator(x, y, damage, type = 'normal') {
        const indicator = {
            type: 'damageIndicator',
            x: x,
            y: y,
            damage: damage,
            damageType: type,
            life: 60,
            maxLife: 60,
            vx: (Math.random() - 0.5) * 2,
            vy: -3,
            alpha: 1,
            scale: 1
        };

        const id = `damage_${Date.now()}_${Math.random()}`;
        this.elements.set(id, indicator);
    }

    /**
     * Update all UI elements
     */
    update(deltaTime) {
        for (const [id, element] of this.elements) {
            switch (element.type) {
                case 'loading':
                    this.updateLoading(element, deltaTime);
                    break;
                case 'hud':
                    this.updateHUDAnimations(element, deltaTime);
                    break;
                case 'crosshair':
                    this.updateCrosshairElement(element, deltaTime);
                    break;
                case 'killFeed':
                    this.updateKillFeed(element, deltaTime);
                    break;
                case 'damageIndicator':
                    this.updateDamageIndicator(element, deltaTime, id);
                    break;
            }
        }
    }

    updateLoading(element, deltaTime) {
        // Update loading particles
        for (const particle of element.particles) {
            particle.x += particle.vx;
            particle.y += particle.vy;

            // Wrap around screen
            if (particle.x < 0) particle.x = this.canvas.width;
            if (particle.x > this.canvas.width) particle.x = 0;
            if (particle.y < 0) particle.y = this.canvas.height;
            if (particle.y > this.canvas.height) particle.y = 0;
        }
    }

    updateHUDAnimations(element, deltaTime) {
        // Decay animation values
        element.animations.healthPulse *= 0.95;
        element.animations.ammoPulse *= 0.95;
        element.animations.scorePop *= 0.9;
    }

    updateCrosshairElement(element, deltaTime) {
        // Decay hit indicator
        element.hitIndicator *= 0.9;
        // Decay spread
        element.spread *= 0.95;
    }

    updateKillFeed(element, deltaTime) {
        const now = Date.now();
        for (let i = element.kills.length - 1; i >= 0; i--) {
            const kill = element.kills[i];
            const age = now - kill.timestamp;
            
            if (age > 5000) { // Fade after 5 seconds
                kill.alpha -= 0.02;
                if (kill.alpha <= 0) {
                    element.kills.splice(i, 1);
                }
            }
        }
    }

    updateDamageIndicator(element, deltaTime, id) {
        element.life--;
        element.y += element.vy;
        element.x += element.vx;
        element.vy *= 0.98; // Slight deceleration
        
        const progress = 1 - (element.life / element.maxLife);
        element.alpha = 1 - progress;
        element.scale = 1 + progress * 0.5;

        if (element.life <= 0) {
            this.elements.delete(id);
        }
    }

    /**
     * Render all UI elements
     */
    render() {
        for (const [id, element] of this.elements) {
            if (!element.visible) continue;

            switch (element.type) {
                case 'loading':
                    this.renderLoading(element);
                    break;
                case 'hud':
                    this.renderHUD(element);
                    break;
                case 'crosshair':
                    this.renderCrosshair(element);
                    break;
                case 'killFeed':
                    this.renderKillFeed(element);
                    break;
                case 'damageIndicator':
                    this.renderDamageIndicator(element);
                    break;
            }
        }
    }

    renderLoading(element) {
        const ctx = this.ctx;
        
        // Background overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Animated particles
        ctx.fillStyle = this.theme.colors.primary;
        for (const particle of element.particles) {
            ctx.globalAlpha = particle.alpha;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Progress bar
        const barWidth = 400;
        const barHeight = 20;
        const barX = (this.canvas.width - barWidth) / 2;
        const barY = this.canvas.height / 2;

        // Progress bar background
        ctx.fillStyle = this.theme.colors.backgroundLight;
        this.roundRect(ctx, barX, barY, barWidth, barHeight, 10);
        ctx.fill();

        // Progress bar fill
        const fillWidth = (element.progress / 100) * barWidth;
        const gradient = ctx.createLinearGradient(barX, barY, barX + fillWidth, barY);
        gradient.addColorStop(0, this.theme.colors.primary);
        gradient.addColorStop(1, this.theme.colors.accent);
        ctx.fillStyle = gradient;
        this.roundRect(ctx, barX, barY, fillWidth, barHeight, 10);
        ctx.fill();

        // Loading text
        ctx.fillStyle = this.theme.colors.text;
        ctx.font = this.theme.fonts.subtitle;
        ctx.textAlign = 'center';
        ctx.fillText('BATTLE ARENA', this.canvas.width / 2, barY - 50);
        
        ctx.font = this.theme.fonts.body;
        ctx.fillText(element.message, this.canvas.width / 2, barY + 50);
        ctx.fillText(`${Math.round(element.progress)}%`, this.canvas.width / 2, barY + 70);
    }

    renderHUD(element) {
        const ctx = this.ctx;
        
        // Health bar
        this.renderHealthBar(element);
        
        // Ammo display
        this.renderAmmoDisplay(element);
        
        // Weapon display
        this.renderWeaponDisplay(element);
        
        // Score and kills
        this.renderScoreDisplay(element);
    }

    renderHealthBar(element) {
        const ctx = this.ctx;
        const barWidth = 200;
        const barHeight = 20;
        const x = 20;
        const y = this.canvas.height - 60;

        // Health bar background
        ctx.fillStyle = this.theme.colors.backgroundLight;
        this.roundRect(ctx, x, y, barWidth, barHeight, 5);
        ctx.fill();

        // Health bar fill
        const healthPercent = element.health / element.maxHealth;
        const fillWidth = barWidth * healthPercent;
        
        let healthColor = this.theme.colors.success;
        if (healthPercent < 0.3) healthColor = this.theme.colors.danger;
        else if (healthPercent < 0.6) healthColor = this.theme.colors.warning;

        // Add pulse effect for low health or damage
        if (element.animations.healthPulse > 0 || healthPercent < 0.3) {
            const pulse = Math.sin(Date.now() / 100) * 0.3 + 0.7;
            ctx.shadowColor = healthColor;
            ctx.shadowBlur = 10 * pulse;
        }

        ctx.fillStyle = healthColor;
        this.roundRect(ctx, x, y, fillWidth, barHeight, 5);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Health text
        ctx.fillStyle = this.theme.colors.text;
        ctx.font = this.theme.fonts.hud;
        ctx.textAlign = 'left';
        ctx.fillText(`HP: ${element.health}/${element.maxHealth}`, x, y - 5);
    }

    renderAmmoDisplay(element) {
        const ctx = this.ctx;
        const x = this.canvas.width - 120;
        const y = this.canvas.height - 60;

        // Ammo background
        ctx.fillStyle = this.theme.colors.backgroundLight;
        this.roundRect(ctx, x - 20, y - 25, 140, 40, 5);
        ctx.fill();

        // Ammo text with pulse effect
        let ammoColor = this.theme.colors.text;
        if (element.ammo === 0) ammoColor = this.theme.colors.danger;
        else if (element.ammo < element.maxAmmo * 0.3) ammoColor = this.theme.colors.warning;

        if (element.animations.ammoPulse > 0) {
            ctx.shadowColor = ammoColor;
            ctx.shadowBlur = 10;
        }

        ctx.fillStyle = ammoColor;
        ctx.font = this.theme.fonts.button;
        ctx.textAlign = 'right';
        ctx.fillText(`${element.ammo}`, this.canvas.width - 40, y + 5);
        
        ctx.fillStyle = this.theme.colors.textSecondary;
        ctx.font = this.theme.fonts.hud;
        ctx.fillText(`/ ${element.maxAmmo}`, this.canvas.width - 35, y + 5);
        ctx.shadowBlur = 0;
    }

    renderWeaponDisplay(element) {
        const ctx = this.ctx;
        const x = this.canvas.width - 120;
        const y = this.canvas.height - 100;

        ctx.fillStyle = this.theme.colors.text;
        ctx.font = this.theme.fonts.hud;
        ctx.textAlign = 'right';
        ctx.fillText(element.weapon.toUpperCase(), this.canvas.width - 20, y);
    }

    renderScoreDisplay(element) {
        const ctx = this.ctx;
        const x = 20;
        const y = 40;
        const isPvp = element.matchMode === 'pvp_ffa';

        // Score with pop animation
        if (element.animations.scorePop > 0) {
            const scale = 1 + element.animations.scorePop * 0.2;
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(scale, scale);
            ctx.shadowColor = this.theme.colors.accent;
            ctx.shadowBlur = 15;
        }

        ctx.fillStyle = this.theme.colors.text;
        ctx.font = this.theme.fonts.subtitle;
        ctx.textAlign = 'left';
        if (isPvp) {
            const killLimit = Number.isFinite(element.killLimit) && element.killLimit > 0 ? element.killLimit : null;
            const kills = Number.isFinite(element.kills) ? element.kills : 0;
            ctx.fillText(`ELIMS: ${kills}${killLimit ? `/${killLimit}` : ''}`, 0, 0);

            ctx.font = this.theme.fonts.body;
            if (Number.isFinite(element.matchTimeLeftMs)) {
                const totalSeconds = Math.max(0, Math.floor(element.matchTimeLeftMs / 1000));
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;
                const label = `${minutes}:${String(seconds).padStart(2, '0')}`;
                ctx.fillText(`TIME: ${label}`, 0, 25);
            } else {
                ctx.fillText(`SCORE: ${element.score}`, 0, 25);
            }
        } else {
            ctx.fillText(`Score: ${element.score}`, 0, 0);
             
            ctx.font = this.theme.fonts.body;
            ctx.fillText(`Kills: ${element.kills}`, 0, 25);
        }

        if (element.animations.scorePop > 0) {
            ctx.restore();
        }
    }

    renderCrosshair(element) {
        const ctx = this.ctx;
        const size = element.size + element.spread;
        
        // Hit indicator effect
        let color = element.color;
        if (element.hitIndicator > 0) {
            color = this.theme.colors.danger;
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        // Cross lines
        ctx.moveTo(element.x - size, element.y);
        ctx.lineTo(element.x - 5, element.y);
        ctx.moveTo(element.x + 5, element.y);
        ctx.lineTo(element.x + size, element.y);
        ctx.moveTo(element.x, element.y - size);
        ctx.lineTo(element.x, element.y - 5);
        ctx.moveTo(element.x, element.y + 5);
        ctx.lineTo(element.x, element.y + size);
        
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    renderKillFeed(element) {
        const ctx = this.ctx;
        const x = this.canvas.width - 300;
        let y = 100;

        ctx.font = this.theme.fonts.hud;
        ctx.textAlign = 'right';

        for (const kill of element.kills) {
            ctx.globalAlpha = kill.alpha;
            
            // Background
            ctx.fillStyle = this.theme.colors.backgroundLight;
            ctx.fillRect(x - 20, y - 15, 320, 25);
            
            // Text
            ctx.fillStyle = this.theme.colors.text;
            ctx.fillText(`${kill.killer}`, x + 280, y);
            
            ctx.fillStyle = this.theme.colors.textSecondary;
            ctx.fillText(` eliminated `, x + 200, y);
            
            ctx.fillStyle = this.theme.colors.danger;
            ctx.fillText(`${kill.victim}`, x + 120, y);
            
            ctx.fillStyle = this.theme.colors.accent;
            ctx.fillText(`[${kill.weapon}]`, x + 40, y);
            
            y += 30;
        }
        
        ctx.globalAlpha = 1;
    }

    renderDamageIndicator(element) {
        const ctx = this.ctx;
        
        ctx.save();
        ctx.globalAlpha = element.alpha;
        ctx.translate(element.x, element.y);
        ctx.scale(element.scale, element.scale);
        
        let color = this.theme.colors.danger;
        if (element.damageType === 'critical') color = this.theme.colors.warning;
        else if (element.damageType === 'heal') color = this.theme.colors.success;
        
        ctx.fillStyle = color;
        ctx.font = this.theme.fonts.button;
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.strokeText(`-${element.damage}`, 0, 0);
        ctx.fillText(`-${element.damage}`, 0, 0);
        
        ctx.restore();
    }

    /**
     * Helper function to draw rounded rectangles
     */
    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    /**
     * Animate element in/out
     */
    animateIn(elementId, callback) {
        // Implementation for smooth animations
        if (callback) callback();
    }

    animateOut(elementId, callback) {
        // Implementation for smooth animations
        if (callback) callback();
    }
}

// Export for use in other modules
window.UIManager = UIManager;
