// Game configuration
const GAME_CONFIG = {
    canvas: {
        width: 1800,
        height: 1200
    },
    player: {
        speed: 200,
        size: 15,
        health: 100,
        maxHealth: 100
    },
    bullet: {
        speed: 400,
        size: 3,
        damage: 25,
        lifetime: 3000 // 3 seconds
    },
    grenade: {
        maxCount: 2,
        cooldown: 2200,
        fuse: 1200,
        speed: 560,
        minThrowScale: 0.35,
        maxThrowScale: 1.1,
        chargeTimeMs: 900,
        size: 7,
        damage: 220,
        radius: 135,
        bounce: 0.42,
        friction: 0.975
    },
    enemy: {
        speed: 80,
        size: 12,
        health: 50,
        maxHealth: 50,
        spawnRate: 3000,
        damage: 20,
        speedIncrease: 15, // Speed increase per wave
        healthIncrease: 25, // Health increase per wave
        spawnRateDecrease: 200 // Spawn rate decrease per wave (faster spawning)
    },
    powerup: {
        spawnRate: 8000, // 8 seconds
        lifetime: 15000, // 15 seconds before despawn
        size: 8
    },
    particles: {
        bloodLifetime: 1000, // 1 second
        muzzleLifetime: 150, // 0.15 seconds
        maxParticles: 200
    },
    maxPlayersPerRoom: 4,
    tickRate: 60 // Server updates per second
};

const ROOM_MODES = {
    PVE: 'pve',
    PVP_FFA: 'pvp_ffa'
};

const PVP_CONFIG = {
    killLimit: 30,
    timeLimitMs: 10 * 60 * 1000,
    respawnDelayMs: 2400
};

const BOSS_WAVE_INTERVAL = 5;

const ENEMY_ARCHETYPES = {
    grunt: {
        id: 'grunt',
        label: 'Grunt',
        healthMultiplier: 1,
        speedMultiplier: 1,
        contactDamageMultiplier: 1,
        size: 12,
        attackMode: 'melee',
        rewardScore: 100,
        rewardMoneyMultiplier: 1,
        accentColor: '#ff8b78',
        minimapColor: '#ff8b78',
        renderScale: 2.3,
        minWave: 1
    },
    scout: {
        id: 'scout',
        label: 'Scout',
        healthMultiplier: 0.72,
        speedMultiplier: 1.65,
        contactDamageMultiplier: 0.72,
        size: 10,
        attackMode: 'melee',
        rewardScore: 90,
        rewardMoneyMultiplier: 0.95,
        accentColor: '#70f0ff',
        minimapColor: '#70f0ff',
        renderScale: 2.05,
        minWave: 2
    },
    brute: {
        id: 'brute',
        label: 'Brute',
        healthMultiplier: 2.8,
        speedMultiplier: 0.74,
        contactDamageMultiplier: 1.85,
        size: 18,
        attackMode: 'melee',
        rewardScore: 180,
        rewardMoneyMultiplier: 1.6,
        accentColor: '#ffb36b',
        minimapColor: '#ffb36b',
        renderScale: 2.55,
        minWave: 3
    },
    marksman: {
        id: 'marksman',
        label: 'Marksman',
        healthMultiplier: 1.18,
        speedMultiplier: 0.94,
        contactDamageMultiplier: 0.65,
        size: 12,
        attackMode: 'ranged',
        attackRange: 430,
        preferredRange: 250,
        attackCooldown: 1450,
        projectileSpeed: 560,
        projectileDamage: 16,
        projectileSize: 4,
        projectileColor: '#ff7ab6',
        projectileImpactColor: '#ffd4e6',
        rewardScore: 145,
        rewardMoneyMultiplier: 1.3,
        accentColor: '#ff7ab6',
        minimapColor: '#ff7ab6',
        renderScale: 2.25,
        minWave: 4
    },
    boss: {
        id: 'boss',
        label: 'Overseer',
        healthMultiplier: 9,
        speedMultiplier: 0.95,
        contactDamageMultiplier: 2.4,
        size: 28,
        attackMode: 'ranged',
        attackRange: 560,
        preferredRange: 300,
        attackCooldown: 1180,
        projectileSpeed: 680,
        projectileDamage: 22,
        projectileSize: 5,
        projectileColor: '#ffd166',
        projectileImpactColor: '#fff0c4',
        rewardScore: 800,
        rewardMoneyMultiplier: 4.25,
        accentColor: '#ffd166',
        minimapColor: '#ffd166',
        renderScale: 2.95,
        minWave: 5,
        isBoss: true,
        rangedBurstCount: 3,
        rangedBurstSpread: 0.2
    }
};

