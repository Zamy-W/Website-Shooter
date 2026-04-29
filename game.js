// Game configuration
const GAME_CONFIG = {
    canvas: {
        width: 800,
        height: 600
    },
    player: {
        speed: 200,
        size: 15,
        health: 100,
        reloadTime: 1000 // milliseconds
    },
    bullet: {
        speed: 400,
        size: 3,
        damage: 25
    },
    enemy: {
        speed: 80,
        size: 12,
        health: 50,
        damage: 20,
        spawnRate: 2000 // milliseconds
    }
};

// Game state
class GameState {
    constructor() {
        this.score = 0;
        this.wave = 1;
        this.gameOver = false;
        this.paused = false;
        this.lastTime = 0;
        this.enemySpawnTimer = 0;
    }

    reset() {
        this.score = 0;
        this.wave = 1;
        this.gameOver = false;
        this.paused = false;
        this.lastTime = 0;
        this.enemySpawnTimer = 0;
    }
}

// Vector2D class for position and velocity
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

// Input manager
class InputManager {
    constructor() {
        this.keys = {};
        this.mouse = {
            x: 0,
            y: 0,
            pressed: false
        };

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Keyboard events
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mouse events
        const canvas = document.getElementById('gameCanvas');
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left click
                this.mouse.pressed = true;
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.mouse.pressed = false;
            }
        });
    }

    isKeyPressed(keyCode) {
        return !!this.keys[keyCode];
    }

    isMousePressed() {
        return this.mouse.pressed;
    }

    getMousePosition() {
        return new Vector2D(this.mouse.x, this.mouse.y);
    }
}

// Particle system for effects
class Particle {
    constructor(x, y, velX, velY, color, life) {
        this.position = new Vector2D(x, y);
        this.velocity = new Vector2D(velX, velY);
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.size = Math.random() * 3 + 1;
    }

    update(deltaTime) {
        this.position = this.position.add(this.velocity.multiply(deltaTime));
        this.life -= deltaTime;
        this.velocity = this.velocity.multiply(0.98); // Friction
    }

    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    isDead() {
        return this.life <= 0;
    }
}

// Player class
class Player {
    constructor(x, y) {
        this.position = new Vector2D(x, y);
        this.velocity = new Vector2D(0, 0);
        this.angle = 0;
        this.health = GAME_CONFIG.player.health;
        this.maxHealth = GAME_CONFIG.player.health;
        this.lastShotTime = 0;
        this.reloading = false;
        this.ammo = 30;
        this.maxAmmo = 30;
    }

    update(deltaTime, input) {
        // Movement
        const moveVector = new Vector2D(0, 0);
        
        if (input.isKeyPressed('KeyW') || input.isKeyPressed('ArrowUp')) {
            moveVector.y = -1;
        }
        if (input.isKeyPressed('KeyS') || input.isKeyPressed('ArrowDown')) {
            moveVector.y = 1;
        }
        if (input.isKeyPressed('KeyA') || input.isKeyPressed('ArrowLeft')) {
            moveVector.x = -1;
        }
        if (input.isKeyPressed('KeyD') || input.isKeyPressed('ArrowRight')) {
            moveVector.x = 1;
        }

        // Normalize diagonal movement
        if (moveVector.length() > 0) {
            moveVector = moveVector.normalize();
            this.velocity = moveVector.multiply(GAME_CONFIG.player.speed);
        } else {
            this.velocity = new Vector2D(0, 0);
        }

        // Update position
        this.position = this.position.add(this.velocity.multiply(deltaTime));

        // Keep player within canvas bounds
        this.position.x = Math.max(GAME_CONFIG.player.size, 
            Math.min(GAME_CONFIG.canvas.width - GAME_CONFIG.player.size, this.position.x));
        this.position.y = Math.max(GAME_CONFIG.player.size, 
            Math.min(GAME_CONFIG.canvas.height - GAME_CONFIG.player.size, this.position.y));

        // Rotation towards mouse
        const mousePos = input.getMousePosition();
        const direction = mousePos.subtract(this.position);
        this.angle = Math.atan2(direction.y, direction.x);

        // Reload
        if (input.isKeyPressed('KeyR') && !this.reloading && this.ammo < this.maxAmmo) {
            this.reload();
        }

        // Update reload timer
        if (this.reloading && Date.now() - this.lastShotTime > GAME_CONFIG.player.reloadTime) {
            this.reloading = false;
            this.ammo = this.maxAmmo;
        }
    }

