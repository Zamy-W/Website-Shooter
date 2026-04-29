'use strict';

const { v4: uuidv4 } = require('uuid');
const { GAME_CONFIG } = require('./config');
const { clamp, randomInRange, pickRandom } = require('./utils');
const Vector2D = require('./entities/Vector2D');

const UPGRADE_CONFIG = {
    damage:   { baseCost: 100, costScale: 1.55, maxLevel: 5 },
    fireRate: { baseCost: 120, costScale: 1.6,  maxLevel: 5 },
    health:   { baseCost: 90,  costScale: 1.5,  maxLevel: 5 },
    speed:    { baseCost: 85,  costScale: 1.45, maxLevel: 5 },
    shield:   { baseCost: 110, costScale: 1.5,  maxLevel: 4 },
    grenade:  { baseCost: 100, costScale: 1,    maxLevel: 99 }
};

const ARENA_THEMES = [
    {
        id: 'neon-district', prefix: 'Axiom',
        palette: { floorBase: '#101a24', floorAlt: '#152636', floorGlow: 'rgba(44, 209, 255, 0.08)', gridMinor: 'rgba(117, 191, 209, 0.12)', gridMajor: 'rgba(196, 238, 255, 0.08)', boundary: 'rgba(116, 241, 255, 0.34)', wallBase: '#243645', wallTop: '#3f5c72', wallTrim: '#60d7ff', wallShadow: 'rgba(0, 0, 0, 0.28)', hazard: '#ff7a5c', beacon: '#7df9ff', decal: 'rgba(76, 202, 255, 0.12)' }
    },
    {
        id: 'transit-yard', prefix: 'Signal',
        palette: { floorBase: '#131820', floorAlt: '#21242d', floorGlow: 'rgba(255, 202, 87, 0.07)', gridMinor: 'rgba(255, 229, 163, 0.1)', gridMajor: 'rgba(255, 236, 192, 0.08)', boundary: 'rgba(255, 199, 113, 0.34)', wallBase: '#4a4340', wallTop: '#736b64', wallTrim: '#ffd166', wallShadow: 'rgba(0, 0, 0, 0.3)', hazard: '#ff9a3c', beacon: '#ffe082', decal: 'rgba(255, 190, 77, 0.11)' }
    },
    {
        id: 'reactor-foundry', prefix: 'Cinder',
        palette: { floorBase: '#15151d', floorAlt: '#1e2130', floorGlow: 'rgba(224, 105, 255, 0.08)', gridMinor: 'rgba(210, 162, 255, 0.1)', gridMajor: 'rgba(236, 209, 255, 0.08)', boundary: 'rgba(208, 136, 255, 0.34)', wallBase: '#40314f', wallTop: '#705b8a', wallTrim: '#da9cff', wallShadow: 'rgba(0, 0, 0, 0.32)', hazard: '#ff6b6b', beacon: '#f5b8ff', decal: 'rgba(205, 142, 255, 0.11)' }
    }
];

const ARENA_LAYOUTS = [
    { id: 'crossroads', label: 'Crossroads' },
    { id: 'splitter',   label: 'Splitter' },
    { id: 'foundry',    label: 'Foundry' }
];

const BUILT_IN_SKIN_CATALOG = {
    player1: { id: 'player1', label: 'Blue Vanguard',    cost: 0,   description: 'Starter operator frame with balanced colors.' },
    player2: { id: 'player2', label: 'Green Scout',      cost: 200, description: 'Fast recon styling for players who like cleaner silhouettes.' },
    player3: { id: 'player3', label: 'Violet Phantom',   cost: 350, description: 'Sharper contrast palette with a stealthier look.' },
    player4: { id: 'player4', label: 'Amber Breacher',   cost: 500, description: 'Heavy assault finish with warmer armor tones.' }
};

const BUILT_IN_ENEMY_SPRITES = {
    enemy: { id: 'enemy', label: 'Enemy', relativePath: 'sprites/enemy.svg', publicUrl: '/assets/sprites/enemy.svg' }
};

// ── Arena helpers ─────────────────────────────────────────────────────────────

function createArenaObstacle(id, x, y, width, height, options = {}) {
    return { id, x, y, width, height, radius: options.radius ?? Math.max(12, Math.min(width, height) * 0.18), style: options.style || 'wall', accent: options.accent || 'trim', detail: options.detail || 'panel', solid: options.solid !== false };
}

function createArenaDecor(id, type, x, y, width, height, options = {}) {
    return { id, type, x, y, width, height, color: options.color || 'decal', alpha: options.alpha ?? 1, rotation: options.rotation || 0 };
}

function createArenaSpawn(x, y) { return { x, y }; }

