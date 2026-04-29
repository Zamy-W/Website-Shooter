/**
 * Advanced Camera System for 2D Games
 * Provides smooth following, screen shake, zoom controls, and cinematic effects
 */

class CameraSystem {
    constructor(canvas, worldWidth = 2000, worldHeight = 2000) {
        this.canvas = canvas;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        
        // Camera position and target
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
        this.targetY = 0;
        
        // Camera properties
        this.zoom = 1.0;
        this.targetZoom = 1.0;
        this.minZoom = 0.5;
        this.maxZoom = 3.0;
        
        // Following behavior
        this.followTarget = null;
        this.followSmoothing = 0.1;
        this.followDeadzone = { width: 100, height: 80 };
        this.lookAhead = { x: 0, y: 0, strength: 150 };
        
        // Screen shake
        this.shake = {
            intensity: 0,
            duration: 0,
            elapsed: 0,
            x: 0,
            y: 0,
            frequency: 30
        };
        
        // Camera bounds
        this.bounds = {
            enabled: true,
            left: 0,
            right: worldWidth,
            top: 0,
            bottom: worldHeight
        };
        
        // Cinematic effects
        this.cinematics = {
            active: false,
            type: 'none', // 'pan', 'zoom', 'shake', 'follow'
            duration: 0,
            elapsed: 0,
            startPos: { x: 0, y: 0 },
            endPos: { x: 0, y: 0 },
            startZoom: 1,
            endZoom: 1,
            easing: 'ease-in-out',
            onComplete: null
        };
        
        // Movement prediction
        this.prediction = {
            enabled: true,
            strength: 0.3,
            velocity: { x: 0, y: 0 },
            lastPos: { x: 0, y: 0 }
        };
        
        // Performance optimization
        this.lastUpdateTime = 0;
        this.updateRate = 16; // ~60fps
    }

    /**
     * Set the target to follow
     */
    setFollowTarget(target) {
        this.followTarget = target;
        if (target) {
            this.targetX = target.x - this.canvas.width / (2 * this.zoom);
            this.targetY = target.y - this.canvas.height / (2 * this.zoom);
        }
    }

    /**
     * Update camera position and effects
     */
    update(deltaTime) {
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateRate) return;
        this.lastUpdateTime = now;

        // Update cinematic effects first
        this.updateCinematics(deltaTime);
        
        // Update following behavior
        if (this.followTarget && !this.cinematics.active) {
            this.updateFollowing(deltaTime);
        }
        
        // Update screen shake
        this.updateScreenShake(deltaTime);
        
        // Update zoom
        this.updateZoom(deltaTime);
        
        // Apply camera bounds
        this.applyBounds();
        