    shoot(bullets, particles) {
        const now = Date.now();
        if (now - this.lastShotTime > 100 && this.ammo > 0 && !this.reloading) { // 100ms between shots
            this.lastShotTime = now;
            this.ammo--;

            const direction = new Vector2D(Math.cos(this.angle), Math.sin(this.angle));
            const bulletStart = this.position.add(direction.multiply(GAME_CONFIG.player.size + 5));
            
            bullets.push(new Bullet(
                bulletStart.x,
                bulletStart.y,
                direction.x * GAME_CONFIG.bullet.speed,
                direction.y * GAME_CONFIG.bullet.speed,
                'player'
            ));

            // Muzzle flash particles
            for (let i = 0; i < 3; i++) {
                particles.push(new Particle(
                    bulletStart.x,
                    bulletStart.y,
                    direction.x * 50 + (Math.random() - 0.5) * 100,
                    direction.y * 50 + (Math.random() - 0.5) * 100,
                    '#ffff00',
                    0.1
                ));
            }

            if (this.ammo === 0) {
                this.reload();
            }
        }
    }

    reload() {
        this.reloading = true;
        this.lastShotTime = Date.now();
    }

    takeDamage(damage) {
        this.health -= damage;
        if (this.health < 0) this.health = 0;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.angle);

        // Player body (triangle)
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.moveTo(GAME_CONFIG.player.size, 0);
        ctx.lineTo(-GAME_CONFIG.player.size, -GAME_CONFIG.player.size / 2);
        ctx.lineTo(-GAME_CONFIG.player.size, GAME_CONFIG.player.size / 2);
        ctx.closePath();
        ctx.fill();

        // Gun barrel
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(GAME_CONFIG.player.size, 0);
        ctx.lineTo(GAME_CONFIG.player.size + 10, 0);
        ctx.stroke();

        ctx.restore();

        // Health bar
        const barWidth = 40;
        const barHeight = 4;
        const healthPercent = this.health / this.maxHealth;

        ctx.fillStyle = '#ff0000';
        ctx.fillRect(this.position.x - barWidth / 2, this.position.y - GAME_CONFIG.player.size - 10, barWidth, barHeight);
        
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(this.position.x - barWidth / 2, this.position.y - GAME_CONFIG.player.size - 10, barWidth * healthPercent, barHeight);
    }

    isAlive() {
        return this.health > 0;
    }
}

// Bullet class
class Bullet {
    constructor(x, y, velX, velY, owner) {
        this.position = new Vector2D(x, y);
        this.velocity = new Vector2D(velX, velY);
        this.owner = owner; // 'player' or 'enemy'
        this.damage = GAME_CONFIG.bullet.damage;
    }

    update(deltaTime) {
        this.position = this.position.add(this.velocity.multiply(deltaTime));
    }

    draw(ctx) {
        ctx.fillStyle = this.owner === 'player' ? '#ffff00' : '#ff6600';
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, GAME_CONFIG.bullet.size, 0, Math.PI * 2);
        ctx.fill();
    }

    isOutOfBounds() {
        return this.position.x < 0 || this.position.x > GAME_CONFIG.canvas.width ||
               this.position.y < 0 || this.position.y > GAME_CONFIG.canvas.height;
    }
}

// Enemy class
class Enemy {
    constructor(x, y) {
        this.position = new Vector2D(x, y);
        this.velocity = new Vector2D(0, 0);
        this.health = GAME_CONFIG.enemy.health;
        this.maxHealth = GAME_CONFIG.enemy.health;
        this.lastShotTime = 0;
        this.angle = 0;
    }

    update(deltaTime, player, bullets, particles) {
        // Move towards player
        if (player.isAlive()) {
            const direction = player.position.subtract(this.position).normalize();
            this.velocity = direction.multiply(GAME_CONFIG.enemy.speed);
            this.angle = Math.atan2(direction.y, direction.x);
        }

        this.position = this.position.add(this.velocity.multiply(deltaTime));

        // Shoot at player occasionally
        const now = Date.now();
        const distanceToPlayer = this.position.distance(player.position);
        if (now - this.lastShotTime > 2000 && distanceToPlayer < 200 && player.isAlive()) {
            this.lastShotTime = now;
            const direction = player.position.subtract(this.position).normalize();
            
            bullets.push(new Bullet(
                this.position.x,
                this.position.y,
                direction.x * GAME_CONFIG.bullet.speed * 0.7,
                direction.y * GAME_CONFIG.bullet.speed * 0.7,
                'enemy'
            ));
        }
    }

