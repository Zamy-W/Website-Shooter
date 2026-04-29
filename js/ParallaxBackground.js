/**
 * Parallax Background System for 2D Game
 * Creates depth with multiple scrolling layers at different speeds
 */

class ParallaxBackground {
    constructor(canvas, cameraSystem) {
        this.canvas = canvas;
        this.cameraSystem = cameraSystem;
        this.ctx = canvas.getContext('2d');
        this.themePalette = {
            skyTop: '#1a1a2e',
            skyMid: '#16213e',
            skyBottom: '#0f3460',
            stars: '#ffffff',
            clouds: 'rgba(52, 73, 94, 0.4)',
            mountains: '#2c3e50',
            buildings: '#34495e',
            windows: '#ffeb3b',
            ground: '#27ae60'
        };
        
        // Background layers with different scroll speeds
        this.layers = [
            {
                name: 'sky',
                scrollSpeed: 0, // Fixed background
                color: '#1a1a2e',
                gradient: true,
                elements: []
            },
            {
                name: 'stars',
                scrollSpeed: 0.02,
                color: '#ffffff',
                elements: this.generateStars(100)
            },
            {
                name: 'clouds',
                scrollSpeed: 0.1,
                color: '#34495e',
                elements: this.generateClouds(8)
            },
            {
                name: 'mountains',
                scrollSpeed: 0.3,
                color: '#2c3e50',
                elements: this.generateMountains(6)
            },
            {
                name: 'buildings',
                scrollSpeed: 0.6,
                color: '#34495e',
                elements: this.generateBuildings(12)
            },
            {
                name: 'ground',
                scrollSpeed: 1.0, // Moves with camera
                color: '#27ae60',
                elements: this.generateGroundElements(20)
            }
        ];
        
        // Layer offsets for seamless tiling
        this.layerOffsets = new Map();
        this.layers.forEach(layer => {
            this.layerOffsets.set(layer.name, { x: 0, y: 0 });
        });
        
        // Performance optimization
        this.lastCameraX = 0;
        this.lastCameraY = 0;
        this.needsRedraw = true;
    }

    /**
     * Generate star field
     */
    generateStars(count) {
        const stars = [];
        for (let i = 0; i < count; i++) {
            stars.push({
                x: Math.random() * 2000,
                y: Math.random() * 1000,
                size: Math.random() * 2 + 1,
                brightness: Math.random() * 0.8 + 0.2,
                twinkle: Math.random() * Math.PI * 2
            });
        }
        return stars;
    }

    /**
     * Generate cloud formations
     */
    generateClouds(count) {
        const clouds = [];
        for (let i = 0; i < count; i++) {
            clouds.push({
                x: Math.random() * 2500,
                y: Math.random() * 300 + 50,
                width: Math.random() * 150 + 100,
                height: Math.random() * 60 + 40,
                opacity: Math.random() * 0.3 + 0.1,
                segments: Math.floor(Math.random() * 3) + 3
            });
        }
        return clouds;
    }

    /**
     * Generate mountain silhouettes
     */
    generateMountains(count) {
        const mountains = [];
        const segmentWidth = 2500 / count;
        
        for (let i = 0; i < count; i++) {
            const peaks = [];
            const peakCount = Math.floor(Math.random() * 3) + 2;
            
            for (let p = 0; p < peakCount; p++) {
                peaks.push({
                    x: (segmentWidth * p / peakCount) + Math.random() * 50,
                    height: Math.random() * 200 + 150
                });
            }
            
            mountains.push({
                x: i * segmentWidth,
                peaks: peaks,
                baseHeight: 100,
                opacity: Math.random() * 0.3 + 0.2
            });
        }
        return mountains;
    }

    /**
     * Generate building silhouettes
     */
    generateBuildings(count) {
        const buildings = [];
        const segmentWidth = 2000 / count;
        
        for (let i = 0; i < count; i++) {
            const width = Math.random() * 80 + 40;
            const height = Math.random() * 300 + 100;
            buildings.push({
                x: i * segmentWidth + Math.random() * 50,
                width,
                height,
                windows: Math.floor(Math.random() * 8) + 3,
                windowPattern: this.generateWindowPattern(width, height),
                opacity: Math.random() * 0.4 + 0.2,
                color: `hsl(${Math.random() * 60 + 200}, 30%, ${Math.random() * 20 + 15}%)`
            });
        }
        return buildings;
    }

    generateWindowPattern(width, height) {
        const windowSpacing = 12;
        const windowsPerRow = Math.max(1, Math.floor(width / windowSpacing));
        const windowRows = Math.max(1, Math.floor(height / windowSpacing));
        const pattern = [];

        for (let row = 0; row < windowRows; row++) {
            const rowPattern = [];
            for (let col = 0; col < windowsPerRow; col++) {
                rowPattern.push(Math.random() > 0.3);
            }
            pattern.push(rowPattern);
        }

        return pattern;
    }

