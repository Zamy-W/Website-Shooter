/**
 * Modern Asset Management System
 * Handles loading, caching, and management of sprites, animations, and audio
 */

class AssetManager {
    constructor() {
        this.assets = new Map();
        this.loadedAssets = new Map();
        this.loadingQueue = [];
        this.isLoading = false;
        this.onProgress = null;
        this.onComplete = null;
        this.totalAssets = 0;
        this.loadedCount = 0;
    }

    /**
     * Add an asset to the loading queue
     * @param {string} name - Asset identifier
     * @param {string} src - Asset source path
     * @param {string} type - Asset type ('image', 'audio', 'json')
     */
    addAsset(name, src, type = 'image') {
        if (!this.assets.has(name)) {
            this.assets.set(name, { name, src, type, loaded: false });
            this.totalAssets++;
        }
    }

    /**
     * Load all queued assets
     * @param {Function} onProgress - Progress callback (loaded, total)
     * @param {Function} onComplete - Completion callback
     */
    async loadAll(onProgress = null, onComplete = null) {
        this.onProgress = onProgress;
        this.onComplete = onComplete;
        this.isLoading = true;
        this.loadedCount = 0;

        const promises = [];
        for (const [name, asset] of this.assets) {
            if (!asset.loaded) {
                promises.push(this.loadAsset(asset));
            }
        }

        try {
            await Promise.all(promises);
            this.isLoading = false;
            if (this.onComplete) this.onComplete();
        } catch (error) {
            console.error('Asset loading failed:', error);
            this.isLoading = false;
        }
    }

    /**
     * Load individual asset
     * @param {Object} asset - Asset configuration
     */
    async loadAsset(asset) {
        return new Promise((resolve, reject) => {
            switch (asset.type) {
                case 'image':
                    this.loadImage(asset, resolve, reject);
                    break;
                case 'audio':
                    this.loadAudio(asset, resolve, reject);
                    break;
                case 'json':
                    this.loadJSON(asset, resolve, reject);
                    break;
                default:
                    reject(new Error(`Unknown asset type: ${asset.type}`));
            }
        });
    }