    takeDamage(damage, particles) {
        this.health -= damage;
        
        // Blood particles
        for (let i = 0; i < 5; i++) {
            particles.push(new Particle(
                this.position.x,
                this.position.y,
                (Math.random() - 0.5) * 200,
                (Math.random() - 0.5) * 200,
                '#ff0000',
                0.5
            ));
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.angle);

        // Enemy body (rectangle)
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(-GAME_CONFIG.enemy.size, -GAME_CONFIG.enemy.size, 
                     GAME_CONFIG.enemy.size * 2, GAME_CONFIG.enemy.size * 2);

        // Eyes
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-GAME_CONFIG.enemy.size / 2, -GAME_CONFIG.enemy.size / 2, 3, 3);
        ctx.fillRect(GAME_CONFIG.enemy.size / 2 - 3, -GAME_CONFIG.enemy.size / 2, 3, 3);

        ctx.restore();

        // Health bar
        if (this.health < this.maxHealth) {
            const barWidth = 20;
            const barHeight = 3;
            const healthPercent = this.health / this.maxHealth;

            ctx.fillStyle = '#ff0000';
            ctx.fillRect(this.position.x - barWidth / 2, this.position.y - GAME_CONFIG.enemy.size - 8, barWidth, barHeight);
            
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(this.position.x - barWidth / 2, this.position.y - GAME_CONFIG.enemy.size - 8, barWidth * healthPercent, barHeight);
        }
    }

    isDead() {
        return this.health <= 0;
    }
}