        // Update movement prediction
        this.updatePrediction(deltaTime);
    }

    updateFollowing(deltaTime) {
        if (!this.followTarget) return;

        // Calculate target position with look-ahead
        let targetX = this.followTarget.x - this.canvas.width / (2 * this.zoom);
        let targetY = this.followTarget.y - this.canvas.height / (2 * this.zoom);
        
        // Add look-ahead based on movement
        if (this.prediction.enabled) {
            targetX += this.prediction.velocity.x * this.lookAhead.strength * this.prediction.strength;
            targetY += this.prediction.velocity.y * this.lookAhead.strength * this.prediction.strength;
        }
        
        // Apply deadzone
        const deadzoneLeft = this.x + (this.canvas.width / (2 * this.zoom)) - this.followDeadzone.width / 2;
        const deadzoneRight = this.x + (this.canvas.width / (2 * this.zoom)) + this.followDeadzone.width / 2;
        const deadzoneTop = this.y + (this.canvas.height / (2 * this.zoom)) - this.followDeadzone.height / 2;
        const deadzoneBottom = this.y + (this.canvas.height / (2 * this.zoom)) + this.followDeadzone.height / 2;
        
        // Only move camera if target is outside deadzone
        if (this.followTarget.x < deadzoneLeft) {
            this.targetX = targetX;
        } else if (this.followTarget.x > deadzoneRight) {
            this.targetX = targetX;
        }
        
        if (this.followTarget.y < deadzoneTop) {
            this.targetY = targetY;
        } else if (this.followTarget.y > deadzoneBottom) {
            this.targetY = targetY;
        }
        
        // Smooth following
        const smoothing = 1 - Math.pow(1 - this.followSmoothing, deltaTime * 60);
        this.x += (this.targetX - this.x) * smoothing;
        this.y += (this.targetY - this.y) * smoothing;
    }

    updateScreenShake(deltaTime) {
        if (this.shake.intensity <= 0) return;
        
        this.shake.elapsed += deltaTime * 1000;
        
        if (this.shake.elapsed >= this.shake.duration) {
            // Shake finished
            this.shake.intensity = 0;
            this.shake.x = 0;
            this.shake.y = 0;
            return;
        }
        
        // Calculate shake based on frequency and intensity
        const progress = this.shake.elapsed / this.shake.duration;
        const fadeOut = 1 - progress; // Fade out over time
        const currentIntensity = this.shake.intensity * fadeOut;
        
        // Generate shake offset
        const time = this.shake.elapsed / 1000 * this.shake.frequency;
        this.shake.x = Math.sin(time) * currentIntensity * (0.5 + Math.random() * 0.5);
        this.shake.y = Math.cos(time * 1.3) * currentIntensity * (0.5 + Math.random() * 0.5);
    }

    updateZoom(deltaTime) {
        if (Math.abs(this.zoom - this.targetZoom) < 0.01) return;
        
        // Smooth zoom transition
        const zoomSpeed = 5.0;
        const smoothing = 1 - Math.pow(1 - zoomSpeed * deltaTime, 1);
        this.zoom += (this.targetZoom - this.zoom) * smoothing;
        
        // Clamp zoom
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
    }

    updatePrediction(deltaTime) {
        if (!this.followTarget || !this.prediction.enabled) return;
        
        // Calculate velocity for movement prediction
        const dx = this.followTarget.x - this.prediction.lastPos.x;
        const dy = this.followTarget.y - this.prediction.lastPos.y;
        
        this.prediction.velocity.x = dx / deltaTime;
        this.prediction.velocity.y = dy / deltaTime;
        
        // Smooth velocity for better prediction
        this.prediction.velocity.x *= 0.8;
        this.prediction.velocity.y *= 0.8;
        
        this.prediction.lastPos.x = this.followTarget.x;
        this.prediction.lastPos.y = this.followTarget.y;
    }

    updateCinematics(deltaTime) {
        if (!this.cinematics.active) return;
        
        this.cinematics.elapsed += deltaTime * 1000;
        const progress = Math.min(this.cinematics.elapsed / this.cinematics.duration, 1);
        const easedProgress = this.easeValue(progress, this.cinematics.easing);
        
        switch (this.cinematics.type) {
            case 'pan':
                this.x = this.lerp(this.cinematics.startPos.x, this.cinematics.endPos.x, easedProgress);
                this.y = this.lerp(this.cinematics.startPos.y, this.cinematics.endPos.y, easedProgress);
                break;
            case 'zoom':
                this.zoom = this.lerp(this.cinematics.startZoom, this.cinematics.endZoom, easedProgress);
                break;
            case 'shake':
                this.startScreenShake(this.cinematics.intensity, this.cinematics.duration);
                break;
        }
        
        if (progress >= 1) {
            this.cinematics.active = false;
            if (this.cinematics.onComplete) {
                this.cinematics.onComplete();
            }
        }
    }

    applyBounds() {
        if (!this.bounds.enabled) return;
        
        const viewWidth = this.canvas.width / this.zoom;
        const viewHeight = this.canvas.height / this.zoom;
        
        // Clamp camera position to world bounds
        this.x = Math.max(this.bounds.left, Math.min(this.bounds.right - viewWidth, this.x));
        this.y = Math.max(this.bounds.top, Math.min(this.bounds.bottom - viewHeight, this.y));
    }

    /**
     * Apply camera transform to canvas context
     */
    applyTransform(ctx) {
        ctx.save();
        
        // Apply zoom (scale from center)
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        ctx.translate(centerX, centerY);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-centerX, -centerY);
        
        // Apply camera position and shake
        ctx.translate(-(this.x + this.shake.x), -(this.y + this.shake.y));
    }

    /**
     * Remove camera transform
     */
    resetTransform(ctx) {
        ctx.restore();
    }

    /**
     * Start screen shake effect
     */
    startScreenShake(intensity, duration = 500) {
        this.shake.intensity = Math.max(this.shake.intensity, intensity);
        this.shake.duration = duration;
        this.shake.elapsed = 0;
    }

    /**
     * Set camera zoom with optional animation
     */
    setZoom(zoom, animate = true) {
        zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
        
        if (animate) {
            this.targetZoom = zoom;
        } else {
            this.zoom = zoom;
            this.targetZoom = zoom;
        }
    }

    /**
     * Start cinematic camera movement
     */
    startCinematic(type, options = {}) {
        this.cinematics.active = true;
        this.cinematics.type = type;
        this.cinematics.duration = options.duration || 2000;
        this.cinematics.elapsed = 0;
        this.cinematics.easing = options.easing || 'ease-in-out';
        this.cinematics.onComplete = options.onComplete || null;
        
        switch (type) {
            case 'pan':
                this.cinematics.startPos = { x: this.x, y: this.y };
                this.cinematics.endPos = { x: options.targetX || 0, y: options.targetY || 0 };
                break;
            case 'zoom':
                this.cinematics.startZoom = this.zoom;
                this.cinematics.endZoom = options.targetZoom || 1;
                break;
            case 'shake':
                this.cinematics.intensity = options.intensity || 10;
                break;
        }
    }

    /**
     * Convert screen coordinates to world coordinates
     */
    screenToWorld(screenX, screenY) {
        const worldX = (screenX - this.canvas.width / 2) / this.zoom + this.canvas.width / 2 / this.zoom + this.x;
        const worldY = (screenY - this.canvas.height / 2) / this.zoom + this.canvas.height / 2 / this.zoom + this.y;
        return { x: worldX, y: worldY };
    }

    /**
     * Convert world coordinates to screen coordinates
     */
    worldToScreen(worldX, worldY) {
        const screenX = (worldX - this.x) * this.zoom;
        const screenY = (worldY - this.y) * this.zoom;
        return { x: screenX, y: screenY };
    }

    /**
     * Check if a point is visible on screen
     */
    isVisible(worldX, worldY, margin = 0) {
        const viewLeft = this.x - margin;
        const viewRight = this.x + this.canvas.width / this.zoom + margin;
        const viewTop = this.y - margin;
        const viewBottom = this.y + this.canvas.height / this.zoom + margin;
        
        return worldX >= viewLeft && worldX <= viewRight && worldY >= viewTop && worldY <= viewBottom;
    }

    /**
     * Utility functions
     */
    lerp(start, end, t) {
        return start + (end - start) * t;
    }

    easeValue(t, type) {
        switch (type) {
            case 'ease-in':
                return t * t;
            case 'ease-out':
                return 1 - Math.pow(1 - t, 2);
            case 'ease-in-out':
                return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            case 'linear':
            default:
                return t;
        }
    }

    /**
     * Set camera bounds
     */
    setBounds(left, top, right, bottom) {
        this.bounds = {
            enabled: true,
            left: left,
            top: top,
            right: right,
            bottom: bottom
        };
    }

    /**
     * Disable camera bounds
     */
    removeBounds() {
        this.bounds.enabled = false;
    }

    /**
     * Get current camera viewport
     */
    getViewport() {
        return {
            x: this.x,
            y: this.y,
            width: this.canvas.width / this.zoom,
            height: this.canvas.height / this.zoom
        };
    }
}

// Export for use in other modules
window.CameraSystem = CameraSystem;