    /**
     * Load image asset
     */
    loadImage(asset, resolve, reject) {
        const img = new Image();
        img.onload = () => {
            this.loadedAssets.set(asset.name, img);
            asset.loaded = true;
            this.loadedCount++;
            if (this.onProgress) this.onProgress(this.loadedCount, this.totalAssets);
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load image: ${asset.src}`));
        img.src = asset.src;
    }

    /**
     * Load audio asset
     */
    loadAudio(asset, resolve, reject) {
        const audio = new Audio();
        audio.oncanplaythrough = () => {
            this.loadedAssets.set(asset.name, audio);
            asset.loaded = true;
            this.loadedCount++;
            if (this.onProgress) this.onProgress(this.loadedCount, this.totalAssets);
            resolve(audio);
        };
        audio.onerror = () => reject(new Error(`Failed to load audio: ${asset.src}`));
        audio.src = asset.src;
    }

    /**
     * Load JSON asset
     */
    async loadJSON(asset, resolve, reject) {
        try {
            const response = await fetch(asset.src);
            const data = await response.json();
            this.loadedAssets.set(asset.name, data);
            asset.loaded = true;
            this.loadedCount++;
            if (this.onProgress) this.onProgress(this.loadedCount, this.totalAssets);
            resolve(data);
        } catch (error) {
            reject(new Error(`Failed to load JSON: ${asset.src}`));
        }
    }

    /**
     * Get loaded asset
     * @param {string} name - Asset name
     * @returns {*} Loaded asset or null
     */
    get(name) {
        return this.loadedAssets.get(name) || null;
    }

    /**
     * Check if asset is loaded
     * @param {string} name - Asset name
     * @returns {boolean}
     */
    isLoaded(name) {
        return this.loadedAssets.has(name);
    }

    /**
     * Get loading progress
     * @returns {{loaded: number, total: number, percentage: number}}
     */
    getProgress() {
        return {
            loaded: this.loadedCount,
            total: this.totalAssets,
            percentage: this.totalAssets > 0 ? (this.loadedCount / this.totalAssets) * 100 : 0
        };
    }
}

/**
 * Animation System for Sprite Sheets
 */
class AnimationManager {
    constructor() {
        this.animations = new Map();
        this.currentAnimations = new Map();
    }

    /**
     * Register a new animation from sprite sheet
     * @param {string} name - Animation name
     * @param {Object} config - Animation configuration
     */
    addAnimation(name, config) {
        const animation = {
            spriteSheet: config.spriteSheet,
            frameWidth: config.frameWidth,
            frameHeight: config.frameHeight,
            frames: config.frames || [],
            frameRate: config.frameRate || 10,
            loop: config.loop !== false,
            onComplete: config.onComplete || null
        };
        
        this.animations.set(name, animation);
    }

    /**
     * Create animation instance for an entity
     * @param {string} entityId - Entity identifier
     * @param {string} animationName - Animation to play
     * @returns {Object} Animation instance
     */
    createInstance(entityId, animationName) {
        const animation = this.animations.get(animationName);
        if (!animation) {
            console.warn(`Animation not found: ${animationName}`);
            return null;
        }

        const instance = {
            animation: animation,
            currentFrame: 0,
            frameTimer: 0,
            isPlaying: true,
            isPaused: false,
            hasCompleted: false
        };

        this.currentAnimations.set(entityId, instance);
        return instance;
    }

    /**
     * Update animation instances
     * @param {number} deltaTime - Time since last update
     */
    update(deltaTime) {
        for (const [entityId, instance] of this.currentAnimations) {
            if (!instance.isPlaying || instance.isPaused) continue;

            instance.frameTimer += deltaTime;
            const frameDuration = 1000 / instance.animation.frameRate;

            if (instance.frameTimer >= frameDuration) {
                instance.frameTimer = 0;
                instance.currentFrame++;

                if (instance.currentFrame >= instance.animation.frames.length) {
                    if (instance.animation.loop) {
                        instance.currentFrame = 0;
                    } else {
                        instance.currentFrame = instance.animation.frames.length - 1;
                        instance.isPlaying = false;
                        instance.hasCompleted = true;
                        if (instance.animation.onComplete) {
                            instance.animation.onComplete(entityId);
                        }
                    }
                }
            }
        }
    }

    /**
     * Render animation frame
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {string} entityId - Entity ID
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} scale - Scale factor
     */
    render(ctx, entityId, x, y, scale = 1) {
        const instance = this.currentAnimations.get(entityId);
        if (!instance) return;

        const animation = instance.animation;
        const frameIndex = animation.frames[instance.currentFrame];
        
        // Calculate source rectangle on sprite sheet
        const cols = Math.floor(animation.spriteSheet.width / animation.frameWidth);
        const srcX = (frameIndex % cols) * animation.frameWidth;
        const srcY = Math.floor(frameIndex / cols) * animation.frameHeight;

        // Render the frame
        ctx.drawImage(
            animation.spriteSheet,
            srcX, srcY,
            animation.frameWidth, animation.frameHeight,
            x - (animation.frameWidth * scale) / 2,
            y - (animation.frameHeight * scale) / 2,
            animation.frameWidth * scale,
            animation.frameHeight * scale
        );
    }

    /**
     * Play animation
     * @param {string} entityId - Entity ID
     * @param {string} animationName - Animation to play
     * @param {boolean} restart - Restart if already playing
     */
    play(entityId, animationName, restart = false) {
        const existing = this.currentAnimations.get(entityId);
        if (existing && existing.animation === this.animations.get(animationName) && !restart) {
            existing.isPaused = false;
            return;
        }

        this.createInstance(entityId, animationName);
    }

    /**
     * Stop animation
     * @param {string} entityId - Entity ID
     */
    stop(entityId) {
        const instance = this.currentAnimations.get(entityId);
        if (instance) {
            instance.isPlaying = false;
            instance.currentFrame = 0;
        }
    }

    /**
     * Pause animation
     * @param {string} entityId - Entity ID
     */
    pause(entityId) {
        const instance = this.currentAnimations.get(entityId);
        if (instance) {
            instance.isPaused = true;
        }
    }
}

// Export for use in other modules
window.AssetManager = AssetManager;
window.AnimationManager = AnimationManager;