function createArenaCandidateGrid(width, height, columns, rows, inset = 180) {
    const points = [];
    const usableWidth = Math.max(1, width - inset * 2);
    const usableHeight = Math.max(1, height - inset * 2);
    for (let col = 0; col < columns; col++) {
        for (let row = 0; row < rows; row++) {
            points.push(createArenaSpawn(inset + (usableWidth * (col + 0.5)) / columns, inset + (usableHeight * (row + 0.5)) / rows));
        }
    }
    return points;
}

function addMirroredCratePair(obstacles, centerX, centerY, dx, dy, size, style = 'crate') {
    obstacles.push(
        createArenaObstacle(uuidv4(), centerX - dx - size / 2, centerY + dy - size / 2, size, size, { style, accent: 'hazard', detail: 'crate' }),
        createArenaObstacle(uuidv4(), centerX + dx - size / 2, centerY + dy - size / 2, size, size, { style, accent: 'hazard', detail: 'crate' })
    );
}

function buildArenaLayout(layoutId, theme, width, height) {
    const centerX = width / 2;
    const centerY = height / 2;
    const obstacles = [];
    const decor = [];
    const basePlayerSpawns = [
        createArenaSpawn(170, 170), createArenaSpawn(width - 170, 170),
        createArenaSpawn(170, height - 170), createArenaSpawn(width - 170, height - 170),
        createArenaSpawn(width / 2, 170), createArenaSpawn(width / 2, height - 170),
        createArenaSpawn(170, height / 2), createArenaSpawn(width - 170, height / 2)
    ];
    const enemySpawns = [
        createArenaSpawn(width * 0.18, -30), createArenaSpawn(width * 0.5, -30), createArenaSpawn(width * 0.82, -30),
        createArenaSpawn(width + 30, height * 0.22), createArenaSpawn(width + 30, height * 0.5), createArenaSpawn(width + 30, height * 0.78),
        createArenaSpawn(width * 0.18, height + 30), createArenaSpawn(width * 0.5, height + 30), createArenaSpawn(width * 0.82, height + 30),
        createArenaSpawn(-30, height * 0.22), createArenaSpawn(-30, height * 0.5), createArenaSpawn(-30, height * 0.78)
    ];
    const powerUpSpawns = [];
    const namePrefix = theme.prefix || 'Arena';

    if (layoutId === 'crossroads') {
        obstacles.push(
            createArenaObstacle(uuidv4(), centerX - 160, centerY - 120, 320, 240, { style: 'hub', accent: 'trim', detail: 'core' }),
            createArenaObstacle(uuidv4(), 250, centerY - 130, 110, 260, { style: 'cover', accent: 'beacon' }),
            createArenaObstacle(uuidv4(), width - 360, centerY - 130, 110, 260, { style: 'cover', accent: 'beacon' }),
            createArenaObstacle(uuidv4(), 540, 260, 170, 96, { style: 'cover', accent: 'hazard' }),
            createArenaObstacle(uuidv4(), width - 710, 260, 170, 96, { style: 'cover', accent: 'hazard' }),
            createArenaObstacle(uuidv4(), 540, height - 356, 170, 96, { style: 'cover', accent: 'hazard' }),
            createArenaObstacle(uuidv4(), width - 710, height - 356, 170, 96, { style: 'cover', accent: 'hazard' })
        );
        addMirroredCratePair(obstacles, centerX, centerY, 430, -315, 84);
        addMirroredCratePair(obstacles, centerX, centerY, 430, 315, 84);
        decor.push(
            createArenaDecor(uuidv4(), 'stripe', centerX - 26, 80, 52, height - 160, { color: 'hazard', alpha: 0.72 }),
            createArenaDecor(uuidv4(), 'stripe', 120, centerY - 24, width - 240, 48, { color: 'decal', alpha: 0.72 })
        );
        powerUpSpawns.push(createArenaSpawn(centerX, 220), createArenaSpawn(centerX, height - 220), createArenaSpawn(430, centerY), createArenaSpawn(width - 430, centerY));
        return { name: `${namePrefix} Crossroads`, obstacles, decor, playerSpawns: basePlayerSpawns, enemySpawns, powerUpSpawns };
    }

    if (layoutId === 'splitter') {
        obstacles.push(
            createArenaObstacle(uuidv4(), 430, 210, 170, 410, { style: 'pillar', accent: 'trim' }),
            createArenaObstacle(uuidv4(), width - 600, 210, 170, 410, { style: 'pillar', accent: 'trim' }),
            createArenaObstacle(uuidv4(), 430, height - 620, 170, 410, { style: 'pillar', accent: 'trim' }),
            createArenaObstacle(uuidv4(), width - 600, height - 620, 170, 410, { style: 'pillar', accent: 'trim' }),
            createArenaObstacle(uuidv4(), centerX - 120, centerY - 250, 240, 94, { style: 'cover', accent: 'hazard' }),
            createArenaObstacle(uuidv4(), centerX - 120, centerY + 156, 240, 94, { style: 'cover', accent: 'hazard' }),
            createArenaObstacle(uuidv4(), centerX - 86, centerY - 56, 172, 112, { style: 'hub', accent: 'beacon', detail: 'panel' })
        );
        addMirroredCratePair(obstacles, centerX, centerY, 320, -180, 82);
        addMirroredCratePair(obstacles, centerX, centerY, 320, 180, 82);
        decor.push(
            createArenaDecor(uuidv4(), 'stripe', 150, centerY - 18, width - 300, 36, { color: 'hazard', alpha: 0.7 }),
            createArenaDecor(uuidv4(), 'stripe', centerX - 18, 120, 36, height - 240, { color: 'decal', alpha: 0.8 })
        );
        powerUpSpawns.push(createArenaSpawn(centerX, 185), createArenaSpawn(centerX, height - 185), createArenaSpawn(centerX - 340, centerY), createArenaSpawn(centerX + 340, centerY));
        return { name: `${namePrefix} Splitter`, obstacles, decor, playerSpawns: basePlayerSpawns, enemySpawns, powerUpSpawns };
    }

    // foundry (default)
    obstacles.push(
        createArenaObstacle(uuidv4(), 280, 290, 300, 180, { style: 'hub', accent: 'trim', detail: 'core' }),
        createArenaObstacle(uuidv4(), width - 580, height - 470, 300, 180, { style: 'hub', accent: 'trim', detail: 'core' }),
        createArenaObstacle(uuidv4(), width - 600, 250, 240, 110, { style: 'cover', accent: 'hazard' }),
        createArenaObstacle(uuidv4(), 360, height - 360, 240, 110, { style: 'cover', accent: 'hazard' }),
        createArenaObstacle(uuidv4(), centerX - 80, centerY - 300, 160, 120, { style: 'pillar', accent: 'beacon' }),
        createArenaObstacle(uuidv4(), centerX - 80, centerY + 180, 160, 120, { style: 'pillar', accent: 'beacon' }),
        createArenaObstacle(uuidv4(), centerX - 220, centerY - 45, 140, 90, { style: 'cover', accent: 'trim' }),
        createArenaObstacle(uuidv4(), centerX + 80, centerY - 45, 140, 90, { style: 'cover', accent: 'trim' })
    );
    addMirroredCratePair(obstacles, centerX, centerY, 500, -40, 84);
    addMirroredCratePair(obstacles, centerX, centerY, 150, 360, 76);
    decor.push(
        createArenaDecor(uuidv4(), 'stripe', 180, 180, width - 360, 26, { color: 'decal', alpha: 0.65 }),
        createArenaDecor(uuidv4(), 'stripe', 180, height - 206, width - 360, 26, { color: 'decal', alpha: 0.65 }),
        createArenaDecor(uuidv4(), 'stripe', centerX - 18, 140, 36, height - 280, { color: 'hazard', alpha: 0.5 })
    );
    powerUpSpawns.push(createArenaSpawn(centerX, centerY), createArenaSpawn(300, height - 210), createArenaSpawn(width - 300, 210), createArenaSpawn(centerX, height * 0.28), createArenaSpawn(centerX, height * 0.72));
    return { name: `${namePrefix} Foundry`, obstacles, decor, playerSpawns: basePlayerSpawns, enemySpawns, powerUpSpawns };
}