    /**
     * Generate ground elements (trees, rocks, etc.)
     */
    generateGroundElements(count) {
        const elements = [];
        for (let i = 0; i < count; i++) {
            const type = Math.random() < 0.6 ? 'tree' : 'rock';
            elements.push({
                x: Math.random() * 2000,
                y: Math.random() * 100 + 500, // Ground level
                type: type,
                size: Math.random() * 30 + 20,
                color: type === 'tree' ? '#27ae60' : '#95a5a6',
                variation: Math.random()
            });
        }
        return elements;
    }

    /**
     * Update parallax layers based on camera position
     */
    update(deltaTime) {
        const cameraX = this.cameraSystem.x;
        const cameraY = this.cameraSystem.y;
        
        // Check if camera moved significantly
        const cameraMoved = Math.abs(cameraX - this.lastCameraX) > 1 || 
                          Math.abs(cameraY - this.lastCameraY) > 1;
        
        if (cameraMoved) {
            this.needsRedraw = true;
            this.lastCameraX = cameraX;
            this.lastCameraY = cameraY;
            
            // Update layer offsets based on camera movement and scroll speed
            this.layers.forEach(layer => {
                const offset = this.layerOffsets.get(layer.name);
                offset.x = cameraX * layer.scrollSpeed;
                offset.y = cameraY * layer.scrollSpeed * 0.5; // Reduce vertical parallax
            });
        }

        // Update animated elements
        this.updateAnimatedElements(deltaTime);
    }

    /**
     * Update animated background elements
     */
    updateAnimatedElements(deltaTime) {
        // Update star twinkling
        const starLayer = this.layers.find(l => l.name === 'stars');
        if (starLayer) {
            starLayer.elements.forEach(star => {
                star.twinkle += deltaTime * 2;
            });
        }
    }

    /**
     * Render all parallax layers
     */
    render(ctx) {
        ctx.save();
        
        // Always render background - don't use needsRedraw check for now
        // Render layers from back to front
        this.layers.forEach(layer => {
            this.renderLayer(ctx, layer);
        });
        
        ctx.restore();
    }

    /**
     * Render individual parallax layer
     */
    renderLayer(ctx, layer) {
        const offset = this.layerOffsets.get(layer.name);
        
        ctx.save();
        
        // Apply parallax offset - use modulo for seamless tiling
        const offsetX = -offset.x % (this.canvas.width * 2);
        const offsetY = -offset.y % (this.canvas.height * 2);
        ctx.translate(offsetX, offsetY);
        
        switch (layer.name) {
            case 'sky':
                this.renderSky(ctx, layer);
                break;
            case 'stars':
                this.renderStars(ctx, layer);
                break;
            case 'clouds':
                this.renderClouds(ctx, layer);
                break;
            case 'mountains':
                this.renderMountains(ctx, layer);
                break;
            case 'buildings':
                this.renderBuildings(ctx, layer);
                break;
            case 'ground':
                this.renderGroundElements(ctx, layer);
                break;
        }
        
        ctx.restore();
    }

    /**
     * Render gradient sky
     */
    renderSky(ctx, layer) {
        const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, this.themePalette.skyTop);
        gradient.addColorStop(0.5, this.themePalette.skyMid);
        gradient.addColorStop(1, this.themePalette.skyBottom);
        