function getEnemyArchetype(enemyType = 'grunt') {
    return ENEMY_ARCHETYPES[enemyType] || ENEMY_ARCHETYPES.grunt;
}

function getBaseWaveEnemyCount(wave, playerCount = 1) {
    const safeWave = Math.max(1, Number(wave) || 1);
    const safePlayers = Math.max(1, Math.round(Number(playerCount) || 1));
    return Math.min(5 + Math.max(0, safeWave - 1) * 3 + Math.max(0, safePlayers - 1), 32);
}

function summarizeEnemyQueue(queue = []) {
    const counts = new Map();
    queue.forEach((enemyType) => {
        counts.set(enemyType, (counts.get(enemyType) || 0) + 1);
    });

    return Array.from(counts.entries()).map(([enemyType, count]) => ({
        type: enemyType,
        label: getEnemyArchetype(enemyType).label,
        count
    }));
}

function buildWaveSpawnProfile(wave, playerCount = 1) {
    const safeWave = Math.max(1, Math.round(Number(wave) || 1));
    const safePlayers = Math.max(1, Math.round(Number(playerCount) || 1));
    const bossWave = safeWave % BOSS_WAVE_INTERVAL === 0;

    if (bossWave) {
        const escorts = [];
        const escortCount = Math.min(8, 2 + safePlayers + Math.floor(safeWave / 6));

        for (let i = 0; i < escortCount; i++) {
            if (safeWave >= 10 && i % 4 === 3) {
                escorts.push('marksman');
            } else if (safeWave >= 7 && i % 3 === 2) {
                escorts.push('brute');
            } else if (safeWave >= 6 && i % 2 === 1) {
                escorts.push('scout');
            } else {
                escorts.push('grunt');
            }
        }

        const queue = ['boss', ...escorts.sort(() => Math.random() - 0.5)];
        return {
            bossWave: true,
            label: `Boss Wave ${safeWave}`,
            bossType: 'boss',
            queue,
            summary: summarizeEnemyQueue(queue)
        };
    }

    const totalEnemies = getBaseWaveEnemyCount(safeWave, safePlayers);
    const queue = [];
    let brutes = safeWave >= 3 ? Math.min(1 + Math.floor((safeWave - 3) / 3), Math.floor(totalEnemies * 0.2)) : 0;
    let marksmen = safeWave >= 4 ? Math.min(1 + Math.floor((safeWave - 4) / 3), Math.floor(totalEnemies * 0.18)) : 0;
    let scouts = safeWave >= 2 ? Math.min(1 + Math.floor((safeWave - 2) / 2), Math.floor(totalEnemies * 0.28)) : 0;

    const specialCount = brutes + marksmen + scouts;
    if (specialCount > totalEnemies) {
        const overflow = specialCount - totalEnemies;
        scouts = Math.max(0, scouts - overflow);
    }

    for (let i = 0; i < brutes; i++) queue.push('brute');
    for (let i = 0; i < marksmen; i++) queue.push('marksman');
    for (let i = 0; i < scouts; i++) queue.push('scout');
    while (queue.length < totalEnemies) {
        queue.push('grunt');
    }

    const shuffledQueue = queue.sort(() => Math.random() - 0.5);
    return {
        bossWave: false,
        label: `Wave ${safeWave}`,
        bossType: null,
        queue: shuffledQueue,
        summary: summarizeEnemyQueue(shuffledQueue)
    };
}

module.exports = {
    GAME_CONFIG,
    ROOM_MODES,
    PVP_CONFIG,
    BOSS_WAVE_INTERVAL,
    ENEMY_ARCHETYPES,
    getEnemyArchetype,
    getBaseWaveEnemyCount,
    summarizeEnemyQueue,
    buildWaveSpawnProfile
};