// Main game class
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.input = new InputManager();
        this.gameState = new GameState();
        
        this.player = new Player(GAME_CONFIG.canvas.width / 2, GAME_CONFIG.canvas.height / 2);
        this.bullets = [];
        this.enemies = [];
        this.particles = [];

        this.lastTime = 0;
        this.enemySpawnTimer = 0;
        
        this.start();
    }

    start() {
        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
    }

    gameLoop(timestamp) {
        const deltaTime = (timestamp - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = timestamp;

        if (!this.gameState.gameOver && !this.gameState.paused) {
            this.update(deltaTime);
        }
        
        this.draw();
        requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
    }

    update(deltaTime) {
        // Update player
        this.player.update(deltaTime, this.input);

        // Player shooting
        if (this.input.isMousePressed()) {
            this.player.shoot(this.bullets, this.particles);
        }

        // Spawn enemies
        this.enemySpawnTimer += deltaTime * 1000;
        if (this.enemySpawnTimer > GAME_CONFIG.enemy.spawnRate) {
            this.spawnEnemy();
            this.enemySpawnTimer = 0;
        }

        // Update enemies
        this.enemies.forEach(enemy => {
            enemy.update(deltaTime, this.player, this.bullets, this.particles);
        });

        // Update bullets
        this.bullets.forEach(bullet => {
            bullet.update(deltaTime);
        });

        // Update particles
        this.particles.forEach(particle => {
            particle.update(deltaTime);
        });

        // Check collisions
        this.checkCollisions();

        // Remove dead objects
        this.cleanup();

        // Check game over
        if (!this.player.isAlive()) {
            this.gameOver();
        }

        // Update UI
        this.updateUI();
    }

    spawnEnemy() {
        const side = Math.floor(Math.random() * 4);
        let x, y;

        switch (side) {
            case 0: // Top
                x = Math.random() * GAME_CONFIG.canvas.width;
                y = -GAME_CONFIG.enemy.size;
                break;
            case 1: // Right
                x = GAME_CONFIG.canvas.width + GAME_CONFIG.enemy.size;
                y = Math.random() * GAME_CONFIG.canvas.height;
                break;
            case 2: // Bottom
                x = Math.random() * GAME_CONFIG.canvas.width;
                y = GAME_CONFIG.canvas.height + GAME_CONFIG.enemy.size;
                break;
            case 3: // Left
                x = -GAME_CONFIG.enemy.size;
                y = Math.random() * GAME_CONFIG.canvas.height;
                break;
        }

        this.enemies.push(new Enemy(x, y));
    }

    checkCollisions() {
        // Bullet vs Enemy collisions
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            
            if (bullet.owner === 'player') {
                for (let j = this.enemies.length - 1; j >= 0; j--) {
                    const enemy = this.enemies[j];
                    const distance = bullet.position.distance(enemy.position);
                    
                    if (distance < GAME_CONFIG.bullet.size + GAME_CONFIG.enemy.size) {
                        enemy.takeDamage(bullet.damage, this.particles);
                        this.bullets.splice(i, 1);
                        
                        if (enemy.isDead()) {
                            this.gameState.score += 100;
                        }
                        break;
                    }
                }
            } else if (bullet.owner === 'enemy') {
                const distance = bullet.position.distance(this.player.position);
                if (distance < GAME_CONFIG.bullet.size + GAME_CONFIG.player.size) {
                    this.player.takeDamage(bullet.damage);
                    this.bullets.splice(i, 1);
                }
            }
        }

        // Enemy vs Player collisions
        this.enemies.forEach(enemy => {
            const distance = enemy.position.distance(this.player.position);
            if (distance < GAME_CONFIG.enemy.size + GAME_CONFIG.player.size) {
                this.player.takeDamage(GAME_CONFIG.enemy.damage * 0.016); // Damage per frame
            }
        });
    }

    cleanup() {
        // Remove dead enemies
        this.enemies = this.enemies.filter(enemy => !enemy.isDead());
        
        // Remove out of bounds bullets
        this.bullets = this.bullets.filter(bullet => !bullet.isOutOfBounds());
        
        // Remove dead particles
        this.particles = this.particles.filter(particle => !particle.isDead());
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#0a0a0a';
        this.ctx.fillRect(0, 0, GAME_CONFIG.canvas.width, GAME_CONFIG.canvas.height);

        // Draw grid
        this.drawGrid();

        // Draw particles (background)
        this.particles.forEach(particle => {
            particle.draw(this.ctx);
        });

        // Draw bullets
        this.bullets.forEach(bullet => {
            bullet.draw(this.ctx);
        });

        // Draw enemies
        this.enemies.forEach(enemy => {
            enemy.draw(this.ctx);
        });

        // Draw player
        if (this.player.isAlive()) {
            this.player.draw(this.ctx);
        }

        // Draw crosshair
        this.drawCrosshair();

        // Draw ammo indicator
        this.drawAmmoIndicator();
    }

    drawGrid() {
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 1;
        
        const gridSize = 50;
        
        for (let x = 0; x < GAME_CONFIG.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, GAME_CONFIG.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y < GAME_CONFIG.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(GAME_CONFIG.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawCrosshair() {
        const mousePos = this.input.getMousePosition();
        const size = 10;
        
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        
        // Horizontal line
        this.ctx.beginPath();
        this.ctx.moveTo(mousePos.x - size, mousePos.y);
        this.ctx.lineTo(mousePos.x + size, mousePos.y);
        this.ctx.stroke();
        
        // Vertical line
        this.ctx.beginPath();
        this.ctx.moveTo(mousePos.x, mousePos.y - size);
        this.ctx.lineTo(mousePos.x, mousePos.y + size);
        this.ctx.stroke();
    }

    drawAmmoIndicator() {
        const x = GAME_CONFIG.canvas.width - 100;
        const y = GAME_CONFIG.canvas.height - 30;
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '14px Courier New';
        
        if (this.player.reloading) {
            this.ctx.fillText('RELOADING...', x, y);
        } else {
            this.ctx.fillText(`Ammo: ${this.player.ammo}/${this.player.maxAmmo}`, x, y);
        }
    }

    updateUI() {
        document.getElementById('score').textContent = this.gameState.score;
        document.getElementById('health').textContent = Math.max(0, Math.floor(this.player.health));
        document.getElementById('wave').textContent = this.gameState.wave;
    }

    gameOver() {
        this.gameState.gameOver = true;
        document.getElementById('finalScore').textContent = this.gameState.score;
        document.getElementById('gameOver').style.display = 'block';
    }

    restart() {
        this.gameState.reset();
        this.player = new Player(GAME_CONFIG.canvas.width / 2, GAME_CONFIG.canvas.height / 2);
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.enemySpawnTimer = 0;
        
        document.getElementById('gameOver').style.display = 'none';
        this.updateUI();
    }
}

// Global restart function
function restartGame() {
    if (window.game) {
        window.game.restart();
    }
}

// Initialize game when page loads
window.addEventListener('load', () => {
    window.game = new Game();
});