function addAmbientArenaDecor(arena) {
    createArenaCandidateGrid(arena.width, arena.height, 5, 3, 210).slice(0, 10).forEach((point, index) => {
        arena.decor.push(createArenaDecor(uuidv4(), index % 2 === 0 ? 'beacon' : 'vent', point.x - 16, point.y - 16, 32, 32, { color: index % 2 === 0 ? 'beacon' : 'decal', alpha: index % 2 === 0 ? 0.85 : 0.5 }));
    });
}

function generateArenaDefinition() {
    const theme = pickRandom(ARENA_THEMES) || ARENA_THEMES[0];
    const layout = pickRandom(ARENA_LAYOUTS) || ARENA_LAYOUTS[0];
    const { width, height } = GAME_CONFIG.canvas;
    const layoutData = buildArenaLayout(layout.id, theme, width, height);
    const arena = { id: uuidv4(), themeId: theme.id, layoutId: layout.id, name: layoutData.name, width, height, palette: { ...theme.palette }, obstacles: layoutData.obstacles, decor: layoutData.decor, playerSpawns: layoutData.playerSpawns, enemySpawns: layoutData.enemySpawns, powerUpSpawns: layoutData.powerUpSpawns };
    addAmbientArenaDecor(arena);
    return arena;
}

function serializeArena(arena) {
    if (!arena) return null;
    return {
        id: arena.id, name: arena.name, themeId: arena.themeId, layoutId: arena.layoutId,
        width: arena.width, height: arena.height, palette: arena.palette,
        obstacles: arena.obstacles.map((o) => ({ id: o.id, x: o.x, y: o.y, width: o.width, height: o.height, radius: o.radius, style: o.style, accent: o.accent, detail: o.detail })),
        decor: arena.decor.map((d) => ({ id: d.id, type: d.type, x: d.x, y: d.y, width: d.width, height: d.height, color: d.color, alpha: d.alpha, rotation: d.rotation }))
    };
}