        ctx.fillStyle = gradient;
        // Render sky covering the entire visible area
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Render twinkling stars
     */
    renderStars(ctx, layer) {
        ctx.fillStyle = this.themePalette.stars;
        ctx.globalAlpha = 0.8;
        
        layer.elements.forEach(star => {
            const twinkle = Math.sin(star.twinkle) * 0.3 + 0.7;
            ctx.globalAlpha = star.brightness * twinkle * 0.8;
            
            // Map star position to screen coordinates with parallax offset
            const screenX = (star.x % this.canvas.width);
            const screenY = (star.y % this.canvas.height);
            
            ctx.beginPath();
            ctx.arc(screenX, screenY, star.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    /**
     * Render fluffy clouds
     */
    renderClouds(ctx, layer) {
        ctx.fillStyle = this.themePalette.clouds;
        
        layer.elements.forEach(cloud => {
            ctx.globalAlpha = Math.max(0.3, cloud.opacity);
            
            // Map cloud position to screen space
            const screenX = (cloud.x % (this.canvas.width * 2));
            const screenY = (cloud.y % (this.canvas.height / 2));
            
            // Draw cloud as connected circles
            for (let i = 0; i < cloud.segments; i++) {
                const segmentX = screenX + (cloud.width / cloud.segments) * i;
                const segmentY = screenY + Math.sin(i) * 10;
                const radius = cloud.height / 2 + Math.sin(i * 2) * 10;
                
                ctx.beginPath();
                ctx.arc(segmentX, segmentY, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        ctx.globalAlpha = 1;
    }

    /**
     * Render mountain silhouettes
     */
    renderMountains(ctx, layer) {
        layer.elements.forEach(mountain => {
            ctx.globalAlpha = mountain.opacity;
            ctx.fillStyle = this.themePalette.mountains;
            
            ctx.beginPath();
            ctx.moveTo(mountain.x, this.canvas.height);
            
            // Draw mountain peaks
            mountain.peaks.forEach((peak, index) => {
                ctx.lineTo(mountain.x + peak.x, this.canvas.height - peak.height);
            });
            
            ctx.lineTo(mountain.x + 300, this.canvas.height);
            ctx.closePath();
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    /**
     * Render building silhouettes
     */
    renderBuildings(ctx, layer) {
        layer.elements.forEach(building => {
            ctx.globalAlpha = building.opacity;
            ctx.fillStyle = building.color || this.themePalette.buildings;
            
            // Building body
            ctx.fillRect(
                building.x, 
                this.canvas.height - building.height,
                building.width, 
                building.height
            );
            
            // Building windows
            ctx.fillStyle = this.themePalette.windows;
            ctx.globalAlpha = 0.3;
            
            const windowSize = 6;
            const windowSpacing = 12;
            const windowsPerRow = Math.floor(building.width / windowSpacing);
            const windowRows = Math.floor(building.height / windowSpacing);
            
            for (let row = 0; row < windowRows; row++) {
                for (let col = 0; col < windowsPerRow; col++) {
                    if (building.windowPattern?.[row]?.[col]) {
                        const windowX = building.x + col * windowSpacing + 3;
                        const windowY = this.canvas.height - building.height + row * windowSpacing + 3;
                        ctx.fillRect(windowX, windowY, windowSize, windowSize);
                    }
                }
            }
        });
        ctx.globalAlpha = 1;
    }

    /**
     * Render ground elements
     */
    renderGroundElements(ctx, layer) {
        layer.elements.forEach(element => {
            ctx.fillStyle = element.color || this.themePalette.ground;
            
            if (element.type === 'tree') {
                // Simple tree shape
                const trunkWidth = element.size / 6;
                const trunkHeight = element.size / 2;
                const crownRadius = element.size / 2;
                
                // Trunk
                ctx.fillStyle = '#8b4513';
                ctx.fillRect(
                    element.x - trunkWidth/2, 
                    element.y - trunkHeight, 
                    trunkWidth, 
                    trunkHeight
                );
                
                // Crown
                ctx.fillStyle = element.color;
                ctx.beginPath();
                ctx.arc(element.x, element.y - trunkHeight, crownRadius, 0, Math.PI * 2);
                ctx.fill();
                
            } else if (element.type === 'rock') {
                // Simple rock shape
                ctx.beginPath();
                ctx.ellipse(
                    element.x, 
                    element.y, 
                    element.size / 2, 
                    element.size / 3, 
                    element.variation * Math.PI, 
                    0, 
                    Math.PI * 2
                );
                ctx.fill();
            }
        });
    }

    /**
     * Force a redraw on next render
     */
    forceRedraw() {
        this.needsRedraw = true;
    }

    /**
     * Get layer by name for external modifications
     */
    getLayer(name) {
        return this.layers.find(layer => layer.name === name);
    }

    setTheme(themeId, palette = {}) {
        const accent = palette.wallTrim || palette.beacon || '#7df9ff';
        this.themePalette = {
            skyTop: palette.floorBase || '#1a1a2e',
            skyMid: palette.floorAlt || '#16213e',
            skyBottom: '#09111b',
            stars: palette.beacon || '#ffffff',
            clouds: 'rgba(32, 48, 64, 0.35)',
            mountains: palette.wallBase || '#2c3e50',
            buildings: palette.wallTop || '#34495e',
            windows: accent,
            ground: palette.decal || '#27ae60'
        };
        const mountainsLayer = this.getLayer('mountains');
        if (mountainsLayer) {
            mountainsLayer.color = this.themePalette.mountains;
        }
        const buildingsLayer = this.getLayer('buildings');
        if (buildingsLayer) {
            buildingsLayer.color = this.themePalette.buildings;
            buildingsLayer.elements.forEach((building, index) => {
                building.color = index % 2 === 0 ? this.themePalette.buildings : (palette.wallBase || this.themePalette.mountains);
            });
        }
        this.needsRedraw = true;
    }
}
