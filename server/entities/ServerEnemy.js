'use strict';

const Vector2D = require('./Vector2D');
const { GAME_CONFIG } = require('../config');
const { getEnemyArchetype } = require('../config');
const { resolveArenaMovement, getObstacleAvoidanceVector } = require('../upgrades');

// Injected by entry point to avoid circular deps
let _getGameAssetCatalog;

function initServerEnemyDeps(deps) {
    _getGameAssetCatalog = deps.getGameAssetCatalog;
}

class ServerEnemy {
    constructor(id, x, y, wave = 1, spriteTheme = null, enemyType = 'grunt') {
        const archetype = getEnemyArchetype(enemyType);
        const baseHealth = GAME_CONFIG.enemy.health;
        const baseSpeed = GAME_CONFIG.enemy.speed;
        const waveHealth = baseHealth + (wave - 1) * GAME_CONFIG.enemy.healthIncrease;
        const waveSpeed = baseSpeed + (wave - 1) * GAME_CONFIG.enemy.speedIncrease;

        this.id = id;
        this.position = new Vector2D(x, y);
        this.velocity = new Vector2D(0, 0);
        this.type = archetype.id;
        this.label = archetype.label;
        this.attackMode = archetype.attackMode || 'melee';
        this.isBoss = Boolean(archetype.isBoss);
        this.size = archetype.size || GAME_CONFIG.enemy.size;
        this.renderSize = Math.max(28, Math.round(this.size * (archetype.renderScale || 2.25)));
        this.accentColor = archetype.accentColor || '#ff8b78';
        this.minimapColor = archetype.minimapColor || this.accentColor;
        this.rewardScore = archetype.rewardScore || 100;
        this.rewardMoney = Math.round((30 + wave * 5) * (archetype.rewardMoneyMultiplier || 1));
        this.contactDamage = GAME_CONFIG.enemy.damage * (archetype.contactDamageMultiplier || 1);
        this.attackRange = archetype.attackRange || 0;
        this.preferredRange = archetype.preferredRange || 0;
        this.attackCooldown = archetype.attackCooldown || 0;
        this.projectileSpeed = archetype.projectileSpeed || 0;
        this.projectileDamage = archetype.projectileDamage || 0;
        this.projectileSize = archetype.projectileSize || 4;
        this.projectileColor = archetype.projectileColor || '#ff7ab6';
        this.projectileImpactColor = archetype.projectileImpactColor || this.projectileColor;
        this.rangedBurstCount = archetype.rangedBurstCount || 1;
        this.rangedBurstSpread = archetype.rangedBurstSpread || 0;
        this.lastAttackTime = 0;
        this.strafeDirection = Math.random() < 0.5 ? -1 : 1;
        this.targetDistance = Infinity;
        this.health = Math.round(waveHealth * (archetype.healthMultiplier || 1));
        this.maxHealth = this.health;
        this.speed = waveSpeed * (archetype.speedMultiplier || 1);
        this.angle = 0;
        this.targetPlayerId = null;
        this.wave = wave;
        this.spriteTheme = spriteTheme || _getGameAssetCatalog().defaultEnemySpriteId;
    }

    update(deltaTime, players, arena = null) {
        let nearestPlayer = null;
        let nearestDistance = Infinity;

        for (const player of players.values()) {
            if (player.alive) {
                const distance = this.position.distance(player.position);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestPlayer = player;
                }
            }
        }

        if (nearestPlayer) {
            this.targetPlayerId = nearestPlayer.id;
            const targetDirection = nearestPlayer.position.subtract(this.position).normalize();
            this.targetDistance = nearestDistance;
            const avoidance = getObstacleAvoidanceVector(this.position, this.size, arena);
            let steering = targetDirection.add(avoidance.multiply(0.9));

            if (this.attackMode === 'ranged' && this.preferredRange > 0) {
                if (nearestDistance < this.preferredRange * 0.72) {
                    steering = targetDirection.multiply(-1).add(avoidance.multiply(1.2));
                } else if (nearestDistance > this.preferredRange * 1.08) {
                    steering = targetDirection.add(avoidance.multiply(0.85));
                } else {
                    const strafe = new Vector2D(-targetDirection.y * this.strafeDirection, targetDirection.x * this.strafeDirection);
                    steering = strafe.add(avoidance.multiply(0.55));
                }
                this.angle = Math.atan2(targetDirection.y, targetDirection.x);
            } else {
                this.angle = Math.atan2(targetDirection.y, targetDirection.x);
            }

            const movementDirection = steering.length() > 0.01 ? steering.normalize() : new Vector2D(0, 0);
            this.velocity = movementDirection.multiply(this.speed);
        } else {
            this.velocity = new Vector2D(0, 0);
            this.targetPlayerId = null;
            this.targetDistance = Infinity;
        }

        const desiredPosition = this.position.add(this.velocity.multiply(deltaTime));
        this.position = resolveArenaMovement(arena, this.position, desiredPosition, this.size);
    }

    getAttackActions(players, now = Date.now()) {
        if (this.attackMode !== 'ranged' || !this.attackCooldown || !this.attackRange) return [];

        const targetPlayer = this.targetPlayerId ? players.get(this.targetPlayerId) : null;
        if (!targetPlayer || !targetPlayer.alive) return [];

        const toTarget = targetPlayer.position.subtract(this.position);
        const distance = toTarget.length();
        if (distance <= this.size + GAME_CONFIG.player.size || distance > this.attackRange) return [];
        if (now - this.lastAttackTime < this.attackCooldown) return [];

        this.lastAttackTime = now;

        const aimDirection = distance > 0.001
            ? toTarget.normalize()
            : new Vector2D(Math.cos(this.angle), Math.sin(this.angle));
        const aimAngle = Math.atan2(aimDirection.y, aimDirection.x);
        const burstCount = Math.max(1, this.rangedBurstCount);
        const spread = this.rangedBurstSpread || 0;
        const shots = [];

        for (let index = 0; index < burstCount; index++) {
            const burstOffset = burstCount === 1 ? 0 : index - ((burstCount - 1) / 2);
            const burstAngle = aimAngle + burstOffset * spread;
            shots.push({
                direction: new Vector2D(Math.cos(burstAngle), Math.sin(burstAngle)),
                damage: this.projectileDamage,
                speed: this.projectileSpeed,
                range: this.attackRange + 40,
                size: this.projectileSize,
                color: this.projectileColor,
                impactColor: this.projectileImpactColor,
                style: this.isBoss ? 'boss-bolt' : 'enemy-bolt'
            });
        }

        return shots;
    }

    takeDamage(damage) { this.health -= damage; }
    isDead() { return this.health <= 0; }

    serialize() {
        return {
            id: this.id,
            x: this.position.x,
            y: this.position.y,
            vx: this.velocity.x,
            vy: this.velocity.y,
            angle: this.angle,
            health: this.health,
            maxHealth: this.maxHealth,
            wave: this.wave,
            spriteTheme: this.spriteTheme,
            type: this.type,
            label: this.label,
            size: this.size,
            renderSize: this.renderSize,
            isBoss: this.isBoss,
            accentColor: this.accentColor,
            minimapColor: this.minimapColor
        };
    }
}

module.exports = { ServerEnemy, initServerEnemyDeps };