function isCircleCollidingWithObstacle(position, radius, obstacle) {
    if (!obstacle?.solid) return false;
    const closestX = clamp(position.x, obstacle.x, obstacle.x + obstacle.width);
    const closestY = clamp(position.y, obstacle.y, obstacle.y + obstacle.height);
    const dx = position.x - closestX;
    const dy = position.y - closestY;
    return (dx * dx) + (dy * dy) < radius * radius;
}

function isPositionBlockedInArena(arena, position, radius, options = {}) {
    if (!arena) return false;
    const margin = options.margin || 0;
    if (position.x < radius + margin || position.x > arena.width - radius - margin) return true;
    if (position.y < radius + margin || position.y > arena.height - radius - margin) return true;
    return arena.obstacles.some((obstacle) => {
        if (options.ignoreObstacleId && obstacle.id === options.ignoreObstacleId) return false;
        return isCircleCollidingWithObstacle(position, radius + margin, obstacle);
    });
}

function findOpenArenaPoint(arena, preferredPoints, radius, maxAttempts = 24) {
    if (Array.isArray(preferredPoints)) {
        for (const point of preferredPoints) {
            const candidate = { x: point.x, y: point.y };
            if (!isPositionBlockedInArena(arena, candidate, radius, { margin: 8 })) return candidate;
        }
    }
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = { x: randomInRange(radius + 60, arena.width - radius - 60), y: randomInRange(radius + 60, arena.height - radius - 60) };
        if (!isPositionBlockedInArena(arena, candidate, radius, { margin: 18 })) return candidate;
    }
    return { x: arena.width / 2, y: arena.height / 2 };
}

function createArenaSpawn(x, y) {
    return { x, y };
}

function resolveArenaMovement(arena, currentPosition, desiredPosition, radius) {
    if (!arena) {
        return new Vector2D(
            clamp(desiredPosition.x, radius, GAME_CONFIG.canvas.width - radius),
            clamp(desiredPosition.y, radius, GAME_CONFIG.canvas.height - radius)
        );
    }

    let resolved = new Vector2D(currentPosition.x, currentPosition.y);
    const targetX = clamp(desiredPosition.x, radius, arena.width - radius);
    const targetY = clamp(desiredPosition.y, radius, arena.height - radius);

    const horizontal = new Vector2D(targetX, resolved.y);
    if (!isPositionBlockedInArena(arena, horizontal, radius)) {
        resolved = horizontal;
    }

    const vertical = new Vector2D(resolved.x, targetY);
    if (!isPositionBlockedInArena(arena, vertical, radius)) {
        resolved = vertical;
    }

    if (!isPositionBlockedInArena(arena, new Vector2D(targetX, targetY), radius)) {
        resolved = new Vector2D(targetX, targetY);
    }

    return resolved;
}

function getObstacleAvoidanceVector(position, radius, arena) {
    if (!arena) return new Vector2D(0, 0);

    let avoidance = new Vector2D(0, 0);
    let influencingObstacles = 0;

    for (const obstacle of arena.obstacles) {
        const closestX = clamp(position.x, obstacle.x, obstacle.x + obstacle.width);
        const closestY = clamp(position.y, obstacle.y, obstacle.y + obstacle.height);
        const fromObstacle = position.subtract(new Vector2D(closestX, closestY));
        const distance = fromObstacle.length();
        const influenceRadius = radius + 110;

        if (distance > 0 && distance < influenceRadius) {
            const strength = (influenceRadius - distance) / influenceRadius;
            avoidance = avoidance.add(fromObstacle.normalize().multiply(strength));
            influencingObstacles++;
        }
    }

    if (influencingObstacles === 0 || avoidance.length() === 0) return new Vector2D(0, 0);
    return avoidance.normalize();
}

module.exports = {
    UPGRADE_CONFIG,
    ARENA_THEMES,
    ARENA_LAYOUTS,
    BUILT_IN_SKIN_CATALOG,
    BUILT_IN_ENEMY_SPRITES,
    generateArenaDefinition,
    serializeArena,
    isCircleCollidingWithObstacle,
    isPositionBlockedInArena,
    findOpenArenaPoint,
    createArenaSpawn,
    resolveArenaMovement,
    getObstacleAvoidanceVector
};
