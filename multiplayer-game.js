// Multiplayer Game Client
const CLIENT_BUILD = '2026-03-22-pvp-ffa-1';

const FALLBACK_WEAPON_CATALOG = [
    {
        id: 'pistol',
        label: 'Pistol',
        description: 'Standard sidearm issued to every new operator.',
        cost: 0,
        sortOrder: 10,
        behaviorId: 'projectile',
        slot: 'sidearm',
        publicUrl: 'assets/weapons/pistol.svg',
        playable: true,
        stats: {
            pelletCount: 1,
            damage: 40,
            range: 300,
            spread: 0.05,
            cooldown: 300,
            speed: 600,
            magazineSize: 12,
            reloadTime: 1100,
            chargeTime: 0
        },
        fx: {
            recoilForce: 5,
            muzzleFlashDuration: 80,
            shellEjection: true,
            energyBeam: false,
            sound: 'pistol_fire',
            impactColor: '#57ff8c',
            hitRadius: 3
        },
        presentation: {
            crosshairColor: '#00ff00',
            spreadGuideColor: 'rgba(0, 255, 0, 0.2)',
            holdOffset: 18,
            muzzleOffset: 16,
            ejectBackOffset: 5,
            ejectSideOffset: -7,
            shellEjectAngleBias: -0.08,
            smokeTrailScale: 0,
            showSpreadIndicator: false
        }
    },
    {
        id: 'shotgun',
        label: 'Shotgun',
        description: 'Heavy close-range option with a brutal blast pattern.',
        cost: 320,
        sortOrder: 20,
        behaviorId: 'spread',
        slot: 'primary',
        publicUrl: 'assets/weapons/shotgun.svg',
        playable: true,
        stats: {
            pelletCount: 8,
            damage: 25,
            range: 200,
            spread: 0.3,
            cooldown: 800,
            speed: 800,
            magazineSize: 6,
            reloadTime: 1450,
            chargeTime: 0
        },
        fx: {
            recoilForce: 15,
            muzzleFlashDuration: 100,
            shellEjection: true,
            energyBeam: false,
            sound: 'shotgun_fire',
            impactColor: '#ff9f43',
            hitRadius: 3
        },
        presentation: {
            crosshairColor: '#ff8800',
            spreadGuideColor: 'rgba(255, 136, 0, 0.3)',
            holdOffset: 20,
            muzzleOffset: 22,
            ejectBackOffset: 8,
            ejectSideOffset: -10,
            shellEjectAngleBias: -0.18,
            smokeTrailScale: 0.8,
            showSpreadIndicator: true
        }
    },
    {
        id: 'rifle',
        label: 'Rifle',
        description: 'Reliable high-pressure weapon for sustained fire.',
        cost: 460,
        sortOrder: 30,
        behaviorId: 'projectile',
        slot: 'primary',
        publicUrl: 'assets/weapons/rifle.svg',
        playable: true,
        stats: {
            pelletCount: 1,
            damage: 60,
            range: 400,
            spread: 0.02,
            cooldown: 150,
            speed: 1000,
            magazineSize: 24,
            reloadTime: 1600,
            chargeTime: 0
        },
        fx: {
            recoilForce: 8,
            muzzleFlashDuration: 60,
            shellEjection: true,
            energyBeam: false,
            sound: 'rifle_fire',
            impactColor: '#63b3ff',
            hitRadius: 3
        },
        presentation: {
            crosshairColor: '#0099ff',
            spreadGuideColor: 'rgba(0, 153, 255, 0.24)',
            holdOffset: 21,
            muzzleOffset: 20,
            ejectBackOffset: 7,
            ejectSideOffset: -8,
            shellEjectAngleBias: -0.1,
            smokeTrailScale: 0.8,
            showSpreadIndicator: false
        }
    },
    {
        id: 'sniper',
        label: 'Sniper Laser',
        description: 'Charge a single blue laser round and crack long lanes with heavy recoil.',
        cost: 620,
        sortOrder: 40,
        behaviorId: 'charge_shot',
        slot: 'primary',
        publicUrl: 'assets/weapons/sniper.svg',
        playable: true,
        stats: {
            pelletCount: 1,
            damage: 300,
            range: 900,
            spread: 0.008,
            cooldown: 1500,
            speed: 1900,
            magazineSize: 3,
            reloadTime: 2100,
            chargeTime: 420
        },
        fx: {
            recoilForce: 18,
            muzzleFlashDuration: 140,
            shellEjection: false,
            energyBeam: true,
            sound: 'sniper_laser',
            impactColor: '#67c9ff',
            hitRadius: 9
        },
        presentation: {
            crosshairColor: '#67c9ff',
            spreadGuideColor: 'rgba(103, 201, 255, 0.2)',
            holdOffset: 24,
            muzzleOffset: 28,
            ejectBackOffset: 0,
            ejectSideOffset: 0,
            shellEjectAngleBias: -0.04,
            smokeTrailScale: 0,
            showSpreadIndicator: false
        }
    }
];

const FALLBACK_DEFAULT_WEAPON_ID = FALLBACK_WEAPON_CATALOG[0]?.id || 'pistol';

function cloneWeaponCatalogEntries(entries = FALLBACK_WEAPON_CATALOG) {
    return entries.map((entry) => ({
        ...entry,
        stats: { ...(entry.stats || {}) },
        fx: { ...(entry.fx || {}) },
        presentation: { ...(entry.presentation || {}) }
    }));
}

class MultiplayerGame {
    constructor(options = {}) {
        this.options = options;
        this.isSpectator = Boolean(options.spectator);
        this.spectatorRoomId = options.roomId || null;
        this.spectatorLabel = options.spectatorLabel || 'Admin spectator';
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.defaultCanvasSize = {
            width: Number(this.canvas?.width) || 800,
            height: Number(this.canvas?.height) || 600
        };
        this.canvasAspectRatio = this.defaultCanvasSize.width / this.defaultCanvasSize.height;
        this.socket = null;
        this.connected = false;
        this.inGame = false;
        this.assetsLoaded = false;
        
        this.playerId = null;
        this.playerName = this.isSpectator ? this.spectatorLabel : '';
        this.roomId = null;
        this.currentRoomName = '';
        this.currentArenaName = '';
        this.currentRoomHostId = null;
        this.roomRoster = [];
        this.spectatorCameraMode = 'auto';
        this.spectatorTargetPlayerId = '';
        this.shopState = { active: false, endsAt: 0, durationMs: 0, endVote: { votes: 0, required: 0, playerIds: [] } };
        this.shopRenderSignature = '';
        this.shopNoticeText = 'Upgrades apply instantly and last for this match.';
        this.pendingPurchase = null;
        this.pendingEndVote = false;
        this.authToken = this.loadAuthToken();
        this.profile = null;
        this.authBusy = false;
        this.defaultSkinId = 'player1';
        this.defaultWeaponId = FALLBACK_DEFAULT_WEAPON_ID;
        this.defaultEnemySpriteId = 'enemy';
        this.skinCatalog = {};
        this.skinOrder = [];
        this.enemySpriteCatalog = {};
        this.weaponAssetCatalog = {};
        this.applyAssetManifest(this.getFallbackAssetManifest());
        this.arenaState = this.getDefaultArenaState();
        this.selectedSkin = this.loadSelectedSkin();
        this.selectedLoadoutWeapon = this.loadSelectedLoadoutWeapon();
        this.shopConfig = {
            damage: { label: 'Damage', color: '#ff8a65', description: '+20% weapon damage', baseCost: 100, scale: 1.55, maxLevel: 5 },
            fireRate: { label: 'Fire Rate', color: '#ffd166', description: 'Shoot faster', baseCost: 120, scale: 1.6, maxLevel: 5 },
            health: { label: 'Health', color: '#7bed9f', description: '+20 max health', baseCost: 90, scale: 1.5, maxLevel: 5 },
            speed: { label: 'Speed', color: '#70d6ff', description: 'Move faster', baseCost: 85, scale: 1.45, maxLevel: 5 },
            shield: { label: 'Shield', color: '#c792ea', description: 'Stronger shield pickups', baseCost: 110, scale: 1.5, maxLevel: 4 },
            grenade: { label: 'Grenade', color: '#ffad49', description: '+1 grenade charge', baseCost: 100, scale: 1, maxLevel: 99 }
        };
        this.minimapConfig = {
            width: 210,
            height: 158,
            margin: 18,
            padding: 12,
            headerHeight: 24
        };
        
        // Audio
        this.audioCtx = null;
        this._musicNodes = [];
        this._musicPlaying = false;
        this._musicScheduler = null;
        this._initAudioCtx = () => {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        };

        // Modern Systems
        this.assetManager = new AssetManager();
        this.particleSystem = new ParticleSystem();
        this.uiManager = new UIManager(this.canvas, this.ctx);
        this.animationManager = new AnimationManager();
        this.cameraSystem = new CameraSystem(this.canvas, 2000, 2000);
        this.spriteRenderer = new SpriteRenderer(this.assetManager);
        this.parallaxBackground = new ParallaxBackground(this.canvas, this.cameraSystem);
        this.applyArenaState(this.arenaState);
        
        // Game state
        this.players = new Map();
        this.bullets = new Map();
        this.grenades = new Map();
        this.enemies = new Map();
        this.particles = new Map();
        this.powerUps = new Map();

        // Interpolation buffer: stores last 3 server snapshots for smooth rendering
        this.stateBuffer = [];
        this.interpolationDelay = 100; // render 100ms behind to interpolate between snapshots
        this.wave = 1;
        this.waveInfo = {
            bossWave: false,
            label: 'Wave 1',
            bossType: null,
            composition: [],
            bossAlive: false,
            bossId: null,
            bossName: null,
            bossHealth: 0,
            bossMaxHealth: 0
        };
        this.difficulty = {
            enemiesPerWave: 5,
            spawnRate: 3000,
            enemiesRemaining: 0,
            enemiesAlive: 0
        };
        this.matchMode = 'pve';
        this.matchState = null;
        this.matchOver = false;
        this.lastPlayerState = null; // Track if player just died
        
        // Input handling
        this.keys = {};
        this.mouse = {
            x: 0,
            y: 0,
            pressed: false,
            worldX: 0, // World coordinates
            worldY: 0
        };
        this.mobileControls = {
            capable: false,
            movementPointerId: null,
            movementVector: { x: 0, y: 0 },
            aimPointerId: null,
            aimVector: { x: 1, y: 0 },
            lastAimVector: { x: 1, y: 0 },
            isFiring: false
        };
        this.mobileElements = {};
        this.handleViewportResize = () => this.applyResponsiveLayout();
        
        this.lastInputTime = 0;
        this.inputBuffer = {
            up: false,
            down: false,
            left: false,
            right: false,
            shooting: false,
            mouseX: 0,
            mouseY: 0
        };
        
        // Weapon System
        this.weaponSystem = new WeaponSystem(Object.values(this.weaponAssetCatalog), this.defaultWeaponId);
        this.currentWeapon = this.selectedLoadoutWeapon || this.defaultWeaponId;
        this.weaponSwapAnimations = new Map();
        this.lastFireTime = 0;
        this.weaponChargeState = {
            active: false,
            weaponType: null,
            startedAt: 0,
            endsAt: 0,
            durationMs: 0
        };
        this.queuedChargedShot = {
            active: false,
            weaponType: null
        };
        this.reloadRequestLock = {
            weaponType: null,
            until: 0
        };
        this.grenadeRequestLockUntil = 0;
        this.grenadeChargeState = {
            active: false,
            startedAt: 0,
            durationMs: 0
        };
        this.recoilOffset = { x: 0, y: 0 };
        
        // Initialize modern systems
        this.initializeAssets();
        this.initializeResponsiveLayout();
        this.initializeMobileControls();
        this.setupEventListeners();
        this.initializeShopUI();
        this.initializeAuthUI();
        this.initializeLoadoutShopUI();
        this.initializeSkinSelector();
        this.initializeWeaponSelector();
        this.initializeSpectatorControls();
        this.initializeRoomModeUI();
        this.initializeMatchOverUI();
        this.refreshAuthSession();
        
        // Start render loop
        this.lastTime = 0;
        this.maxDeltaTime = 1 / 30; // Avoid giant simulation jumps after tab switches
        requestAnimationFrame((timestamp) => this.renderLoop(timestamp));
    }

    hasTouchInput() {
        return Boolean('ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0);
    }

    isEditableElement(target) {
        if (!(target instanceof Element)) {
            return false;
        }

        if (target.isContentEditable) {
            return true;
        }

        const tagName = target.tagName;
        return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || tagName === 'BUTTON';
    }

    resetGameplayInputState() {
        this.keys = {};
        this.mouse.pressed = false;
        this.cancelLocalWeaponCharge();
        this.cancelGrenadeCharge({ silent: true });
    }

    shouldUseCompactLayout() {
        const hasCoarsePointer = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
        return hasCoarsePointer || window.innerWidth <= 900 || window.innerHeight <= 760;
    }

    shouldEnableMobileControls() {
        return this.hasTouchInput() && this.shouldUseCompactLayout();
    }

    shouldShowMobileControls() {
        return this.mobileControls.capable && this.inGame && !this.isSpectator;
    }

    isMobileGameActive() {
        return this.shouldShowMobileControls();
    }

    shouldBlockForPortrait() {
        return this.isMobileGameActive() && window.innerHeight > window.innerWidth;
    }

    updateOrientationState() {
        const mobileGameActive = this.isMobileGameActive();
        const portraitBlocked = this.shouldBlockForPortrait();

        document.body.classList.toggle('mobile-game-active', mobileGameActive);
        document.body.classList.toggle('mobile-portrait-blocked', portraitBlocked);

        if (this.mobileElements.rotateOverlay) {
            this.mobileElements.rotateOverlay.setAttribute('aria-hidden', portraitBlocked ? 'false' : 'true');
        }
    }

    tryEnterLandscapeMode(options = {}) {
        if (!this.mobileControls.capable || this.isSpectator) {
            return;
        }

        const target = document.documentElement;
        const shouldRequestFullscreen = options.requestFullscreen !== false;
        const lockLandscape = () => {
            if (screen.orientation && typeof screen.orientation.lock === 'function') {
                screen.orientation.lock('landscape').catch(() => {});
            }
        };

        if (shouldRequestFullscreen && !document.fullscreenElement && target?.requestFullscreen) {
            try {
                const fullscreenRequest = target.requestFullscreen();
                if (fullscreenRequest && typeof fullscreenRequest.then === 'function') {
                    fullscreenRequest.then(lockLandscape).catch(() => {
                        lockLandscape();
                    });
                } else {
                    lockLandscape();
                }
            } catch (error) {
                lockLandscape();
            }
            return;
        }

        lockLandscape();
    }

    exitLandscapeMode() {
        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
            try {
                screen.orientation.unlock();
            } catch (error) {
                // Ignore unsupported unlock behavior.
            }
        }

        if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
            document.exitFullscreen().catch(() => {});
        }
    }

    initializeResponsiveLayout() {
        window.addEventListener('resize', this.handleViewportResize);
        window.addEventListener('orientationchange', this.handleViewportResize);

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this.handleViewportResize);
        }

        this.applyResponsiveLayout();
    }

    applyResponsiveLayout() {
        if (!this.canvas) {
            return;
        }

        const compactLayout = this.shouldUseCompactLayout();
        const enableMobileControls = this.shouldEnableMobileControls() && !this.isSpectator;
        const mobileGameActive = enableMobileControls && this.inGame;
        const viewportWidth = Math.max(window.innerWidth || 0, 320);
        const viewportHeight = Math.max(window.innerHeight || 0, 320);
        let nextWidth = this.defaultCanvasSize.width;
        let nextHeight = this.defaultCanvasSize.height;

        if (mobileGameActive) {
            nextWidth = viewportWidth;
            nextHeight = viewportHeight;
        } else if (compactLayout) {
            const availableWidth = Math.max(260, viewportWidth - 16);
            const reservedHeight = 190;
            const availableHeight = Math.max(220, viewportHeight - reservedHeight);

            nextWidth = Math.min(this.defaultCanvasSize.width, availableWidth);
            nextHeight = Math.round(nextWidth / this.canvasAspectRatio);

            if (nextHeight > availableHeight) {
                nextHeight = availableHeight;
                nextWidth = Math.round(nextHeight * this.canvasAspectRatio);
            }
        }

        nextWidth = Math.max(260, Math.round(nextWidth));
        nextHeight = Math.max(195, Math.round(nextHeight));

        if (this.canvas.width !== nextWidth) {
            this.canvas.width = nextWidth;
        }
        if (this.canvas.height !== nextHeight) {
            this.canvas.height = nextHeight;
        }

        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.style.width = `${nextWidth}px`;
            gameContainer.style.height = `${nextHeight}px`;
        }

        document.body.classList.toggle('mobile-layout', compactLayout);
        this.mobileControls.capable = enableMobileControls;
        this.updateOrientationState();
        this.updateMobileControlsState();
        this.updateMouseWorldPosition();
    }

    initializeMobileControls() {
        this.mobileElements = {
            container: document.getElementById('mobileControls'),
            movementPad: document.getElementById('movementPad'),
            movementKnob: document.getElementById('movementPadKnob'),
            aimPad: document.getElementById('aimPad'),
            aimKnob: document.getElementById('aimPadKnob'),
            reloadButton: document.getElementById('mobileReloadButton'),
            grenadeButton: document.getElementById('mobileGrenadeButton'),
            weaponButton: document.getElementById('mobileWeaponButton'),
            respawnButton: document.getElementById('mobileRespawnButton'),
            rotateOverlay: document.getElementById('rotateDeviceOverlay'),
            rotateButton: document.getElementById('rotateDeviceButton')
        };

        if (!this.mobileElements.container) {
            return;
        }

        this.bindMobilePad('movement', this.mobileElements.movementPad, this.mobileElements.movementKnob);
        this.bindMobilePad('aim', this.mobileElements.aimPad, this.mobileElements.aimKnob);

        this.mobileElements.reloadButton?.addEventListener('click', (event) => {
            event.preventDefault();
            if (!this.shouldShowMobileControls()) {
                return;
            }
            this.tryEnterLandscapeMode();
            this.requestWeaponReload();
        });

        const releaseMobileGrenade = (event) => {
            event?.preventDefault?.();
            this.releaseGrenadeCharge();
            const button = this.mobileElements.grenadeButton;
            if (button && Number.isInteger(event?.pointerId) && button.hasPointerCapture?.(event.pointerId)) {
                try {
                    button.releasePointerCapture(event.pointerId);
                } catch (error) {
                    console.warn('Unable to release grenade pointer capture:', error);
                }
            }
        };

        this.mobileElements.grenadeButton?.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            if (!this.shouldShowMobileControls()) {
                return;
            }
            this.tryEnterLandscapeMode();
            this.startGrenadeCharge();
            try {
                event.currentTarget?.setPointerCapture?.(event.pointerId);
            } catch (error) {
                console.warn('Unable to capture grenade pointer:', error);
            }
        });
        this.mobileElements.grenadeButton?.addEventListener('pointerup', releaseMobileGrenade);
        this.mobileElements.grenadeButton?.addEventListener('pointercancel', releaseMobileGrenade);
        this.mobileElements.grenadeButton?.addEventListener('lostpointercapture', releaseMobileGrenade);

        this.mobileElements.weaponButton?.addEventListener('click', (event) => {
            event.preventDefault();
            if (!this.shouldShowMobileControls()) {
                return;
            }
            this.tryEnterLandscapeMode();
            this.cycleWeapon(1);
        });

        this.mobileElements.respawnButton?.addEventListener('click', (event) => {
            event.preventDefault();
            if (!this.shouldShowMobileControls()) {
                return;
            }
            this.tryEnterLandscapeMode();
            this.requestRespawn();
        });

        this.mobileElements.rotateButton?.addEventListener('click', (event) => {
            event.preventDefault();
            this.tryEnterLandscapeMode({ requestFullscreen: true });
        });

        this.updateInstructionCopy();
        this.updateMobileControlsState();
    }

    bindMobilePad(type, pad, knob) {
        if (!pad || !knob) {
            return;
        }

        const pointerKey = type === 'movement' ? 'movementPointerId' : 'aimPointerId';

        pad.addEventListener('pointerdown', (event) => {
            if (!this.shouldShowMobileControls()) {
                return;
            }

            event.preventDefault();
            this.tryEnterLandscapeMode();
            this.mobileControls[pointerKey] = event.pointerId;
            pad.setPointerCapture?.(event.pointerId);
            this.updateMobilePad(type, pad, knob, event);
        });

        pad.addEventListener('pointermove', (event) => {
            if (this.mobileControls[pointerKey] !== event.pointerId) {
                return;
            }

            event.preventDefault();
            this.updateMobilePad(type, pad, knob, event);
        });

        const releasePointer = (event) => {
            if (this.mobileControls[pointerKey] !== event.pointerId) {
                return;
            }

            event.preventDefault();
            this.mobileControls[pointerKey] = null;
            this.resetMobilePad(type, pad, knob);
        };

        pad.addEventListener('pointerup', releasePointer);
        pad.addEventListener('pointercancel', releasePointer);
        pad.addEventListener('lostpointercapture', releasePointer);
    }

    updateMobilePad(type, pad, knob, event) {
        const rect = pad.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const maxDistance = Math.min(rect.width, rect.height) * 0.32;
        const deltaX = event.clientX - centerX;
        const deltaY = event.clientY - centerY;
        const distance = Math.hypot(deltaX, deltaY);
        const scale = distance > maxDistance && distance > 0 ? maxDistance / distance : 1;
        const clampedX = deltaX * scale;
        const clampedY = deltaY * scale;
        const normalizedX = maxDistance > 0 ? clampedX / maxDistance : 0;
        const normalizedY = maxDistance > 0 ? clampedY / maxDistance : 0;
        const magnitude = Math.min(distance / Math.max(maxDistance, 1), 1);

        pad.classList.add('active');
        knob.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;

        if (type === 'movement') {
            this.mobileControls.movementVector = { x: normalizedX, y: normalizedY };
            return;
        }

        if (magnitude > 0.1) {
            this.mobileControls.lastAimVector = { x: normalizedX, y: normalizedY };
        }

        this.mobileControls.aimVector = magnitude > 0.04
            ? { x: normalizedX, y: normalizedY }
            : { ...this.mobileControls.lastAimVector };

        this.mobileControls.isFiring = magnitude > 0.18 && !this.shopState.active;
    }

    resetMobilePad(type, pad, knob) {
        if (pad) {
            pad.classList.remove('active');
        }
        if (knob) {
            knob.style.transform = 'translate(-50%, -50%)';
        }

        if (type === 'movement') {
            this.mobileControls.movementVector = { x: 0, y: 0 };
            return;
        }

        this.mobileControls.aimVector = { ...this.mobileControls.lastAimVector };
        this.mobileControls.isFiring = false;
    }

    resetMobileControlState() {
        this.mobileControls.movementPointerId = null;
        this.mobileControls.aimPointerId = null;
        this.resetMobilePad('movement', this.mobileElements.movementPad, this.mobileElements.movementKnob);
        this.resetMobilePad('aim', this.mobileElements.aimPad, this.mobileElements.aimKnob);
        this.mouse.pressed = false;
    }

    updateMobileControlsState() {
        const portraitBlocked = this.shouldBlockForPortrait();
        const shouldShow = this.shouldShowMobileControls() && !portraitBlocked;
        const currentPlayer = this.players.get(this.playerId);
        const playerAlive = Boolean(currentPlayer?.alive);

        document.body.classList.toggle('mobile-controls-active', shouldShow);
        this.updateOrientationState();

        if (this.mobileElements.container) {
            this.mobileElements.container.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
        }

        if (!shouldShow) {
            this.resetMobileControlState();
            if (this.mobileControls.capable) {
                // Only cancel grenade charge when mobile controls are actually in play.
                this.cancelGrenadeCharge({ silent: true });
            }
        }

        if (this.mobileElements.reloadButton) {
            this.mobileElements.reloadButton.disabled = !shouldShow || !playerAlive;
        }
        if (this.mobileElements.grenadeButton) {
            this.mobileElements.grenadeButton.disabled = !shouldShow || !playerAlive;
        }
        if (this.mobileElements.weaponButton) {
            this.mobileElements.weaponButton.disabled = !shouldShow || !playerAlive;
        }
        if (this.mobileElements.respawnButton) {
            this.mobileElements.respawnButton.disabled = !shouldShow || playerAlive;
        }

        this.updateInstructionCopy();
    }

    updateInstructionCopy() {
        const combatHelp = document.getElementById('combatHelp');
        const controlsSummary = document.getElementById('controlsSummary');
        const mobileMode = this.mobileControls.capable;
        const activeWeapon = this.weaponSystem?.getWeapon?.(this.currentWeapon);
        const usesCharge = Boolean(activeWeapon?.chargeTime);
        const isPvp = this.matchMode === 'pvp_ffa';

        if (combatHelp) {
            if (isPvp) {
                combatHelp.textContent = mobileMode
                    ? 'Free For All: eliminate other operators - Use right pad to aim/fire - Hold Grenade to charge throw distance - Empty mags auto-reload - Tap Reload to top off early'
                    : 'Free For All: eliminate other operators - Hold Left Click to fire - Hold G to charge grenade distance - Empty mags auto-reload - Press R to reload early';
            } else {
                combatHelp.textContent = mobileMode
                    ? (usesCharge ? 'Use the right pad to aim - tap or hold to arm a laser charge shot - Hold Grenade to charge throw distance - Empty mags auto-reload - Tap Reload to top off early' : 'Use the right pad to aim - hold on an enemy to auto-fire - Hold Grenade to charge throw distance - Empty mags auto-reload - Tap Reload to top off early')
                    : (usesCharge ? 'Click once to charge the sniper laser - Hold G to charge grenade distance - Empty mags auto-reload - Press R to reload early' : 'Hold Left Click to fire - Hold G to charge grenade distance - Empty mags auto-reload - Press R to reload early');
            }
        }

        if (controlsSummary) {
            if (isPvp) {
                controlsSummary.innerHTML = mobileMode
                    ? '<strong>Controls:</strong><br>Left pad - Move - Right pad - Aim / Fire - Hold Grenade to set throw power - Tap Reload to top off early - Tap Swap to cycle weapons'
                    : '<strong>Controls:</strong><br>WASD - Move - Mouse - Aim - Left Click - Fire - Hold G - Charge grenade throw - R - Reload early - Mouse Wheel / 1-9 - Swap';
            } else {
                controlsSummary.innerHTML = mobileMode
                    ? '<strong>Controls:</strong><br>Left pad - Move - Right pad - Aim - Tap again to arm charged laser shots - Hold Grenade to set throw power - Tap Reload to top off early - Tap Swap to cycle weapons - Use the respawn button when down'
                    : '<strong>Controls:</strong><br>WASD - Move - Mouse - Aim - Left Click - Fire or arm charge weapons - Hold G - Charge grenade throw - R - Reload early - Mouse Wheel / 1-9 - Swap - Space - Respawn (when dead)';
            }
        }
    }

    getCanvasCoordinates(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = rect.width ? this.canvas.width / rect.width : 1;
        const scaleY = rect.height ? this.canvas.height / rect.height : 1;

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    getMovementInputState() {
        const threshold = 0.28;
        const movementVector = this.mobileControls.capable ? this.mobileControls.movementVector : { x: 0, y: 0 };

        return {
            up: Boolean(this.keys['KeyW'] || this.keys['ArrowUp'] || movementVector.y < -threshold),
            down: Boolean(this.keys['KeyS'] || this.keys['ArrowDown'] || movementVector.y > threshold),
            left: Boolean(this.keys['KeyA'] || this.keys['ArrowLeft'] || movementVector.x < -threshold),
            right: Boolean(this.keys['KeyD'] || this.keys['ArrowRight'] || movementVector.x > threshold)
        };
    }

    applyMobileAimToMouse() {
        if (!this.mobileControls.capable || this.isSpectator) {
            return false;
        }

        const player = this.players.get(this.playerId);
        if (!player) {
            return false;
        }

        const aimVector = this.mobileControls.isFiring
            ? this.mobileControls.aimVector
            : this.mobileControls.lastAimVector;
        const magnitude = Math.hypot(aimVector.x, aimVector.y);
        if (magnitude < 0.01) {
            return false;
        }

        const normalizedX = aimVector.x / magnitude;
        const normalizedY = aimVector.y / magnitude;
        const previewRadius = Math.min(this.canvas.width, this.canvas.height) * 0.22;
        const aimDistance = Math.max(700, Math.max(this.canvas.width, this.canvas.height) * 1.35);

        this.mouse.x = this.canvas.width / 2 + normalizedX * previewRadius;
        this.mouse.y = this.canvas.height / 2 + normalizedY * previewRadius;
        this.mouse.worldX = player.x + normalizedX * aimDistance;
        this.mouse.worldY = player.y + normalizedY * aimDistance;
        return true;
    }

    getMobileAutoFireTarget(player, weapon = this.weaponSystem.getWeapon(this.currentWeapon)) {
        if (!this.mobileControls.capable || !this.mobileControls.isFiring || !player?.alive || !weapon) {
            return null;
        }

        const aimDeltaX = this.mouse.worldX - player.x;
        const aimDeltaY = this.mouse.worldY - player.y;
        const aimLength = Math.hypot(aimDeltaX, aimDeltaY);
        if (aimLength < 0.001) {
            return null;
        }

        const directionX = aimDeltaX / aimLength;
        const directionY = aimDeltaY / aimLength;
        const maxDistance = Math.max(weapon.range || 0, 140);
        let lockedTarget = null;
        let lockedDistance = Number.POSITIVE_INFINITY;

        this.enemies.forEach((enemy) => {
            if (!enemy || enemy.health <= 0) {
                return;
            }

            const radius = this.getMobileAutoFireRadius(enemy, weapon);
            const offsetX = enemy.x - player.x;
            const offsetY = enemy.y - player.y;
            const forwardDistance = (offsetX * directionX) + (offsetY * directionY);
            if (forwardDistance < 0 || forwardDistance > maxDistance) {
                return;
            }

            const perpendicularDistance = Math.abs((offsetX * directionY) - (offsetY * directionX));
            if (perpendicularDistance > radius) {
                return;
            }

            const intersectionOffset = Math.sqrt(Math.max((radius * radius) - (perpendicularDistance * perpendicularDistance), 0));
            const hitDistance = Math.max(0, forwardDistance - intersectionOffset);
            const hitX = player.x + directionX * hitDistance;
            const hitY = player.y + directionY * hitDistance;

            if (this.isAimPathBlocked(player.x, player.y, hitX, hitY)) {
                return;
            }

            if (hitDistance < lockedDistance) {
                lockedDistance = hitDistance;
                lockedTarget = enemy;
            }
        });

        return lockedTarget;
    }

    getMobileAutoFireRadius(enemy, weapon) {
        const baseRadius = Math.max(
            Number(enemy?.radius) || 0,
            Number(enemy?.size) ? Number(enemy.size) / 2 : 0,
            Number(enemy?.width) ? Number(enemy.width) / 2 : 0,
            Number(enemy?.height) ? Number(enemy.height) / 2 : 0,
            14
        );
        const spreadAssist = Math.max(10, Math.min(26, (weapon?.spread || 0) * 90));
        return baseRadius + spreadAssist;
    }

    isAimPathBlocked(startX, startY, endX, endY) {
        if (!Array.isArray(this.arenaState?.obstacles) || this.arenaState.obstacles.length === 0) {
            return false;
        }

        return this.arenaState.obstacles.some((obstacle) => {
            if (!obstacle || !Number.isFinite(obstacle.x) || !Number.isFinite(obstacle.y) || !Number.isFinite(obstacle.width) || !Number.isFinite(obstacle.height)) {
                return false;
            }

            return this.segmentIntersectsRect(startX, startY, endX, endY, obstacle);
        });
    }

    segmentIntersectsRect(startX, startY, endX, endY, rect) {
        const minX = rect.x;
        const minY = rect.y;
        const maxX = rect.x + rect.width;
        const maxY = rect.y + rect.height;
        const pointInsideRect = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;

        if (pointInsideRect(startX, startY) || pointInsideRect(endX, endY)) {
            return true;
        }

        const deltaX = endX - startX;
        const deltaY = endY - startY;
        let enter = 0;
        let exit = 1;
        const clips = [
            [-deltaX, startX - minX],
            [deltaX, maxX - startX],
            [-deltaY, startY - minY],
            [deltaY, maxY - startY]
        ];

        for (const [p, q] of clips) {
            if (Math.abs(p) < 0.000001) {
                if (q < 0) {
                    return false;
                }
                continue;
            }

            const t = q / p;
            if (p < 0) {
                enter = Math.max(enter, t);
            } else {
                exit = Math.min(exit, t);
            }

            if (enter > exit) {
                return false;
            }
        }

        return exit >= 0 && enter <= 1;
    }

    getFallbackAssetManifest() {
        return {
            defaultSkinId: 'player1',
            defaultWeaponId: FALLBACK_DEFAULT_WEAPON_ID,
            defaultEnemySpriteId: 'enemy',
            skins: [
                { id: 'player1', label: 'Blue Vanguard', cost: 0, publicUrl: 'assets/sprites/player1.svg' },
                { id: 'player2', label: 'Green Scout', cost: 200, publicUrl: 'assets/sprites/player2.svg' },
                { id: 'player3', label: 'Violet Phantom', cost: 350, publicUrl: 'assets/sprites/player3.svg' },
                { id: 'player4', label: 'Amber Breacher', cost: 500, publicUrl: 'assets/sprites/player4.svg' }
            ],
            enemySprites: [
                { id: 'enemy', label: 'Enemy', publicUrl: 'assets/sprites/enemy.svg' }
            ],
            weapons: cloneWeaponCatalogEntries()
        };
    }

    getDefaultArenaState() {
        return {
            id: 'fallback-arena',
            name: 'Axiom Crossroads',
            themeId: 'neon-district',
            layoutId: 'crossroads',
            width: 2000,
            height: 2000,
            palette: {
                floorBase: '#101a24',
                floorAlt: '#152636',
                floorGlow: 'rgba(44, 209, 255, 0.08)',
                gridMinor: 'rgba(117, 191, 209, 0.12)',
                gridMajor: 'rgba(196, 238, 255, 0.08)',
                boundary: 'rgba(116, 241, 255, 0.34)',
                wallBase: '#243645',
                wallTop: '#3f5c72',
                wallTrim: '#60d7ff',
                wallShadow: 'rgba(0, 0, 0, 0.28)',
                hazard: '#ff7a5c',
                beacon: '#7df9ff',
                decal: 'rgba(76, 202, 255, 0.12)'
            },
            obstacles: [],
            decor: []
        };
    }

    applyArenaState(arena = null) {
        const fallback = this.getDefaultArenaState();
        const nextArena = {
            ...fallback,
            ...(arena || {}),
            palette: {
                ...fallback.palette,
                ...(arena?.palette || {})
            },
            obstacles: Array.isArray(arena?.obstacles) ? arena.obstacles : [],
            decor: Array.isArray(arena?.decor) ? arena.decor : []
        };

        this.arenaState = nextArena;
        this.currentArenaName = nextArena.name || this.currentArenaName;

        if (this.cameraSystem) {
            this.cameraSystem.worldWidth = nextArena.width;
            this.cameraSystem.worldHeight = nextArena.height;
            this.cameraSystem.setBounds(0, 0, nextArena.width, nextArena.height);
        }

        if (this.parallaxBackground && typeof this.parallaxBackground.setTheme === 'function') {
            this.parallaxBackground.setTheme(nextArena.themeId, nextArena.palette);
        }

        if (this.particleSystem && typeof this.particleSystem.setWorldGroundY === 'function') {
            this.particleSystem.setWorldGroundY(nextArena.height - 20);
        }
    }

    getArenaPalette() {
        return this.arenaState?.palette || this.getDefaultArenaState().palette;
    }

    getArenaDimensions() {
        return {
            width: this.arenaState?.width || 2000,
            height: this.arenaState?.height || 2000
        };
    }

    resolveArenaColor(colorToken, fallback = '#ffffff') {
        if (!colorToken) {
            return fallback;
        }
        const palette = this.getArenaPalette();
        const aliases = {
            trim: 'wallTrim',
            wall: 'wallBase',
            top: 'wallTop'
        };
        const resolvedKey = aliases[colorToken] || colorToken;
        return palette[resolvedKey] || resolvedKey || fallback;
    }

    isWorldRectVisible(x, y, width, height, margin = 80) {
        const viewport = this.cameraSystem?.getViewport ? this.cameraSystem.getViewport() : {
            x: 0,
            y: 0,
            width: this.canvas.width,
            height: this.canvas.height
        };

        return (
            x + width >= viewport.x - margin &&
            y + height >= viewport.y - margin &&
            x <= viewport.x + viewport.width + margin &&
            y <= viewport.y + viewport.height + margin
        );
    }

    applyAssetManifest(manifest = {}) {
        const fallback = this.getFallbackAssetManifest();
        const skins = Array.isArray(manifest.skins) && manifest.skins.length > 0 ? manifest.skins : fallback.skins;
        const enemySprites = Array.isArray(manifest.enemySprites) && manifest.enemySprites.length > 0 ? manifest.enemySprites : fallback.enemySprites;
        const weapons = Array.isArray(manifest.weapons) && manifest.weapons.length > 0 ? manifest.weapons : fallback.weapons;

        this.defaultSkinId = manifest.defaultSkinId || fallback.defaultSkinId;
        this.defaultWeaponId = manifest.defaultWeaponId || fallback.defaultWeaponId || FALLBACK_DEFAULT_WEAPON_ID;
        this.defaultEnemySpriteId = manifest.defaultEnemySpriteId || fallback.defaultEnemySpriteId;
        this.skinOrder = skins.map((skin) => skin.id).filter(Boolean);
        this.skinCatalog = Object.fromEntries(skins.filter((skin) => skin?.id).map((skin) => [skin.id, skin]));
        this.enemySpriteCatalog = Object.fromEntries(enemySprites.filter((sprite) => sprite?.id).map((sprite) => [sprite.id, sprite]));
        this.weaponAssetCatalog = Object.fromEntries(weapons.filter((weapon) => weapon?.id).map((weapon) => [weapon.id, weapon]));

        if (!this.skinCatalog[this.defaultSkinId] && this.skinOrder.length > 0) {
            this.defaultSkinId = this.skinOrder[0];
        }
        if (!this.enemySpriteCatalog[this.defaultEnemySpriteId] && enemySprites[0]?.id) {
            this.defaultEnemySpriteId = enemySprites[0].id;
        }
        if (!this.skinCatalog[this.selectedSkin]) {
            this.selectedSkin = this.defaultSkinId;
        }
        if (!this.weaponAssetCatalog[this.defaultWeaponId]) {
            const firstPlayableWeapon = weapons.find((weapon) => weapon?.playable)?.id;
            this.defaultWeaponId = firstPlayableWeapon || this.defaultWeaponId;
        }
        if (!this.weaponAssetCatalog[this.selectedLoadoutWeapon]) {
            this.selectedLoadoutWeapon = this.defaultWeaponId;
        }
        if (this.weaponSystem?.configureFromCatalog) {
            this.weaponSystem.configureFromCatalog(weapons, this.defaultWeaponId);
        }
    }

    async loadAssetManifest() {
        try {
            const response = await fetch('/api/game-assets', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Asset manifest request failed with ${response.status}`);
            }
            const data = await response.json();
            this.applyAssetManifest(data);
        } catch (error) {
            console.warn('Unable to load live asset manifest, falling back to built-in assets:', error);
            this.applyAssetManifest(this.getFallbackAssetManifest());
        }

        this.rebuildSkinSelector();
        this.updateSkinSelector();
        this.rebuildWeaponSelector();
        this.updateWeaponSelector();
    }

    getSkinEntries() {
        return this.skinOrder.map((skinId) => this.skinCatalog[skinId]).filter(Boolean);
    }

    getWeaponEntries() {
        return Object.values(this.weaponAssetCatalog)
            .filter((weapon) => weapon?.playable)
            .sort((left, right) => {
                const leftOrder = Number.isFinite(left.sortOrder) ? left.sortOrder : Number.MAX_SAFE_INTEGER;
                const rightOrder = Number.isFinite(right.sortOrder) ? right.sortOrder : Number.MAX_SAFE_INTEGER;
                if (leftOrder !== rightOrder) {
                    return leftOrder - rightOrder;
                }
                return (left.label || left.id).localeCompare(right.label || right.id);
            });
    }

    getSkinAssetUrl(skinTheme) {
        return this.skinCatalog[skinTheme]?.publicUrl || '';
    }

    getWeaponAssetUrl(weaponType) {
        return this.weaponAssetCatalog[weaponType]?.publicUrl || '';
    }

    initializeSpectatorControls() {
        if (!this.isSpectator) {
            return;
        }

        const cameraModeSelect = document.getElementById('spectatorCameraMode');
        const playerTargetSelect = document.getElementById('spectatorPlayerTarget');
        const resetButton = document.getElementById('spectatorResetCamera');

        if (cameraModeSelect) {
            cameraModeSelect.value = this.spectatorCameraMode;
            cameraModeSelect.addEventListener('change', (event) => {
                this.spectatorCameraMode = event.target.value || 'auto';
                if (playerTargetSelect) {
                    playerTargetSelect.disabled = this.spectatorCameraMode !== 'follow';
                }
                this.updateSpectatorBanner(this.spectatorCameraMode === 'follow' ? 'Following selected player' : 'Auto camera active');
            });
        }

        if (playerTargetSelect) {
            playerTargetSelect.addEventListener('change', (event) => {
                this.spectatorTargetPlayerId = event.target.value || '';
                const selectedPlayer = this.players.get(this.spectatorTargetPlayerId) || this.roomRoster.find((player) => player.id === this.spectatorTargetPlayerId);
                this.updateSpectatorBanner(selectedPlayer ? `Following ${selectedPlayer.name}` : 'Auto camera active');
            });
        }

        if (resetButton) {
            resetButton.addEventListener('click', () => {
                this.cameraSystem.setZoom(0.85);
                this.updateSpectatorBanner('Camera zoom reset');
            });
        }

        this.refreshSpectatorControls();
    }

    initializeRoomModeUI() {
        if (this.isSpectator) {
            return;
        }

        const modeSelect = document.getElementById('roomModeSelect');
        const pvpOptions = document.getElementById('pvpRoomOptions');
        if (!modeSelect || !pvpOptions) {
            return;
        }

        const sync = () => {
            const isPvp = modeSelect.value === 'pvp_ffa';
            pvpOptions.style.display = isPvp ? 'grid' : 'none';
        };

        modeSelect.addEventListener('change', sync);
        sync();
    }

    initializeMatchOverUI() {
        const overlay = document.getElementById('matchOverOverlay');
        const closeButton = document.getElementById('matchOverCloseButton');

        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.hideMatchOver();
                this.returnToStaging();
            });
        }

        if (overlay) {
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) {
                    this.hideMatchOver();
                    this.returnToStaging();
                }
            });
        }
    }

    showMatchOver(endData = {}) {
        const overlay = document.getElementById('matchOverOverlay');
        const meta = document.getElementById('matchOverMeta');
        const scoreboardRoot = document.getElementById('matchScoreboard');
        if (!overlay || !scoreboardRoot) {
            return;
        }

        const match = endData.match || {};
        const killLimit = Number(endData?.match?.killLimit ?? endData?.killLimit) || 0;
        const timeLimitMs = Number(endData?.match?.timeLimitMs ?? endData?.timeLimitMs) || 0;
        const reason = String(endData?.reason || '').toLowerCase();
        const winnerId = endData?.winnerId || null;
        const scoreboard = Array.isArray(endData?.scoreboard) ? endData.scoreboard : [];

        const minutes = timeLimitMs ? Math.max(1, Math.round(timeLimitMs / 60000)) : null;
        const reasonLabel = reason === 'kill_limit'
            ? 'Kill limit reached'
            : reason === 'time_limit'
                ? 'Time limit reached'
                : 'Match complete';
        if (meta) {
            const configLabel = killLimit && minutes
                ? `First to ${killLimit} eliminations. ${minutes} minute limit.`
                : killLimit
                    ? `First to ${killLimit} eliminations.`
                    : minutes
                        ? `${minutes} minute limit.`
                        : '';
            meta.textContent = `${reasonLabel}${configLabel ? ` • ${configLabel}` : ''}`;
        }

        scoreboardRoot.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'match-row header';
        header.innerHTML = `
            <div class="match-rank">#</div>
            <div>Name</div>
            <div class="match-stat">Kills</div>
            <div class="match-stat">Deaths</div>
        `;
        scoreboardRoot.appendChild(header);

        scoreboard.forEach((entry, index) => {
            const row = document.createElement('div');
            const isWinner = winnerId && entry.id === winnerId;
            row.className = `match-row${isWinner ? ' match-winner' : ''}`;
            const displayName = entry.id === this.playerId ? `${entry.name} (You)` : (entry.name || 'Operator');
            row.innerHTML = `
                <div class="match-rank">${index + 1}</div>
                <div class="match-name">${displayName}</div>
                <div class="match-stat">${Number(entry.kills || 0)}</div>
                <div class="match-stat">${Number(entry.deaths || 0)}</div>
            `;
            scoreboardRoot.appendChild(row);
        });

        overlay.style.display = 'flex';
        this.matchOver = true;

        this.hideShop();
        this.hideDeathScreen();
        this.hideRespawnOverlay();
    }

    hideMatchOver() {
        const overlay = document.getElementById('matchOverOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    returnToStaging() {
        this.hideMatchOver();
        this.hideShop();
        this.hideDeathScreen();
        this.hideRespawnOverlay();
        this.matchOver = false;
        this.inGame = false;
        this.resetGameplayInputState();
        this.applyResponsiveLayout();
        this.exitLandscapeMode();

        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.style.display = 'none';
        }

        const lobbyScreen = document.getElementById('lobbyScreen');
        if (lobbyScreen) {
            lobbyScreen.style.display = 'block';
        }

        const waitingRoom = document.getElementById('waitingRoom');
        if (waitingRoom) {
            waitingRoom.style.display = 'block';
        }

        const roomControls = document.getElementById('roomControls');
        if (roomControls) {
            roomControls.style.display = 'none';
        }

        this.updatePlayersInRoom();
    }

    handleKillFeed(entry = {}) {
        if (!this.uiManager || typeof this.uiManager.addKill !== 'function') {
            return;
        }

        const killerName = entry.killerName || entry.killerId || 'Unknown';
        const victimName = entry.victimName || entry.victimId || 'Unknown';
        const weaponLabel = this.weaponAssetCatalog?.[entry.weaponType]?.label || entry.weaponType || 'Weapon';
        this.uiManager.addKill(killerName, victimName, weaponLabel);
    }

    handleMatchEnded(endData = {}) {
        if (this.isSpectator) {
            this.updateSpectatorBanner('Match ended');
        }

        this.showMatchOver(endData);
    }

    showRespawnOverlay(secondsRemaining) {
        const overlay = document.getElementById('respawnOverlay');
        const timer = document.getElementById('respawnTimer');
        if (!overlay || !timer) {
            return;
        }

        const safeSeconds = Math.max(0, Number(secondsRemaining) || 0);
        timer.textContent = `${safeSeconds.toFixed(1)}s`;
        overlay.style.display = 'flex';
    }

    hideRespawnOverlay() {
        const overlay = document.getElementById('respawnOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    loadSelectedSkin() {
        try {
            const storedSkin = window.localStorage.getItem('selectedSkin');
            if (storedSkin) {
                return storedSkin;
            }
        } catch (error) {
            console.warn('Unable to load selected skin:', error);
        }

        return this.defaultSkinId;
    }

    loadSelectedLoadoutWeapon() {
        try {
            const storedWeapon = window.localStorage.getItem('selectedLoadoutWeapon');
            if (storedWeapon) {
                return storedWeapon;
            }
        } catch (error) {
            console.warn('Unable to load selected weapon:', error);
        }

        return this.defaultWeaponId;
    }

    saveSelectedSkin(skinTheme) {
        try {
            window.localStorage.setItem('selectedSkin', skinTheme);
        } catch (error) {
            console.warn('Unable to save selected skin:', error);
        }
    }

    saveSelectedLoadoutWeapon(weaponType) {
        try {
            window.localStorage.setItem('selectedLoadoutWeapon', weaponType);
        } catch (error) {
            console.warn('Unable to save selected weapon:', error);
        }
    }

    loadAuthToken() {
        try {
            return window.localStorage.getItem('authToken') || '';
        } catch (error) {
            console.warn('Unable to load auth token:', error);
            return '';
        }
    }

    saveAuthToken(token) {
        try {
            if (token) {
                window.localStorage.setItem('authToken', token);
            } else {
                window.localStorage.removeItem('authToken');
            }
        } catch (error) {
            console.warn('Unable to save auth token:', error);
        }
        this.authToken = token || '';
    }

    normalizeProfile(profile) {
        if (!profile) {
            return null;
        }

        const hasProfileSkins = Array.isArray(profile.availableSkins) && profile.availableSkins.length > 0;
        const hasProfileWeapons = Array.isArray(profile.availableWeapons) && profile.availableWeapons.length > 0;
        if (hasProfileSkins || hasProfileWeapons) {
            this.applyAssetManifest({
                skins: hasProfileSkins ? profile.availableSkins : this.getSkinEntries(),
                enemySprites: Object.values(this.enemySpriteCatalog),
                weapons: hasProfileWeapons ? profile.availableWeapons : this.getWeaponEntries(),
                defaultSkinId: this.defaultSkinId,
                defaultWeaponId: this.defaultWeaponId,
                defaultEnemySpriteId: this.defaultEnemySpriteId
            });
        }

        const unlockedSkins = Array.isArray(profile.unlockedSkins) && profile.unlockedSkins.length > 0
            ? Array.from(new Set(profile.unlockedSkins.filter((skinTheme) => this.skinCatalog[skinTheme])))
            : [this.defaultSkinId];
        const selectedSkin = unlockedSkins.includes(profile.selectedSkin) ? profile.selectedSkin : (unlockedSkins[0] || this.defaultSkinId);
        const unlockedWeapons = Array.isArray(profile.unlockedWeapons) && profile.unlockedWeapons.length > 0
            ? Array.from(new Set(profile.unlockedWeapons.filter((weaponType) => this.weaponAssetCatalog[weaponType]?.playable)))
            : [this.defaultWeaponId];
        const selectedWeapon = unlockedWeapons.includes(profile.selectedWeapon) ? profile.selectedWeapon : (unlockedWeapons[0] || this.defaultWeaponId);

        return {
            id: profile.id,
            username: profile.username,
            isAdmin: Boolean(profile.isAdmin),
            metaCurrency: Number.isFinite(profile.metaCurrency) ? profile.metaCurrency : 0,
            unlockedSkins,
            selectedSkin,
            unlockedWeapons,
            selectedWeapon,
            availableSkins: this.getSkinEntries(),
            availableWeapons: this.getWeaponEntries(),
            stats: {
                matchesPlayed: Number.isFinite(profile?.stats?.matchesPlayed) ? profile.stats.matchesPlayed : 0,
                bestWave: Number.isFinite(profile?.stats?.bestWave) ? profile.stats.bestWave : 0,
                totalScore: Number.isFinite(profile?.stats?.totalScore) ? profile.stats.totalScore : 0,
                totalMetaCurrencyEarned: Number.isFinite(profile?.stats?.totalMetaCurrencyEarned) ? profile.stats.totalMetaCurrencyEarned : 0
            }
        };
    }

    setProfile(profile, message = '') {
        this.profile = this.normalizeProfile(profile);

        if (this.profile?.selectedSkin) {
            this.selectedSkin = this.profile.selectedSkin;
            this.saveSelectedSkin(this.profile.selectedSkin);
        } else if (!this.skinCatalog[this.selectedSkin]) {
            this.selectedSkin = this.defaultSkinId;
            this.saveSelectedSkin(this.selectedSkin);
        }

        if (this.profile?.selectedWeapon) {
            this.selectedLoadoutWeapon = this.profile.selectedWeapon;
            this.saveSelectedLoadoutWeapon(this.profile.selectedWeapon);
        } else if (!this.weaponAssetCatalog[this.selectedLoadoutWeapon]?.playable) {
            this.selectedLoadoutWeapon = this.defaultWeaponId;
            this.saveSelectedLoadoutWeapon(this.selectedLoadoutWeapon);
        }

        if (!this.inGame) {
            this.currentWeapon = this.selectedLoadoutWeapon;
        }

        const playerNameInput = document.getElementById('playerNameInput');
        if (this.profile?.username && playerNameInput) {
            playerNameInput.value = this.profile.username;
        }

        if (this.profile?.username) {
            this.playerName = this.profile.username;
        }

        this.refreshAuthUI(message);
        this.syncLobbyIdentityState();
        this.rebuildSkinSelector();
        this.updateSkinSelector();
        this.rebuildWeaponSelector();
        this.updateWeaponSelector();
    }

    syncLobbyIdentityState() {
        const playerInfo = document.getElementById('playerInfo');
        const roomControls = document.getElementById('roomControls');
        const waitingRoom = document.getElementById('waitingRoom');
        const lobbyScreen = document.getElementById('lobbyScreen');
        const playerNameInput = document.getElementById('playerNameInput');

        if (!playerInfo || !roomControls || !playerNameInput) {
            return;
        }

        const accountName = this.profile?.username?.trim() || '';
        const currentName = (this.playerName || playerNameInput.value || '').trim();
        const effectiveName = accountName || currentName;

        if (accountName) {
            this.playerName = accountName;
            playerNameInput.value = accountName;
        }

        playerNameInput.disabled = Boolean(accountName);

        if (this.inGame || this.roomId || waitingRoom?.style.display === 'block' || lobbyScreen?.style.display === 'none') {
            return;
        }

        const hasIdentity = effectiveName.length >= 2;
        playerInfo.style.display = hasIdentity ? 'none' : 'block';
        roomControls.style.display = hasIdentity ? 'block' : 'none';
    }

    isSkinUnlocked(skinTheme) {
        if (!this.skinCatalog[skinTheme]) {
            return false;
        }

        if (this.profile) {
            return this.profile.unlockedSkins.includes(skinTheme);
        }

        return Number(this.skinCatalog[skinTheme]?.cost || 0) <= 0;
    }

    isWeaponUnlocked(weaponType) {
        if (!this.weaponAssetCatalog[weaponType]?.playable) {
            return false;
        }

        if (this.profile) {
            return this.profile.unlockedWeapons.includes(weaponType);
        }

        return Number(this.weaponAssetCatalog[weaponType]?.cost || 0) <= 0;
    }

    setAuthStatus(message = '', tone = 'neutral') {
        const authStatus = document.getElementById('authStatus');
        if (!authStatus) {
            return;
        }

        authStatus.textContent = message || (this.profile
            ? 'Progress is being saved to your account.'
            : 'Sign in to keep credits, unlock skins and weapons, and save progression.');
        authStatus.className = `auth-status ${tone}`;
    }

    setAuthBusyState(isBusy) {
        this.authBusy = isBusy;
        ['authLoginButton', 'authRegisterButton', 'authLogoutButton'].forEach((id) => {
            const button = document.getElementById(id);
            if (button) {
                button.disabled = isBusy;
            }
        });
    }

    refreshAuthUI(message = '') {
        const guestCard = document.getElementById('authGuestState');
        const accountCard = document.getElementById('authAccountState');
        const accountName = document.getElementById('authAccountName');
        const accountCurrency = document.getElementById('authMetaCurrency');
        const accountBestWave = document.getElementById('authBestWave');
        const accountMatches = document.getElementById('authMatchesPlayed');
        const accountScore = document.getElementById('authTotalScore');
        const progressionHint = document.getElementById('progressionHint');
        const adminButton = document.getElementById('openAdminConsoleButton');

        if (guestCard) {
            guestCard.style.display = this.profile ? 'none' : 'block';
        }

        if (accountCard) {
            accountCard.style.display = this.profile ? 'block' : 'none';
        }

        if (accountName) {
            accountName.textContent = this.profile?.username || 'Guest';
        }

        if (accountCurrency) {
            accountCurrency.textContent = this.profile?.metaCurrency ?? 0;
        }

        if (accountBestWave) {
            accountBestWave.textContent = this.profile?.stats?.bestWave ?? 0;
        }

        if (accountMatches) {
            accountMatches.textContent = this.profile?.stats?.matchesPlayed ?? 0;
        }

        if (accountScore) {
            accountScore.textContent = this.profile?.stats?.totalScore ?? 0;
        }

        if (progressionHint) {
            progressionHint.textContent = this.profile
                ? `Permanent credits: ${this.profile.metaCurrency}. Unlock skins and weapons here and they will carry across matches.${this.profile.isAdmin ? ' This account can also open the admin console.' : ''}`
                : 'Guest play still works, but only signed-in accounts keep credits plus permanent cosmetic and weapon unlocks.';
        }

        if (adminButton) {
            adminButton.style.display = this.profile?.isAdmin ? 'inline-flex' : 'none';
        }

        const adminNotice = new URLSearchParams(window.location.search).get('admin');
        if (!message && !this.profile?.isAdmin && adminNotice === 'required') {
            this.setAuthStatus('Sign in with an admin account to open the admin center.', 'warn');
            return;
        }
        if (!message && !this.profile?.isAdmin && adminNotice === 'forbidden') {
            this.setAuthStatus('This account does not have admin access to the admin center.', 'error');
            return;
        }

        this.setAuthStatus(message);
    }

    async apiRequest(path, { method = 'GET', body = undefined, includeAuth = true } = {}) {
        const headers = {};
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }
        if (includeAuth && this.authToken) {
            headers.Authorization = `Bearer ${this.authToken}`;
        }

        const response = await fetch(path, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || data.message || 'Request failed.');
        }

        return data;
    }

    reconnectSocketWithAuth() {
        if (this.socket) {
            try {
                this.socket.disconnect();
            } catch (error) {
                console.warn('Unable to disconnect socket during auth refresh:', error);
            }
            this.socket = null;
        }

        if (this.assetsLoaded) {
            this.connectToServer();
        }
    }

    async refreshAuthSession() {
        if (!this.authToken) {
            this.setProfile(null);
            return;
        }

        try {
            const data = await this.apiRequest('/api/auth/session');
            this.setProfile(data.profile);
        } catch (error) {
            this.saveAuthToken('');
            this.setProfile(null);
            this.setAuthStatus('Saved session expired. Please sign in again.', 'warn');
        }
    }

    async submitAuth(mode) {
        if (this.inGame || this.roomId) {
            this.setAuthStatus('Leave the current room before switching accounts.', 'warn');
            return;
        }

        const usernameInput = document.getElementById('authUsernameInput');
        const passwordInput = document.getElementById('authPasswordInput');
        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

        this.setAuthBusyState(true);
        try {
            const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
            const data = await this.apiRequest(path, {
                method: 'POST',
                body: { username, password },
                includeAuth: false
            });

            this.saveAuthToken(data.token);
            this.setProfile(data.profile);
            this.setAuthStatus(mode === 'register'
                ? 'Account created. Progress will now save on this device.'
                : 'Signed in. Your progression has been loaded.', 'success');
            if (passwordInput) {
                passwordInput.value = '';
            }
            this.reconnectSocketWithAuth();
        } catch (error) {
            this.setAuthStatus(error.message, 'error');
        } finally {
            this.setAuthBusyState(false);
        }
    }

    async logoutAccount() {
        if (this.inGame || this.roomId) {
            this.setAuthStatus('Leave the current room before signing out.', 'warn');
            return;
        }

        this.setAuthBusyState(true);
        try {
            if (this.authToken) {
                await this.apiRequest('/api/auth/logout', {
                    method: 'POST',
                    body: {}
                }).catch(() => null);
            }
            this.saveAuthToken('');
            this.profile = null;
            this.selectedSkin = this.defaultSkinId;
            this.saveSelectedSkin(this.selectedSkin);
            this.selectedLoadoutWeapon = this.defaultWeaponId;
            this.saveSelectedLoadoutWeapon(this.selectedLoadoutWeapon);
            this.currentWeapon = this.defaultWeaponId;
            this.refreshAuthUI();
            this.setAuthStatus('Signed out. Guest play is still available, but progression will not save.');
            this.updateSkinSelector();
            this.updateWeaponSelector();
            this.reconnectSocketWithAuth();
        } finally {
            this.setAuthBusyState(false);
        }
    }

    async unlockSkinTheme(skinTheme) {
        if (!this.profile) {
            this.setAuthStatus('Create or sign into an account to unlock skins.', 'warn');
            return;
        }

        try {
            const data = await this.apiRequest('/api/profile/skin/unlock', {
                method: 'POST',
                body: { skinTheme }
            });
            this.setProfile(data.profile);
            this.setAuthStatus(`${this.skinCatalog[skinTheme]?.label || 'Skin'} unlocked.`, 'success');
        } catch (error) {
            this.setAuthStatus(error.message, 'error');
        }
    }

    async selectSkinTheme(skinTheme) {
        if (!this.skinCatalog[skinTheme]) {
            return;
        }

        if (!this.profile) {
            this.selectedSkin = this.isSkinUnlocked(skinTheme) ? skinTheme : this.defaultSkinId;
            this.saveSelectedSkin(this.selectedSkin);
            this.updateSkinSelector();
            return;
        }

        try {
            const data = await this.apiRequest('/api/profile/skin/select', {
                method: 'POST',
                body: { skinTheme }
            });
            this.setProfile(data.profile);
            this.setAuthStatus(`${this.skinCatalog[skinTheme]?.label || 'Skin'} selected.`, 'success');
        } catch (error) {
            this.setAuthStatus(error.message, 'error');
        }
    }

    async unlockWeaponType(weaponType) {
        if (!this.profile) {
            this.setAuthStatus('Create or sign into an account to unlock weapons.', 'warn');
            return false;
        }

        try {
            const data = await this.apiRequest('/api/profile/weapon/unlock', {
                method: 'POST',
                body: { weaponType }
            });
            this.setProfile(data.profile);
            this.setAuthStatus(`${this.weaponAssetCatalog[weaponType]?.label || 'Weapon'} unlocked.`, 'success');
            return true;
        } catch (error) {
            this.setAuthStatus(error.message, 'error');
            return false;
        }
    }

    async selectLoadoutWeapon(weaponType) {
        if (!this.weaponAssetCatalog[weaponType]?.playable) {
            return;
        }

        if (!this.profile) {
            this.selectedLoadoutWeapon = this.isWeaponUnlocked(weaponType) ? weaponType : this.defaultWeaponId;
            this.saveSelectedLoadoutWeapon(this.selectedLoadoutWeapon);
            if (!this.inGame) {
                this.currentWeapon = this.selectedLoadoutWeapon;
            }
            this.updateWeaponSelector();
            return;
        }

        try {
            const data = await this.apiRequest('/api/profile/weapon/select', {
                method: 'POST',
                body: { weaponType }
            });
            this.setProfile(data.profile);
            this.setAuthStatus(`${this.weaponAssetCatalog[weaponType]?.label || 'Weapon'} selected.`, 'success');
        } catch (error) {
            this.setAuthStatus(error.message, 'error');
        }
    }

    initializeAuthUI() {
        const loginButton = document.getElementById('authLoginButton');
        const registerButton = document.getElementById('authRegisterButton');
        const logoutButton = document.getElementById('authLogoutButton');
        const usernameInput = document.getElementById('authUsernameInput');
        const passwordInput = document.getElementById('authPasswordInput');

        if (loginButton) {
            loginButton.addEventListener('click', () => {
                this.submitAuth('login');
            });
        }

        if (registerButton) {
            registerButton.addEventListener('click', () => {
                this.submitAuth('register');
            });
        }

        if (logoutButton) {
            logoutButton.addEventListener('click', () => {
                this.logoutAccount();
            });
        }

        if (passwordInput) {
            passwordInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.submitAuth('login');
                }
            });
        }

        [usernameInput, passwordInput].forEach((input) => {
            if (!input) {
                return;
            }

            input.addEventListener('focus', () => {
                this.resetGameplayInputState();
            });
        });

        this.refreshAuthUI();
    }

    initializeLoadoutShopUI() {
        document.querySelectorAll('[data-open-loadout-shop]').forEach((button) => {
            button.addEventListener('click', () => {
                this.openLoadoutShop();
            });
        });

        document.querySelectorAll('[data-close-loadout-shop]').forEach((button) => {
            button.addEventListener('click', () => {
                this.closeLoadoutShop();
            });
        });

        const overlay = document.getElementById('loadoutShopOverlay');
        if (overlay) {
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) {
                    this.closeLoadoutShop();
                }
            });
        }
    }

    openLoadoutShop() {
        if (this.inGame) {
            return;
        }

        const overlay = document.getElementById('loadoutShopOverlay');
        if (!overlay) {
            return;
        }

        overlay.style.display = 'flex';
        document.body.classList.add('loadout-shop-open');
        this.updateSkinSelector();
        this.updateWeaponSelector();
    }

    closeLoadoutShop() {
        const overlay = document.getElementById('loadoutShopOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }

        document.body.classList.remove('loadout-shop-open');
    }

    initializeSkinSelector() {
        const selector = document.getElementById('skinSelector');
        if (!selector) {
            return;
        }

        selector.addEventListener('click', async (event) => {
            const button = event.target.closest('.skin-option');
            if (!button) {
                return;
            }

            const skinTheme = button.dataset.skin;
            if (!skinTheme) {
                return;
            }

            if (!this.isSkinUnlocked(skinTheme)) {
                await this.unlockSkinTheme(skinTheme);
                return;
            }

            await this.selectSkinTheme(skinTheme);
        });

        this.rebuildSkinSelector();
        this.updateSkinSelector();
    }

    initializeWeaponSelector() {
        const selector = document.getElementById('weaponSelector');
        if (!selector) {
            return;
        }

        selector.addEventListener('click', async (event) => {
            const button = event.target.closest('.weapon-option');
            if (!button) {
                return;
            }

            const weaponType = button.dataset.weapon;
            if (!weaponType) {
                return;
            }

            if (!this.isWeaponUnlocked(weaponType)) {
                const unlocked = await this.unlockWeaponType(weaponType);
                if (unlocked) {
                    await this.selectLoadoutWeapon(weaponType);
                }
                return;
            }

            await this.selectLoadoutWeapon(weaponType);
        });

        this.rebuildWeaponSelector();
        this.updateWeaponSelector();
    }

    rebuildSkinSelector() {
        const selector = document.getElementById('skinSelector');
        if (!selector) {
            return;
        }

        selector.innerHTML = '';
        this.getSkinEntries().forEach((skin) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'skin-option';
            button.dataset.skin = skin.id;
            button.dataset.label = skin.label || skin.id;

            const label = document.createElement('span');
            label.className = 'skin-option-label';

            const swatch = document.createElement('span');
            swatch.className = 'skin-swatch';
            const skinUrl = this.getSkinAssetUrl(skin.id);
            if (skinUrl) {
                swatch.style.backgroundImage = `url("${skinUrl}")`;
                swatch.style.backgroundSize = 'contain';
                swatch.style.backgroundPosition = 'center';
                swatch.style.backgroundRepeat = 'no-repeat';
                swatch.style.backgroundColor = 'rgba(8, 14, 20, 0.9)';
            }

            const text = document.createElement('span');
            text.textContent = skin.label || skin.id;

            label.appendChild(swatch);
            label.appendChild(text);
            button.appendChild(label);
            selector.appendChild(button);
        });
    }

    rebuildWeaponSelector() {
        const selector = document.getElementById('weaponSelector');
        if (!selector) {
            return;
        }

        selector.innerHTML = '';
        this.getWeaponEntries().forEach((weapon) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'skin-option weapon-option';
            button.dataset.weapon = weapon.id;
            button.dataset.label = weapon.label || weapon.id;

            const label = document.createElement('span');
            label.className = 'skin-option-label';

            const swatch = document.createElement('span');
            swatch.className = 'skin-swatch';
            const weaponUrl = this.getWeaponAssetUrl(weapon.id);
            if (weaponUrl) {
                swatch.style.backgroundImage = `url("${weaponUrl}")`;
                swatch.style.backgroundSize = 'contain';
                swatch.style.backgroundPosition = 'center';
                swatch.style.backgroundRepeat = 'no-repeat';
                swatch.style.backgroundColor = 'rgba(8, 14, 20, 0.9)';
            }

            const text = document.createElement('span');
            text.textContent = weapon.label || weapon.id;

            label.appendChild(swatch);
            label.appendChild(text);
            button.appendChild(label);

            const description = document.createElement('span');
            description.className = 'skin-option-copy';
            description.textContent = weapon.description || 'Permanent account weapon unlock.';
            button.appendChild(description);

            selector.appendChild(button);
        });
    }

    initializeShopUI() {
        const screen = document.getElementById('shopOverlay');
        const modal = screen ? screen.querySelector('.shop-modal') : null;
        const upgrades = document.getElementById('shopUpgrades');
        const endVoteButton = document.getElementById('endRunVoteButton');

        if (screen) {
            screen.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
            });
        }

        if (modal) {
            modal.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
            });
        }

        if (upgrades) {
            const handlePurchasePress = (event) => {
                const button = event.target.closest('button[data-upgrade]');
                if (!button || button.disabled) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                this.requestUpgradePurchase(button.dataset.upgrade);
            };

            upgrades.addEventListener('pointerdown', handlePurchasePress);
            upgrades.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                handlePurchasePress(event);
            });
            upgrades.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-upgrade]');
                if (!button) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
            });
        }

        if (endVoteButton) {
            const handleEndVotePress = (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.requestEndMatchVote();
            };

            endVoteButton.addEventListener('pointerdown', handleEndVotePress);
            endVoteButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
            });
        }
    }

    updateSkinSelector() {
        const selector = document.getElementById('skinSelector');
        const preview = document.getElementById('selectedSkinLabel');
        const shopCredits = document.getElementById('loadoutShopCredits');
        const shopOwnedStyles = document.getElementById('loadoutShopOwnedCount');
        if (!selector) {
            return;
        }

        if (!this.isSkinUnlocked(this.selectedSkin)) {
            this.selectedSkin = this.profile?.selectedSkin || this.defaultSkinId;
            this.saveSelectedSkin(this.selectedSkin);
        }

        selector.querySelectorAll('.skin-option').forEach((button) => {
            const skinTheme = button.dataset.skin;
            const isUnlocked = this.isSkinUnlocked(skinTheme);
            const isActive = isUnlocked && skinTheme === this.selectedSkin;
            const skin = this.skinCatalog[skinTheme] || { cost: 0 };
            button.classList.toggle('active', isActive);
            button.classList.toggle('locked', !isUnlocked);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            button.title = isUnlocked
                ? (isActive ? 'Selected for your next match.' : 'Click to select this skin.')
                : (this.profile
                    ? `Unlock for ${skin.cost} credits`
                    : `Sign in to unlock for ${skin.cost} credits`);

            let meta = button.querySelector('.skin-option-meta');
            if (!meta) {
                meta = document.createElement('span');
                meta.className = 'skin-option-meta';
                button.appendChild(meta);
            }

            if (isActive) {
                meta.textContent = 'Selected';
            } else if (isUnlocked) {
                meta.textContent = this.profile ? 'Unlocked' : (skin.cost > 0 ? 'Account unlock' : 'Ready to use');
            } else if (this.profile) {
                meta.textContent = `Unlock for ${skin.cost} credits`;
            } else {
                meta.textContent = `Account unlock ${skin.cost} credits`;
            }
        });

        if (preview) {
            preview.textContent = this.skinCatalog[this.selectedSkin]?.label || this.skinCatalog[this.defaultSkinId]?.label || 'Default';
        }

        if (shopCredits) {
            shopCredits.textContent = this.profile?.metaCurrency ?? 0;
        }

        if (shopOwnedStyles) {
            const ownedCount = this.profile?.unlockedSkins?.length || 1;
            shopOwnedStyles.textContent = `${ownedCount}/${this.getSkinEntries().length}`;
        }

        this.updateLoadoutShopSummary();
    }

    updateWeaponSelector() {
        const selector = document.getElementById('weaponSelector');
        const preview = document.getElementById('selectedWeaponLabel');
        const ownedWeapons = document.getElementById('loadoutShopOwnedWeaponCount');
        if (!selector) {
            return;
        }

        if (!this.isWeaponUnlocked(this.selectedLoadoutWeapon)) {
            this.selectedLoadoutWeapon = this.profile?.selectedWeapon || this.defaultWeaponId;
            this.saveSelectedLoadoutWeapon(this.selectedLoadoutWeapon);
        }

        selector.querySelectorAll('.weapon-option').forEach((button) => {
            const weaponType = button.dataset.weapon;
            const isUnlocked = this.isWeaponUnlocked(weaponType);
            const isActive = isUnlocked && weaponType === this.selectedLoadoutWeapon;
            const weapon = this.weaponAssetCatalog[weaponType] || { cost: 0 };
            button.classList.toggle('active', isActive);
            button.classList.toggle('locked', !isUnlocked);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            button.title = isUnlocked
                ? (isActive ? 'Selected for your next deployment.' : 'Click to use this as your default starting weapon.')
                : (this.profile
                    ? `Unlock for ${weapon.cost} credits`
                    : `Sign in to unlock for ${weapon.cost} credits`);

            let meta = button.querySelector('.skin-option-meta');
            if (!meta) {
                meta = document.createElement('span');
                meta.className = 'skin-option-meta';
                button.appendChild(meta);
            }

            if (isActive) {
                meta.textContent = 'Selected';
            } else if (isUnlocked) {
                meta.textContent = this.profile ? 'Unlocked' : (weapon.cost > 0 ? 'Account unlock' : 'Ready to use');
            } else if (this.profile) {
                meta.textContent = `Unlock for ${weapon.cost} credits`;
            } else {
                meta.textContent = `Account unlock ${weapon.cost} credits`;
            }
        });

        if (preview) {
            preview.textContent = this.weaponAssetCatalog[this.selectedLoadoutWeapon]?.label
                || this.weaponAssetCatalog[this.defaultWeaponId]?.label
                || 'Pistol';
        }

        if (ownedWeapons) {
            const ownedCount = this.profile?.unlockedWeapons?.length || 1;
            ownedWeapons.textContent = `${ownedCount}/${this.getWeaponEntries().length}`;
        }

        this.updateLoadoutShopSummary();
    }

    updateLoadoutShopSummary() {
        const summary = document.getElementById('loadoutShopSummary');
        const miscAccountState = document.getElementById('miscAccountState');
        const miscInventoryState = document.getElementById('miscInventoryState');
        const skinLabel = this.skinCatalog[this.selectedSkin]?.label || 'Default operator';
        const weaponLabel = this.weaponAssetCatalog[this.selectedLoadoutWeapon]?.label
            || this.weaponAssetCatalog[this.defaultWeaponId]?.label
            || 'Pistol';
        const ownedSkinCount = this.profile?.unlockedSkins?.length || 1;
        const ownedWeaponCount = this.profile?.unlockedWeapons?.length || 1;

        if (summary) {
            summary.textContent = `Starting kit: ${skinLabel} with ${weaponLabel}. Signed-in accounts can expand this locker with permanent credits for future runs.`;
        }

        if (miscAccountState) {
            miscAccountState.textContent = this.profile
                ? `${this.profile.username} has ${this.profile.metaCurrency} permanent credits ready for skins, weapon unlocks, and future misc items.`
                : 'Sign in to keep permanent shop progress between sessions.';
        }

        if (miscInventoryState) {
            miscInventoryState.textContent = `${ownedSkinCount} skin${ownedSkinCount === 1 ? '' : 's'} and ${ownedWeaponCount} weapon${ownedWeaponCount === 1 ? '' : 's'} unlocked in this account locker.`;
        }
    }

    setShopNotice(message) {
        this.shopNoticeText = message || 'Upgrades apply instantly and last for this match.';
        const notice = document.getElementById('shopNotice');
        if (notice) {
            notice.textContent = this.shopNoticeText;
        }
    }

    getBuildSummary(player) {
        if (!player?.upgrades) {
            return 'No upgrades bought yet. Pick a direction before the next push.';
        }

        const purchased = Object.entries(player.upgrades)
            .filter(([, level]) => level > 0)
            .map(([key, level]) => `${this.shopConfig[key]?.label || key} Lv ${level}`);

        if (purchased.length === 0) {
            return 'No upgrades bought yet. Pick a direction before the next push.';
        }

        return purchased.join(' • ');
    }

    requestUpgradePurchase(upgradeType) {
        this.setShopNotice(`Build ${CLIENT_BUILD}: click received for ${upgradeType}.`);

        if (this.isSpectator) {
            this.setShopNotice(`Build ${CLIENT_BUILD}: spectators cannot buy upgrades.`);
            return;
        }

        if (!upgradeType || !this.socket || !this.connected) {
            this.setShopNotice(`Build ${CLIENT_BUILD}: not connected to server.`);
            return;
        }

        const player = this.players.get(this.playerId);
        if (!player) {
            this.setShopNotice(`Build ${CLIENT_BUILD}: player state unavailable.`);
            return;
        }

        const currentLevel = player.upgrades?.[upgradeType] || 0;
        const cost = this.getUpgradeCost(upgradeType, currentLevel);

        if (this.pendingPurchase?.upgradeType === upgradeType) {
            this.setShopNotice(`Build ${CLIENT_BUILD}: waiting for ${this.shopConfig[upgradeType]?.label || 'upgrade'} purchase confirmation...`);
            return;
        }

        this.pendingPurchase = {
            upgradeType,
            timeoutId: null
        };

        this.setShopNotice(`Build ${CLIENT_BUILD}: purchasing ${this.shopConfig[upgradeType]?.label || 'upgrade'} for $${cost}...`);

        this.pendingPurchase.timeoutId = window.setTimeout(() => {
            if (this.pendingPurchase?.upgradeType === upgradeType) {
                this.setShopNotice(`Build ${CLIENT_BUILD}: no server reply for ${upgradeType}. Reload the page.`);
            }
        }, 2500);

        this.socket.emit('buyUpgrade', upgradeType, (result) => {
            this.handleShopPurchaseResult(result);
        });
    }

    requestEndMatchVote() {
        if (this.isSpectator) {
            return;
        }

        if (!this.shopState.active) {
            this.setShopNotice(`Build ${CLIENT_BUILD}: end-run voting is only available between waves.`);
            return;
        }

        if (!this.socket || !this.connected || this.pendingEndVote) {
            return;
        }

        this.pendingEndVote = true;
        this.setShopNotice(`Build ${CLIENT_BUILD}: updating squad consent vote...`);
        this.socket.emit('voteEndMatch', (result) => {
            this.pendingEndVote = false;

            if (!result?.ok) {
                this.setShopNotice(`Build ${CLIENT_BUILD}: ${result?.reason || 'Could not update end-run vote.'}`);
                return;
            }

            const votes = result.voteState?.votes ?? 0;
            const required = result.voteState?.required ?? 0;
            if (result.completed) {
                this.setShopNotice(`Build ${CLIENT_BUILD}: all ${required} players agreed. Ending run...`);
                return;
            }

            this.setShopNotice(`Build ${CLIENT_BUILD}: ${votes}/${required} players agreed to end the run.`);
        });
    }

    handleShopPurchaseResult(result) {
        if (this.pendingPurchase?.timeoutId) {
            window.clearTimeout(this.pendingPurchase.timeoutId);
        }
        this.pendingPurchase = null;

        if (!result?.ok) {
            this.setShopNotice(`Build ${CLIENT_BUILD}: ${result?.reason || 'Upgrade could not be purchased.'}`);
            return;
        }

        if (result.player?.id) {
            this.applyConfirmedPlayerState(result.player);
        }

        const label = this.shopConfig[result.upgradeType]?.label || 'Upgrade';
        const nextLevel = result.player?.upgrades?.[result.upgradeType] ?? '?';
        const money = result.player?.money ?? '?';
        if (result.upgradeType === 'grenade') {
            const grenadeCount = result.player?.grenade?.count ?? '?';
            this.setShopNotice(`Build ${CLIENT_BUILD}: ${label} +1 purchased. Stock now ${grenadeCount}. Cash now $${money}.`);
        } else {
            this.setShopNotice(`Build ${CLIENT_BUILD}: ${label} upgraded to Lv ${nextLevel}. Cash now $${money}.`);
        }

        this.shopRenderSignature = '';
        this.updateUI(result.player || null);
        this.renderShop(result.player || null);
    }

    applyConfirmedPlayerState(playerData) {
        if (!playerData?.id) {
            return;
        }

        this.players.set(playerData.id, playerData);

        if (playerData.id !== this.playerId) {
            return;
        }

        const moneyElement = document.getElementById('money');
        const shopCurrency = document.getElementById('shopCurrency');
        if (moneyElement) {
            moneyElement.textContent = playerData.money || 0;
        }
        if (shopCurrency) {
            shopCurrency.textContent = playerData.money || 0;
        }
    }

    releaseCombatInputForShop() {
        if (this.isSpectator) {
            return;
        }

        this.mouse.pressed = false;
        this.updateMouseWorldPosition();
        const movement = this.getMovementInputState();

        if (!this.inGame || !this.connected || !this.socket) {
            return;
        }

        const neutralInput = {
            up: movement.up,
            down: movement.down,
            left: movement.left,
            right: movement.right,
            shooting: false,
            mouseX: this.mouse.worldX,
            mouseY: this.mouse.worldY,
            weaponType: this.currentWeapon
        };

        this.inputBuffer = neutralInput;
        this.socket.emit('playerInput', neutralInput);
    }

    async initializeAssets() {
        console.log('Initializing asset system...');
        await this.loadAssetManifest();

        const assetsToLoad = [
            ...this.getSkinEntries().map((skin) => [`sprite-${skin.id}`, skin.publicUrl]),
            ...Object.values(this.enemySpriteCatalog).map((sprite) => [`sprite-${sprite.id}`, sprite.publicUrl]),
            ...Object.values(this.weaponAssetCatalog).map((weapon) => [`weapon-${weapon.id}`, weapon.publicUrl])
        ];

        assetsToLoad.forEach(([name, src]) => this.assetManager.addAsset(name, src));

        await this.assetManager.loadAll(
            (loaded, total) => console.log(`Assets loaded: ${loaded}/${total}`),
            () => console.log('All sprite assets loaded')
        );

        this.assetsLoaded = true;

        setTimeout(() => {
            this.connectToServer();
        }, 100);
    }

    connectToServer() {
        const status = document.getElementById('connectionStatus');
        if (status) {
            status.textContent = `Connecting to server (${CLIENT_BUILD})...`;
            status.className = '';
        }
        
        this.socket = io({
            auth: this.authToken ? { token: this.authToken } : {}
        });
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.connected = true;
            if (status) {
                status.textContent = `Connected to server (${CLIENT_BUILD})`;
                status.className = 'connected';
            }
            
            // Update leaderboard button text when connected
            const leaderboardBtns = document.querySelectorAll('button[onclick="showLeaderboard()"]');
            leaderboardBtns.forEach(btn => {
                btn.innerHTML = '🏆 View Leaderboard';
                btn.style.background = '#ffd700';
                btn.style.color = '#000';
            });
            
            if (this.isSpectator && this.spectatorRoomId) {
                this.socket.emit('spectateRoom', this.spectatorRoomId);
            } else {
                // Refresh lobby leaderboard when connected
                setTimeout(() => refreshLobbyLeaderboard(), 500);
            }
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.connected = false;
            if (status) {
                status.textContent = `Disconnected from server (${CLIENT_BUILD})`;
                status.className = 'disconnected';
            }
            
            // Update leaderboard button text when disconnected
            const leaderboardBtns = document.querySelectorAll('button[onclick="showLeaderboard()"]');
            leaderboardBtns.forEach(btn => {
                btn.innerHTML = '🏆 View Leaderboard (Offline)';
                btn.style.background = '#999';
                btn.style.color = '#fff';
            });
        });

        this.socket.on('authState', (authState) => {
            if (authState?.authenticated && authState.profile) {
                this.setProfile(authState.profile);
                return;
            }

            if (this.authToken) {
                this.saveAuthToken('');
                this.setProfile(null);
                this.setAuthStatus('Saved session expired. Please sign in again.', 'warn');
            } else {
                this.setProfile(null);
            }
        });

        this.socket.on('profileUpdated', (profile) => {
            this.setProfile(profile, 'Progress updated.');
        });

        this.socket.on('roomList', (rooms) => {
            console.log('Received room list update:', rooms);
            this.updateRoomList(rooms);
        });
        
        this.socket.on('roomJoined', (data) => {
            this.roomId = data.roomId;
            this.playerId = data.playerId;
            this.currentRoomName = data.roomName;
            this.showWaitingRoom(data.roomName);
        });

        this.socket.on('spectatorJoined', (data) => {
            this.roomId = data.roomId;
            this.currentRoomName = data.roomName;
            this.showWaitingRoom(data.roomName);
            this.updateSpectatorBanner('Watching room');
        });

        this.socket.on('roomState', (roomState) => {
            this.handleRoomState(roomState);
        });
        
        this.socket.on('joinRoomFailed', (message) => {
            if (this.isSpectator) {
                this.updateSpectatorBanner(message || 'Unable to spectate this room.');
            } else {
                alert(message);
            }
        });
        
        this.socket.on('playerJoined', (data) => {
            console.log(`Player ${data.playerName} joined the room`);
            this.updatePlayersInRoom();
        });
        
        this.socket.on('playerLeft', (playerId) => {
            console.log(`Player ${playerId} left the room`);
            this.players.delete(playerId);
            // Clean up sprite animation for this player
            this.spriteRenderer.removeEntity(playerId);
            this.updatePlayersInRoom();
        });
        
        this.socket.on('gameStarted', () => {
            this.startGame();
        });

        this.socket.on('arenaState', (arenaState) => {
            this.applyArenaState(arenaState);
        });
        
        this.socket.on('gameState', (gameState) => {
            this.updateGameState(gameState);
        });

        this.socket.on('waveStart', (waveData) => {
            console.log(`Wave ${waveData.wave} started! ${waveData.enemyCount} enemies incoming`);
            this.waveInfo = {
                ...this.waveInfo,
                ...(waveData || {})
            };
            this.showWaveNotification(waveData);
        });

        this.socket.on('gameEnded', (endData) => {
            if (this.isSpectator) {
                this.updateSpectatorBanner(`Match ended on wave ${endData.finalWave}`);
            }
            this.showGameOver(endData.finalWave, endData.leaderboard);
        });

        this.socket.on('leaderboard', (leaderboard) => {
            console.log('Received leaderboard data:', leaderboard);
            
            // Check if this is for the modal or lobby
            if (this.showingFullLeaderboard) {
                console.log('Displaying full leaderboard modal');
                this.displayLeaderboard(leaderboard);
                this.showingFullLeaderboard = false;
            } else {
                console.log('Updating lobby leaderboard only');
                updateLobbyLeaderboard(leaderboard);
            }
        });

        this.socket.on('gameEndedPersonal', (endData) => {
            this.showPersonalGameOver(endData);
        });

        this.socket.on('shopStarted', (shopData) => {
            this.shopState = {
                active: true,
                endsAt: shopData.endsAt,
                durationMs: shopData.durationMs
            };
            this.showShop();
        });

        this.socket.on('shopError', (message) => {
            console.warn('Shop error:', message);
            this.setShopNotice(`Build ${CLIENT_BUILD}: ${message || 'Upgrade could not be purchased.'}`);
        });

        this.socket.on('shopPurchaseResult', (result) => {
            this.handleShopPurchaseResult(result);
        });

        this.socket.on('grenadeExploded', (grenadeData) => {
            this.handleGrenadeExplosion(grenadeData);
        });

        this.socket.on('killFeed', (entry) => {
            this.handleKillFeed(entry);
        });

        this.socket.on('matchEnded', (endData) => {
            this.handleMatchEnded(endData);
        });
    }

    setupEventListeners() {
        if (this.isSpectator) {
            document.addEventListener('keydown', (e) => {
                if (this.isEditableElement(e.target)) {
                    return;
                }

                if (e.code === 'Equal' || e.code === 'NumpadAdd') {
                    this.cameraSystem.setZoom(this.cameraSystem.zoom + 0.2);
                    e.preventDefault();
                }
                if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
                    this.cameraSystem.setZoom(this.cameraSystem.zoom - 0.2);
                    e.preventDefault();
                }
                if (e.code === 'Digit0' || e.code === 'Numpad0') {
                    this.cameraSystem.setZoom(1.0);
                    e.preventDefault();
                }
            });

            this.canvas.addEventListener('wheel', (e) => {
                if (this.inGame) {
                    const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
                    this.cameraSystem.setZoom(this.cameraSystem.zoom + zoomDelta);
                    e.preventDefault();
                }
            });

            return;
        }

        // Keyboard events
        document.addEventListener('keydown', (e) => {
            if (this.isEditableElement(e.target)) {
                return;
            }

            this.keys[e.code] = true;
            
            const digitMatch = /^Digit([1-9])$/.exec(e.code);
            if (digitMatch) {
                const weaponIndex = Math.max(0, Number(digitMatch[1]) - 1);
                const weaponOrder = this.getWeaponOrder();
                const requestedWeapon = weaponOrder[weaponIndex];
                if (requestedWeapon) {
                    this.switchWeapon(requestedWeapon);
                }
                e.preventDefault();
            }

            if (e.code === 'KeyR' && !e.repeat && this.inGame && !this.shopState.active) {
                this.requestWeaponReload();
                e.preventDefault();
            }

            if (e.code === 'KeyG' && !e.repeat && this.inGame && !this.shopState.active) {
                this.startGrenadeCharge();
                e.preventDefault();
            }
            
            // Respawn on space
            if (e.code === 'Space' && this.inGame) {
                const myPlayer = this.players.get(this.playerId);
                if (myPlayer && !myPlayer.alive) {
                    this.requestRespawn();
                }
                e.preventDefault();
            }
            
            // Camera zoom controls
            if (e.code === 'Equal' || e.code === 'NumpadAdd') { // + key
                this.cameraSystem.setZoom(this.cameraSystem.zoom + 0.2);
                e.preventDefault();
            }
            if (e.code === 'Minus' || e.code === 'NumpadSubtract') { // - key
                this.cameraSystem.setZoom(this.cameraSystem.zoom - 0.2);
                e.preventDefault();
            }
            if (e.code === 'Digit0' || e.code === 'Numpad0') { // 0 key - reset zoom
                this.cameraSystem.setZoom(1.0);
                e.preventDefault();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (this.isEditableElement(e.target)) {
                return;
            }

            this.keys[e.code] = false;
            if (e.code === 'KeyG') {
                this.releaseGrenadeCharge();
                e.preventDefault();
            }
        });

        // Mouse events
        this.canvas.addEventListener('mousemove', (e) => {
            const canvasPosition = this.getCanvasCoordinates(e.clientX, e.clientY);
            this.mouse.x = canvasPosition.x;
            this.mouse.y = canvasPosition.y;
            this.updateMouseWorldPosition();
        });

        this.canvas.addEventListener('mousedown', (e) => {
            this._initAudioCtx(); // unlock AudioContext on first interaction
            if (this.shopState.active) {
                this.mouse.pressed = false;
                e.preventDefault();
                return;
            }

            if (e.button === 0) {
                this.mouse.pressed = true;
                if (this.weaponSystem.getWeapon(this.currentWeapon)?.chargeTime > 0) {
                    this.fireWeapon();
                }
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            if (this.shopState.active) {
                this.mouse.pressed = false;
                this.cancelLocalWeaponCharge();
                e.preventDefault();
                return;
            }

            if (e.button === 0) {
                this.mouse.pressed = false;
                this.cancelLocalWeaponCharge();
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.mouse.pressed = false;
            this.cancelLocalWeaponCharge();
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.mouse.pressed = false;
                this.cancelLocalWeaponCharge();
            }
        });

        window.addEventListener('blur', () => {
            this.resetGameplayInputState();
            this.resetMobileControlState();
        });

        // Mouse wheel weapon cycling
        this.canvas.addEventListener('wheel', (e) => {
            if (this.inGame) {
                if (e.ctrlKey) {
                    const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
                    this.cameraSystem.setZoom(this.cameraSystem.zoom + zoomDelta);
                } else if (e.deltaY !== 0) {
                    this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
                }
                e.preventDefault();
            }
        });
        
    }

    updateMouseWorldPosition() {
        if (this.applyMobileAimToMouse()) {
            return;
        }

        try {
            const shakeX = this.cameraSystem?.shake ? this.cameraSystem.shake.x : 0;
            const shakeY = this.cameraSystem?.shake ? this.cameraSystem.shake.y : 0;
            const cameraX = this.cameraSystem ? this.cameraSystem.x + shakeX : 0;
            const cameraY = this.cameraSystem ? this.cameraSystem.y + shakeY : 0;
            this.mouse.worldX = this.mouse.x + cameraX;
            this.mouse.worldY = this.mouse.y + cameraY;
        } catch (error) {
            this.mouse.worldX = this.mouse.x;
            this.mouse.worldY = this.mouse.y;
        }
    }

    getWeaponMagazineSize(weaponType = this.currentWeapon) {
        return this.weaponSystem.getWeapon(weaponType)?.magazineSize || 1;
    }

    getPlayerAmmoForWeapon(player, weaponType = this.currentWeapon) {
        if (!player) {
            return this.getWeaponMagazineSize(weaponType);
        }

        const ammoValue = player?.ammo?.[weaponType];
        if (Number.isFinite(ammoValue)) {
            return ammoValue;
        }

        if (player.currentWeapon === weaponType && Number.isFinite(player.currentAmmo)) {
            return player.currentAmmo;
        }

        return this.getWeaponMagazineSize(weaponType);
    }

    getPlayerReloadState(player) {
        const reload = player?.reload || {};
        const weaponType = reload.weaponType || null;
        const endsAt = Number.isFinite(reload.endsAt) ? reload.endsAt : 0;
        const durationMs = Number.isFinite(reload.durationMs)
            ? reload.durationMs
            : (weaponType ? this.weaponSystem.getWeapon(weaponType)?.reloadTime || 0 : 0);
        const active = Boolean(reload.active && weaponType && endsAt > Date.now());

        return {
            active,
            weaponType,
            endsAt,
            durationMs
        };
    }

    isPlayerReloadingWeapon(player, weaponType = this.currentWeapon) {
        const reloadState = this.getPlayerReloadState(player);
        return reloadState.active && reloadState.weaponType === weaponType;
    }

    getChargeStateSnapshot(chargeState = null) {
        const weaponType = chargeState?.weaponType || null;
        const active = Boolean(chargeState?.active && weaponType);
        const durationMs = Number.isFinite(chargeState?.durationMs)
            ? chargeState.durationMs
            : (weaponType ? this.weaponSystem.getWeapon(weaponType)?.chargeTime || 0 : 0);
        const endsAt = Number.isFinite(chargeState?.endsAt) ? chargeState.endsAt : 0;
        const startedAt = Number.isFinite(chargeState?.startedAt)
            ? chargeState.startedAt
            : (durationMs > 0 && endsAt > 0 ? endsAt - durationMs : 0);
        const progress = active && durationMs > 0
            ? Math.min(1, Math.max(0, (Date.now() - startedAt) / durationMs))
            : 0;

        return {
            active,
            weaponType,
            startedAt,
            endsAt,
            durationMs,
            progress,
            ready: active && endsAt <= Date.now()
        };
    }

    getPlayerChargeState(player, weaponType = this.currentWeapon) {
        const localCharge = this.getChargeStateSnapshot(this.weaponChargeState);
        const serverCharge = this.getChargeStateSnapshot(player?.charge || null);

        if (player?.id === this.playerId) {
            if (localCharge.active && localCharge.weaponType === weaponType) {
                return localCharge;
            }

            if (
                serverCharge.active
                && serverCharge.weaponType === weaponType
                && this.lastFireTime < serverCharge.startedAt
            ) {
                return serverCharge;
            }
        }

        if (serverCharge.active && serverCharge.weaponType === weaponType) {
            return serverCharge;
        }

        return {
            active: false,
            weaponType: null,
            startedAt: 0,
            endsAt: 0,
            durationMs: 0,
            progress: 0,
            ready: false
        };
    }

    startLocalWeaponCharge(weaponType = this.currentWeapon, now = Date.now()) {
        const durationMs = this.weaponSystem.getWeapon(weaponType)?.chargeTime || 0;
        if (durationMs <= 0) {
            this.cancelLocalWeaponCharge();
            return;
        }

        this.weaponChargeState = {
            active: true,
            weaponType,
            startedAt: now,
            endsAt: now + durationMs,
            durationMs
        };
    }

    syncLocalWeaponCharge(chargeState = null) {
        const snapshot = this.getChargeStateSnapshot(chargeState);
        if (!snapshot.active || !snapshot.weaponType) {
            this.cancelLocalWeaponCharge();
            return snapshot;
        }

        this.weaponChargeState = {
            active: true,
            weaponType: snapshot.weaponType,
            startedAt: snapshot.startedAt,
            endsAt: snapshot.endsAt,
            durationMs: snapshot.durationMs
        };

        return snapshot;
    }

    armChargedShot(weaponType = this.currentWeapon) {
        this.queuedChargedShot = {
            active: true,
            weaponType
        };
    }

    disarmChargedShot(weaponType = null) {
        if (weaponType && this.queuedChargedShot.weaponType !== weaponType) {
            return;
        }

        this.queuedChargedShot = {
            active: false,
            weaponType: null
        };
    }

    cancelLocalWeaponCharge() {
        this.weaponChargeState = {
            active: false,
            weaponType: null,
            startedAt: 0,
            endsAt: 0,
            durationMs: 0
        };
    }

    clearReloadRequestLock(weaponType = null) {
        if (weaponType && this.reloadRequestLock.weaponType !== weaponType) {
            return;
        }

        this.reloadRequestLock = {
            weaponType: null,
            until: 0
        };
    }

    getWeaponVisualProfile(weaponType = this.currentWeapon) {
        const weapon = this.weaponSystem.getWeapon(weaponType);
        return {
            holdOffset: Number.isFinite(weapon?.holdOffset) ? weapon.holdOffset : 18,
            muzzleOffset: Number.isFinite(weapon?.muzzleOffset) ? weapon.muzzleOffset : 16,
            ejectBackOffset: Number.isFinite(weapon?.ejectBackOffset) ? weapon.ejectBackOffset : 5,
            ejectSideOffset: Number.isFinite(weapon?.ejectSideOffset) ? weapon.ejectSideOffset : -7
        };
    }

    getWeaponAnchorPoints(player, angle, weaponType = this.currentWeapon) {
        const profile = this.getWeaponVisualProfile(weaponType);
        const forwardX = Math.cos(angle);
        const forwardY = Math.sin(angle);
        const sideX = -Math.sin(angle);
        const sideY = Math.cos(angle);
        const weaponX = player.x + forwardX * profile.holdOffset;
        const weaponY = player.y + forwardY * profile.holdOffset;

        return {
            weaponX,
            weaponY,
            muzzleX: weaponX + forwardX * profile.muzzleOffset,
            muzzleY: weaponY + forwardY * profile.muzzleOffset,
            ejectX: weaponX - forwardX * profile.ejectBackOffset + sideX * profile.ejectSideOffset,
            ejectY: weaponY - forwardY * profile.ejectBackOffset + sideY * profile.ejectSideOffset
        };
    }

    updateSpectatorBanner(message = '') {
        const banner = document.getElementById('spectatorStatus');
        if (!banner) {
            return;
        }

        const roomName = this.currentRoomName ? `Watching ${this.currentRoomName}` : 'Spectator mode';
        banner.textContent = message ? `${roomName} - ${message}` : roomName;
    }

    refreshSpectatorControls() {
        if (!this.isSpectator) {
            return;
        }

        const cameraModeSelect = document.getElementById('spectatorCameraMode');
        const playerTargetSelect = document.getElementById('spectatorPlayerTarget');
        if (!playerTargetSelect) {
            return;
        }

        const knownPlayers = this.roomRoster.length > 0
            ? this.roomRoster
            : Array.from(this.players.values()).map((player) => ({
                id: player.id,
                name: player.name,
                alive: player.alive
            }));

        const previousSelection = this.spectatorTargetPlayerId;
        playerTargetSelect.innerHTML = '<option value="">Auto select</option>';

        knownPlayers.forEach((player) => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = player.alive === false ? `${player.name} (down)` : player.name;
            playerTargetSelect.appendChild(option);
        });

        const selectionStillExists = knownPlayers.some((player) => player.id === previousSelection);
        this.spectatorTargetPlayerId = selectionStillExists ? previousSelection : '';
        playerTargetSelect.value = this.spectatorTargetPlayerId;
        playerTargetSelect.disabled = this.spectatorCameraMode !== 'follow';

        if (cameraModeSelect) {
            cameraModeSelect.value = this.spectatorCameraMode;
        }
    }

    getSpectatorFocusPoint() {
        if (this.spectatorCameraMode === 'follow' && this.spectatorTargetPlayerId) {
            const targetPlayer = this.players.get(this.spectatorTargetPlayerId);
            if (targetPlayer) {
                return { x: targetPlayer.x, y: targetPlayer.y };
            }
        }

        const livingPlayers = Array.from(this.players.values()).filter((player) => player.alive);
        const focusGroup = livingPlayers.length > 0
            ? livingPlayers
            : (this.players.size > 0 ? Array.from(this.players.values()) : Array.from(this.enemies.values()));

        if (!focusGroup.length) {
            return null;
        }

        const center = focusGroup.reduce((accumulator, entity) => {
            accumulator.x += entity.x;
            accumulator.y += entity.y;
            return accumulator;
        }, { x: 0, y: 0 });

        center.x /= focusGroup.length;
        center.y /= focusGroup.length;
        return center;
    }

    updateInput() {
        if (this.isSpectator) return;
        if (this.matchOver) return;
        if (!this.inGame || !this.connected) return;
        
        const now = Date.now();
        if (now - this.lastInputTime < 16) return; // ~60fps input rate
        
        this.lastInputTime = now;
        this.sendInput();
    }

    sendInput() {
        if (this.isSpectator) {
            return;
        }

        this.updateMouseWorldPosition();
        const player = this.players.get(this.playerId);
        const movement = this.getMovementInputState();
        const desktopShootingPressed = Boolean(this.mouse.pressed);
        const mobileShootingPressed = Boolean(this.getMobileAutoFireTarget(player, this.weaponSystem.getWeapon(this.currentWeapon)));
        
        // Weapon firing logic
        const currentTime = Date.now();
        const weapon = this.weaponSystem.getWeapon(this.currentWeapon);
        const queuedChargeActive = Boolean(this.queuedChargedShot.active && this.queuedChargedShot.weaponType === this.currentWeapon);
        const shootingPressed = Boolean(desktopShootingPressed || mobileShootingPressed || queuedChargeActive);
        const canFire = currentTime - this.lastFireTime >= weapon.cooldown;
        const hasAmmo = this.getPlayerAmmoForWeapon(player, this.currentWeapon) > 0;
        const isReloading = this.isPlayerReloadingWeapon(player, this.currentWeapon);
        const canUseWeapon = Boolean(this.inGame && !this.shopState.active && hasAmmo && !isReloading);
        const shouldFire = Boolean(canFire && canUseWeapon && shootingPressed);
        
        if (!player?.alive || !canUseWeapon) {
            this.cancelLocalWeaponCharge();
            this.disarmChargedShot(this.currentWeapon);
        }

        if (weapon.chargeTime > 0) {
            const localCharge = this.getChargeStateSnapshot(this.weaponChargeState);
            if (canUseWeapon && shootingPressed && canFire) {
                if (!localCharge.active || localCharge.weaponType !== this.currentWeapon) {
                    this.fireWeapon();
                } else if (localCharge.ready && queuedChargeActive) {
                    this.fireWeapon({ ignoreCharge: true });
                }
            } else if (!shootingPressed && !queuedChargeActive) {
                this.cancelLocalWeaponCharge();
            }
        } else {
            if (!shootingPressed) {
                this.cancelLocalWeaponCharge();
            }

            if (shouldFire) {
                this.fireWeapon();
            }
        }

        const newInput = {
            up: movement.up,
            down: movement.down,
            left: movement.left,
            right: movement.right,
            shooting: shootingPressed,
            mouseX: this.mouse.worldX,
            mouseY: this.mouse.worldY,
            weaponType: this.currentWeapon
        };
        
        // Only send if input changed
        if (JSON.stringify(newInput) !== JSON.stringify(this.inputBuffer)) {
            this.inputBuffer = newInput;
            this.socket.emit('playerInput', newInput);
        }
    }

    handleChargedWeaponFireResult(result, weapon, angle, weaponAnchors, currentTime, player) {
        if (result?.player?.id) {
            this.applyConfirmedPlayerState(result.player);
        }

        if (result?.charge) {
            this.syncLocalWeaponCharge(result.charge);
            this.armChargedShot(result.weaponType || this.currentWeapon);
        } else if (!result?.charging) {
            this.cancelLocalWeaponCharge();
        }

        if (!result?.ok) {
            if (result?.reason === 'Magazine empty') {
                this.disarmChargedShot(this.currentWeapon);
                this.requestWeaponReload({ auto: true });
            } else if (!result?.charging) {
                this.disarmChargedShot(this.currentWeapon);
            }
            this.updateUI(result?.player || null);
            return;
        }

        this.disarmChargedShot(this.currentWeapon);
        const confirmedPlayer = this.players.get(this.playerId) || player;
        this.playLocalWeaponFireEffects(confirmedPlayer, weapon, angle, weaponAnchors, currentTime);
        this.updateUI(result.player || confirmedPlayer);
    }

    // Weapon System Methods
    requestRespawn() {
        if (this.isSpectator || !this.inGame || !this.socket) {
            return;
        }

        const myPlayer = this.players.get(this.playerId);
        if (!myPlayer || myPlayer.alive) {
            return;
        }

        this.socket.emit('respawn');
        this.hideDeathScreen();
    }

    requestEndGame() {
        if (this.isSpectator || !this.socket) {
            return;
        }

        this.socket.emit('endGame');
        this.hideDeathScreen();
    }

    requestWeaponReload(options = {}) {
        if (this.isSpectator || !this.inGame || this.shopState.active || !this.socket) {
            return;
        }

        const player = this.players.get(this.playerId);
        if (!player || !player.alive) {
            return;
        }

        const autoTriggered = Boolean(options.auto);
        const weaponType = this.currentWeapon;
        const now = Date.now();
        if (this.reloadRequestLock.weaponType === weaponType && now < this.reloadRequestLock.until) {
            return;
        }

        this.cancelLocalWeaponCharge();
        this.disarmChargedShot(weaponType);
        const currentAmmo = this.getPlayerAmmoForWeapon(player, weaponType);
        const maxAmmo = this.getWeaponMagazineSize(weaponType);
        if (this.isPlayerReloadingWeapon(player, weaponType) || currentAmmo >= maxAmmo) {
            this.clearReloadRequestLock(weaponType);
            return;
        }

        const reloadDuration = this.weaponSystem.getWeapon(weaponType).reloadTime;
        this.reloadRequestLock = {
            weaponType,
            until: now + reloadDuration + 250
        };

        player.reload = {
            active: true,
            weaponType,
            endsAt: now + reloadDuration,
            durationMs: reloadDuration
        };
        this.spriteRenderer.setState(player.id, 'reload');
        this.updateUI();

        if (!autoTriggered) {
            this.mouse.pressed = false;
        }

        this.socket.emit('reloadWeapon', weaponType, (result) => {
            if (result?.ok) {
                player.reload = {
                    active: true,
                    weaponType: result.weaponType || weaponType,
                    endsAt: result.endsAt,
                    durationMs: result.durationMs || reloadDuration
                };
            } else if (player.reload?.weaponType === weaponType) {
                player.reload = {
                    active: false,
                    weaponType: null,
                    endsAt: 0,
                    durationMs: 0
                };
                this.clearReloadRequestLock(weaponType);
            }

            this.updateUI();
        });
    }

    getPlayerGrenadeState(player) {
        const grenade = player?.grenade || {};
        const maxCount = Number.isFinite(grenade.maxCount) ? grenade.maxCount : 0;
        const count = Number.isFinite(grenade.count) ? grenade.count : maxCount;
        const cooldownEndsAt = Number.isFinite(grenade.cooldownEndsAt) ? grenade.cooldownEndsAt : 0;
        const cooldownDurationMs = Number.isFinite(grenade.cooldownDurationMs) ? grenade.cooldownDurationMs : 0;
        const minThrowScale = Number.isFinite(grenade.minThrowScale) ? grenade.minThrowScale : 0.35;
        const maxThrowScale = Number.isFinite(grenade.maxThrowScale) ? grenade.maxThrowScale : 1.1;
        const chargeTimeMs = Number.isFinite(grenade.chargeTimeMs) ? grenade.chargeTimeMs : 900;
        const remainingCooldownMs = Math.max(0, cooldownEndsAt - Date.now());
        return {
            count,
            maxCount,
            cooldownEndsAt,
            cooldownDurationMs,
            minThrowScale,
            maxThrowScale,
            chargeTimeMs,
            remainingCooldownMs,
            ready: count > 0 && remainingCooldownMs <= 0
        };
    }

    getGrenadeChargeSnapshot(player = this.players.get(this.playerId), now = Date.now()) {
        const grenadeState = this.getPlayerGrenadeState(player);
        const minThrowScale = grenadeState.minThrowScale;
        const maxThrowScale = grenadeState.maxThrowScale;
        const durationMs = Number.isFinite(this.grenadeChargeState.durationMs) && this.grenadeChargeState.durationMs > 0
            ? this.grenadeChargeState.durationMs
            : Math.max(1, grenadeState.chargeTimeMs || 900);
        const startedAt = Number.isFinite(this.grenadeChargeState.startedAt) ? this.grenadeChargeState.startedAt : 0;
        const active = Boolean(this.grenadeChargeState.active && durationMs > 0);
        const progress = active
            ? Math.max(0, Math.min(1, (now - startedAt) / durationMs))
            : 0;
        const throwScale = minThrowScale + ((maxThrowScale - minThrowScale) * progress);

        return {
            active,
            startedAt,
            durationMs,
            progress,
            chargeRatio: progress,
            minThrowScale,
            maxThrowScale,
            throwScale,
            ready: active && progress >= 1
        };
    }

    startGrenadeCharge(now = Date.now()) {
        if (this.isSpectator || !this.inGame || this.shopState.active) {
            return false;
        }

        const player = this.players.get(this.playerId);
        if (!player || !player.alive) {
            return false;
        }

        const grenadeState = this.getPlayerGrenadeState(player);
        if (grenadeState.count <= 0 || grenadeState.remainingCooldownMs > 0) {
            this.updateUI();
            return false;
        }

        if (this.grenadeChargeState.active) {
            return true;
        }

        this.updateMouseWorldPosition();
        this.grenadeChargeState = {
            active: true,
            startedAt: now,
            durationMs: Math.max(1, grenadeState.chargeTimeMs || 900)
        };
        this.updateUI();
        return true;
    }

    cancelGrenadeCharge(options = {}) {
        const wasActive = this.grenadeChargeState?.active;
        this.grenadeChargeState = {
            active: false,
            startedAt: 0,
            durationMs: 0
        };

        if (wasActive && !options.silent) {
            this.updateUI();
        }
    }

    releaseGrenadeCharge() {
        if (!this.grenadeChargeState.active) {
            return;
        }

        const player = this.players.get(this.playerId);
        const chargeState = this.getGrenadeChargeSnapshot(player);
        this.cancelGrenadeCharge({ silent: true });

        if (!player || !player.alive || !this.inGame || this.shopState.active) {
            this.updateUI();
            return;
        }

        this.requestGrenadeThrow({ chargeRatio: chargeState.chargeRatio });
        this.updateUI();
    }

    requestGrenadeThrow(options = {}) {
        if (this.isSpectator || !this.inGame || this.shopState.active || !this.socket) {
            return;
        }

        const player = this.players.get(this.playerId);
        if (!player || !player.alive) {
            return;
        }

        const grenadeState = this.getPlayerGrenadeState(player);
        const now = Date.now();
        if (now < this.grenadeRequestLockUntil || grenadeState.count <= 0 || grenadeState.remainingCooldownMs > 0) {
            this.updateUI();
            return;
        }

        this.grenadeRequestLockUntil = now + 250;
        this.updateMouseWorldPosition();
        const chargeRatio = Math.max(0, Math.min(1, Number(options?.chargeRatio) || 0));
        this.socket.emit('throwGrenade', { chargeRatio }, (result) => {
            this.grenadeRequestLockUntil = 0;
            if (result?.player?.id) {
                this.applyConfirmedPlayerState(result.player);
            }

            if (!result?.ok) {
                this.updateUI(result?.player || null);
                return;
            }

            if (result.grenade?.id) {
                this.grenades.set(result.grenade.id, result.grenade);
            }

            const myPlayer = this.players.get(this.playerId) || result.player || player;
            if (myPlayer) {
                this.spriteRenderer.setState(myPlayer.id, 'shoot');
                this.cameraSystem.startScreenShake(6, 180);
                this.particleSystem.emit(myPlayer.x, myPlayer.y, 'smokeTrail', myPlayer.angle || 0, 0.8);
            }

            this.updateUI(result.player || null);
        });
    }

    handleGrenadeExplosion(grenadeData = {}) {
        const explosionX = Number.isFinite(grenadeData.x) ? grenadeData.x : null;
        const explosionY = Number.isFinite(grenadeData.y) ? grenadeData.y : null;
        if (!Number.isFinite(explosionX) || !Number.isFinite(explosionY)) {
            return;
        }

        this.particleSystem.emit(explosionX, explosionY, 'explosion', 0, 1.45);
        this.particleSystem.emit(explosionX, explosionY, 'hitSpark', 0, 1.8);
        this.particleSystem.emit(explosionX, explosionY, 'smokeTrail', Math.PI / 2, 1.2);

        const localPlayer = this.players.get(this.playerId);
        if (localPlayer) {
            const distance = Math.hypot(localPlayer.x - explosionX, localPlayer.y - explosionY);
            const radius = Number.isFinite(grenadeData.radius) ? grenadeData.radius : 120;
            if (distance < radius * 1.3) {
                const intensity = Math.max(0.25, 1 - (distance / Math.max(radius * 1.3, 1)));
                this.cameraSystem.startScreenShake(14 * intensity, 260);
            }
        }
    }

    fireWeapon(options = {}) {
        if (this.isSpectator) {
            return;
        }

        if (this.shopState.active) {
            return;
        }

        const currentTime = Date.now();
        const weapon = this.weaponSystem.getWeapon(this.currentWeapon);
        this.updateMouseWorldPosition();
        const ignoreCharge = Boolean(options.ignoreCharge);

        if (currentTime - this.lastFireTime < weapon.cooldown) {
            return;
        }
        
        // Get player position (assuming we have current player data)
        const player = this.players.get(this.playerId);
        if (!player) return;
        if (!player.alive) return;

        if (this.isPlayerReloadingWeapon(player, this.currentWeapon)) {
            return;
        }

        if (this.getPlayerAmmoForWeapon(player, this.currentWeapon) <= 0) {
            this.disarmChargedShot(this.currentWeapon);
            this.requestWeaponReload({ auto: true });
            return;
        }

        if (weapon.chargeTime > 0) {
            const chargeState = this.getChargeStateSnapshot(this.weaponChargeState);
            if (!ignoreCharge) {
                if (!chargeState.active || chargeState.weaponType !== this.currentWeapon) {
                    this.startLocalWeaponCharge(this.currentWeapon, currentTime);
                    this.armChargedShot(this.currentWeapon);
                } else {
                    this.armChargedShot(this.currentWeapon);
                    if (!chargeState.ready) {
                        return;
                    }
                }
            }
        }

        // Calculate firing angle toward mouse (use world coordinates)
        const angle = Math.atan2(this.mouse.worldY - player.y, this.mouse.worldX - player.x);
        const weaponAnchors = this.getWeaponAnchorPoints(player, angle, this.currentWeapon);

        if (weapon.chargeTime > 0) {
            this.socket.emit('playerShoot', this.currentWeapon, (result) => {
                this.handleChargedWeaponFireResult(result, weapon, angle, weaponAnchors, currentTime, player);
            });
            return;
        }

        this.playLocalWeaponFireEffects(player, weapon, angle, weaponAnchors, currentTime);
        
        // Send shoot command to server with current weapon type
        this.socket.emit('playerShoot', this.currentWeapon);
        
        console.log(`Fired ${weapon.name}! Pellets: ${weapon.pelletCount}, Damage: ${weapon.damage}`);
    }

    playLocalWeaponFireEffects(player, weapon, angle, weaponAnchors, fireTime = Date.now()) {
        this.cancelLocalWeaponCharge();
        this.disarmChargedShot();

        // Update fire time
        this.lastFireTime = fireTime;
        
        // Trigger shooting animation
        this.spriteRenderer.setState(player.id, 'shoot');
        
        // Create modern particle effects
        this.createMuzzleFlash(weaponAnchors.muzzleX, weaponAnchors.muzzleY, angle, weapon);
        
        // Create advanced screen shake
        this.cameraSystem.startScreenShake(weapon.recoilForce * 2.2, weapon.muzzleFlashDuration * 2.3);
        
        // Eject shell casing
        if (weapon.shellEjection) {
            this.ejectShellCasing(weaponAnchors.ejectX, weaponAnchors.ejectY, angle, weapon);
        }
        
        // Update crosshair spread
        this.updateCrosshairSpread(Math.max(weapon.energyBeam ? 10 : 0, weapon.spread * 50));
        
        // Play sound effect (placeholder - you can implement actual sound)
        this.playWeaponSound(weapon.sound);

        console.log(`Fired ${weapon.name}! Pellets: ${weapon.pelletCount}, Damage: ${weapon.damage}`);
    }

    createMuzzleFlash(x, y, angle, weapon) {
        const flashPreset = weapon.energyBeam ? 'laserMuzzleFlash' : 'muzzleFlash';
        this.particleSystem.emit(x, y, flashPreset, angle, weapon.energyBeam ? 1.1 : 1.0);
        
        const smokeTrailScale = Number.isFinite(weapon?.smokeTrailScale) ? weapon.smokeTrailScale : 0;
        if (smokeTrailScale > 0.01) {
            this.particleSystem.emit(x, y, 'smokeTrail', angle, smokeTrailScale);
        } else if (weapon.energyBeam) {
            this.particleSystem.emit(x, y, 'hitSpark', angle, 0.6);
        }
    }

    ejectShellCasing(x, y, angle, weapon) {
        const directionBias = Number.isFinite(weapon?.shellEjectAngleBias) ? weapon.shellEjectAngleBias : -0.08;
        this.particleSystem.emit(x, y, 'shellCasing', angle - Math.PI / 2 + directionBias, 1.0);
    }

    updateCrosshairSpread(spread) {
        // Update crosshair spread in UI system
        if (this.uiManager) {
            const crosshair = this.uiManager.elements.get('crosshair');
            if (crosshair) {
                crosshair.spread = Math.max(crosshair.spread, spread);
            }
        }
    }

    playWeaponSound(soundName) {
        try {
            this._initAudioCtx();
            const ac = this.audioCtx;
            if (!ac) return;
            const t = ac.currentTime;

            if (soundName === 'pistol_fire') {
                // Sharp crack: short noise burst + pitched click
                const buf = ac.createBuffer(1, ac.sampleRate * 0.18, ac.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) {
                    const env = Math.exp(-i / (ac.sampleRate * 0.04));
                    d[i] = (Math.random() * 2 - 1) * env;
                }
                const src = ac.createBufferSource();
                src.buffer = buf;
                const gain = ac.createGain();
                gain.gain.setValueAtTime(0.55, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
                const hp = ac.createBiquadFilter();
                hp.type = 'highpass'; hp.frequency.value = 900;
                src.connect(hp); hp.connect(gain); gain.connect(ac.destination);
                src.start(t);

            } else if (soundName === 'shotgun_fire') {
                // Deep boom: low thump + wide noise spread
                const boom = ac.createOscillator();
                boom.type = 'sine'; boom.frequency.setValueAtTime(120, t);
                boom.frequency.exponentialRampToValueAtTime(40, t + 0.25);
                const boomGain = ac.createGain();
                boomGain.gain.setValueAtTime(1.1, t);
                boomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
                boom.connect(boomGain); boomGain.connect(ac.destination);
                boom.start(t); boom.stop(t + 0.28);

                const buf = ac.createBuffer(1, ac.sampleRate * 0.22, ac.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.06));
                const ns = ac.createBufferSource(); ns.buffer = buf;
                const nsGain = ac.createGain();
                nsGain.gain.setValueAtTime(0.7, t);
                nsGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
                const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
                ns.connect(lp); lp.connect(nsGain); nsGain.connect(ac.destination);
                ns.start(t);

            } else if (soundName === 'rifle_fire') {
                // Fast mechanical pop with tail
                const osc = ac.createOscillator();
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(280, t);
                osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);
                const oscGain = ac.createGain();
                oscGain.gain.setValueAtTime(0.6, t);
                oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
                osc.connect(oscGain); oscGain.connect(ac.destination);
                osc.start(t); osc.stop(t + 0.14);

                const buf = ac.createBuffer(1, ac.sampleRate * 0.12, ac.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.025));
                const ns = ac.createBufferSource(); ns.buffer = buf;
                const nsGain = ac.createGain();
                nsGain.gain.setValueAtTime(0.5, t);
                nsGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
                ns.connect(hp); hp.connect(nsGain); nsGain.connect(ac.destination);
                ns.start(t);

            } else if (soundName === 'sniper_laser') {
                // Sci-fi zap: rising whine + sharp crack
                const whine = ac.createOscillator();
                whine.type = 'sine'; whine.frequency.setValueAtTime(200, t);
                whine.frequency.exponentialRampToValueAtTime(2400, t + 0.08);
                whine.frequency.exponentialRampToValueAtTime(400, t + 0.28);
                const whineGain = ac.createGain();
                whineGain.gain.setValueAtTime(0.0, t);
                whineGain.gain.linearRampToValueAtTime(0.7, t + 0.08);
                whineGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
                whine.connect(whineGain); whineGain.connect(ac.destination);
                whine.start(t); whine.stop(t + 0.28);

                const crack = ac.createOscillator();
                crack.type = 'square'; crack.frequency.setValueAtTime(900, t + 0.08);
                crack.frequency.exponentialRampToValueAtTime(150, t + 0.22);
                const crackGain = ac.createGain();
                crackGain.gain.setValueAtTime(0.5, t + 0.08);
                crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
                crack.connect(crackGain); crackGain.connect(ac.destination);
                crack.start(t + 0.08); crack.stop(t + 0.22);

            } else {
                // Generic fallback pop
                const osc = ac.createOscillator();
                osc.type = 'sine'; osc.frequency.setValueAtTime(200, t);
                osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
                const g = ac.createGain();
                g.gain.setValueAtTime(0.4, t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                osc.connect(g); g.connect(ac.destination);
                osc.start(t); osc.stop(t + 0.1);
            }
        } catch (e) { /* audio failure is non-fatal */ }
    }

    startMusic() {
        if (this._musicPlaying) return;
        try {
            this._initAudioCtx();
            const ac = this.audioCtx;
            if (!ac) return;
            this._musicPlaying = true;

            const BPM = 140;
            const step = 60 / BPM / 4; // 16th note duration in seconds
            const STEPS = 32; // 2-bar pattern

            // Master gain (music sits under sfx)
            const master = ac.createGain();
            master.gain.value = 0.28;
            master.connect(ac.destination);
            this._musicMaster = master;

            // Reverb convolver for atmosphere
            const reverbLen = ac.sampleRate * 1.8;
            const reverbBuf = ac.createBuffer(2, reverbLen, ac.sampleRate);
            for (let c = 0; c < 2; c++) {
                const d = reverbBuf.getChannelData(c);
                for (let i = 0; i < reverbLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLen, 2.2);
            }
            const reverb = ac.createConvolver();
            reverb.buffer = reverbBuf;
            const reverbGain = ac.createGain(); reverbGain.gain.value = 0.18;
            reverb.connect(reverbGain); reverbGain.connect(master);

            // --- Patterns ---
            // Kick: steps 0,8,16,24
            const kickSteps  = new Set([0, 8, 16, 24]);
            // Snare: steps 8, 24
            const snareSteps = new Set([8, 24]);
            // Hi-hat: every even step
            const hatSteps   = new Set([0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30]);
            // Open hat: steps 6, 14, 22, 30
            const ohatSteps  = new Set([6, 14, 22, 30]);
            // Bass notes (MIDI-ish): aggressive minor pattern
            const bassNotes  = [55,55,null,55, null,55,58,null, 55,55,null,55, null,53,null,52,
                                 55,55,null,55, null,55,58,null, 60,null,58,null, 57,null,55,null];
            // Arp lead
            const arpNotes   = [null,67,null,63, null,67,null,70, null,67,null,63, null,65,null,62,
                                 null,67,null,63, null,67,null,70, null,72,null,70, null,68,null,67];

            const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

            const scheduleBeat = (stepIdx, when) => {
                const s = stepIdx % STEPS;

                // Kick drum
                if (kickSteps.has(s)) {
                    const osc = ac.createOscillator();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(160, when);
                    osc.frequency.exponentialRampToValueAtTime(38, when + 0.18);
                    const g = ac.createGain();
                    g.gain.setValueAtTime(1.4, when);
                    g.gain.exponentialRampToValueAtTime(0.001, when + 0.22);
                    osc.connect(g); g.connect(master);
                    osc.start(when); osc.stop(when + 0.22);
                }

                // Snare
                if (snareSteps.has(s)) {
                    const buf = ac.createBuffer(1, ac.sampleRate * 0.18, ac.sampleRate);
                    const d = buf.getChannelData(0);
                    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.045));
                    const ns = ac.createBufferSource(); ns.buffer = buf;
                    const g = ac.createGain();
                    g.gain.setValueAtTime(0.9, when);
                    g.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
                    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.7;
                    ns.connect(bp); bp.connect(g); g.connect(master);
                    ns.connect(g); // direct + filtered
                    ns.start(when);
                    // Snare tone body
                    const tone = ac.createOscillator(); tone.type = 'triangle'; tone.frequency.value = 220;
                    const tg = ac.createGain(); tg.gain.setValueAtTime(0.3, when); tg.gain.exponentialRampToValueAtTime(0.001, when + 0.08);
                    tone.connect(tg); tg.connect(master); tone.start(when); tone.stop(when + 0.08);
                }

                // Closed hi-hat
                if (hatSteps.has(s) && !ohatSteps.has(s)) {
                    const buf = ac.createBuffer(1, ac.sampleRate * 0.04, ac.sampleRate);
                    const d = buf.getChannelData(0);
                    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.008));
                    const ns = ac.createBufferSource(); ns.buffer = buf;
                    const g = ac.createGain(); g.gain.value = 0.22;
                    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8000;
                    ns.connect(hp); hp.connect(g); g.connect(master);
                    ns.start(when);
                }

                // Open hi-hat
                if (ohatSteps.has(s)) {
                    const buf = ac.createBuffer(1, ac.sampleRate * 0.18, ac.sampleRate);
                    const d = buf.getChannelData(0);
                    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.055));
                    const ns = ac.createBufferSource(); ns.buffer = buf;
                    const g = ac.createGain(); g.gain.setValueAtTime(0.28, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
                    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
                    ns.connect(hp); hp.connect(g); g.connect(master);
                    ns.start(when);
                }

                // Bass synth
                const bn = bassNotes[s];
                if (bn != null) {
                    const osc = ac.createOscillator(); osc.type = 'sawtooth';
                    osc.frequency.value = midiToHz(bn);
                    const g = ac.createGain();
                    g.gain.setValueAtTime(0.55, when);
                    g.gain.exponentialRampToValueAtTime(0.001, when + step * 1.8);
                    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 3;
                    osc.connect(lp); lp.connect(g); g.connect(master);
                    osc.start(when); osc.stop(when + step * 1.9);
                }

                // Arp lead
                const an = arpNotes[s];
                if (an != null) {
                    const osc = ac.createOscillator(); osc.type = 'square';
                    osc.frequency.value = midiToHz(an);
                    const g = ac.createGain();
                    g.gain.setValueAtTime(0.0, when);
                    g.gain.linearRampToValueAtTime(0.18, when + 0.01);
                    g.gain.exponentialRampToValueAtTime(0.001, when + step * 0.85);
                    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800; lp.Q.value = 1.5;
                    osc.connect(lp); lp.connect(g); g.connect(master);
                    osc.connect(lp); lp.connect(reverbGain);
                    osc.start(when); osc.stop(when + step * 0.9);
                }
            };

            // Scheduler: look-ahead 200ms, schedule 32 steps ahead
            let nextStep = 0;
            let nextStepTime = ac.currentTime + 0.05;
            const LOOKAHEAD = 0.2;

            const schedule = () => {
                while (nextStepTime < ac.currentTime + LOOKAHEAD) {
                    scheduleBeat(nextStep, nextStepTime);
                    nextStep++;
                    nextStepTime += step;
                }
            };

            schedule();
            this._musicScheduler = setInterval(() => {
                if (!this._musicPlaying) { clearInterval(this._musicScheduler); return; }
                schedule();
            }, 50);

        } catch (e) { /* music failure is non-fatal */ }
    }

    toggleMute() {
        const btn = document.getElementById('muteBtn');
        if (!this._musicMaster || !this.audioCtx) return;
        const t = this.audioCtx.currentTime;
        if (this._muted) {
            this._muted = false;
            this._musicMaster.gain.setValueAtTime(0, t);
            this._musicMaster.gain.linearRampToValueAtTime(0.28, t + 0.3);
            if (btn) btn.textContent = '🔊';
        } else {
            this._muted = true;
            this._musicMaster.gain.setValueAtTime(this._musicMaster.gain.value, t);
            this._musicMaster.gain.linearRampToValueAtTime(0, t + 0.3);
            if (btn) btn.textContent = '🔇';
        }
    }

    stopMusic(fadeDuration = 1.2) {
        this._musicPlaying = false;
        if (this._musicScheduler) { clearInterval(this._musicScheduler); this._musicScheduler = null; }
        try {
            if (this._musicMaster && this.audioCtx) {
                const t = this.audioCtx.currentTime;
                this._musicMaster.gain.setValueAtTime(this._musicMaster.gain.value, t);
                this._musicMaster.gain.linearRampToValueAtTime(0, t + fadeDuration);
            }
        } catch (e) {}
    }

    updateWeaponSystem(deltaTime) {
        if (this.isSpectator || !this.inGame || this.shopState.active) {
            return;
        }

        const player = this.players.get(this.playerId);
        if (!player || !player.alive) {
            return;
        }

        const weaponType = this.currentWeapon;
        const currentAmmo = this.getPlayerAmmoForWeapon(player, weaponType);
        const reloadState = this.getPlayerReloadState(player);

        if (reloadState.active && reloadState.weaponType === weaponType) {
            return;
        }

        if (currentAmmo > 0) {
            this.clearReloadRequestLock(weaponType);
            return;
        }

        this.requestWeaponReload({ auto: true });
    }

    getWeaponOrder() {
        const unlockedWeaponOrder = this.weaponSystem
            .getWeaponOrder()
            .filter((weaponType) => this.weaponSystem.weapons[weaponType] && this.isWeaponUnlocked(weaponType));
        return unlockedWeaponOrder.length > 0 ? unlockedWeaponOrder : [this.defaultWeaponId];
    }

    resolveWeaponSwapDirection(fromWeaponType, toWeaponType, preferredDirection = 0) {
        if (preferredDirection > 0) {
            return 1;
        }
        if (preferredDirection < 0) {
            return -1;
        }

        const weaponOrder = this.getWeaponOrder();
        const fromIndex = weaponOrder.indexOf(fromWeaponType);
        const toIndex = weaponOrder.indexOf(toWeaponType);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
            return 1;
        }

        const forwardDistance = (toIndex - fromIndex + weaponOrder.length) % weaponOrder.length;
        const backwardDistance = (fromIndex - toIndex + weaponOrder.length) % weaponOrder.length;
        return forwardDistance <= backwardDistance ? 1 : -1;
    }

    startWeaponSwapAnimation(playerId, fromWeaponType, toWeaponType, preferredDirection = 0) {
        if (!playerId || !fromWeaponType || !toWeaponType || fromWeaponType === toWeaponType) {
            return;
        }

        const existing = this.weaponSwapAnimations.get(playerId);
        if (existing && existing.toWeaponType === toWeaponType) {
            return;
        }

        this.weaponSwapAnimations.set(playerId, {
            fromWeaponType,
            toWeaponType,
            direction: this.resolveWeaponSwapDirection(fromWeaponType, toWeaponType, preferredDirection),
            startedAt: Date.now(),
            durationMs: 240
        });
    }

    getWeaponSwapAnimation(playerId) {
        const animation = this.weaponSwapAnimations.get(playerId);
        if (!animation) {
            return null;
        }

        const elapsedMs = Date.now() - animation.startedAt;
        if (elapsedMs >= animation.durationMs) {
            this.weaponSwapAnimations.delete(playerId);
            return null;
        }

        return {
            ...animation,
            progress: Math.max(0, Math.min(1, elapsedMs / animation.durationMs))
        };
    }

    renderWeaponInHands(player, weaponType, angle, options = {}) {
        const weaponAnchors = this.getWeaponAnchorPoints(player, angle, weaponType);
        const forwardX = Math.cos(angle);
        const forwardY = Math.sin(angle);
        const sideX = -Math.sin(angle);
        const sideY = Math.cos(angle);
        const offsetForward = options.offsetForward || 0;
        const offsetSide = options.offsetSide || 0;

        this.spriteRenderer.renderWeapon(
            this.ctx,
            weaponType,
            weaponAnchors.weaponX + forwardX * offsetForward + sideX * offsetSide,
            weaponAnchors.weaponY + forwardY * offsetForward + sideY * offsetSide,
            angle + (options.rotationOffset || 0),
            false,
            {
                alpha: options.alpha ?? 1,
                scale: options.scale ?? 1
            }
        );
    }

    cycleWeapon(direction = 1) {
        if (this.isSpectator) {
            return;
        }

        const weaponOrder = this.getWeaponOrder();
        if (weaponOrder.length <= 1) {
            return;
        }

        const currentIndex = Math.max(0, weaponOrder.indexOf(this.currentWeapon));
        const normalizedDirection = direction >= 0 ? 1 : -1;
        const nextIndex = (currentIndex + normalizedDirection + weaponOrder.length) % weaponOrder.length;
        this.switchWeapon(weaponOrder[nextIndex], { direction: normalizedDirection });
    }

    switchWeapon(weaponType, options = {}) {
        if (this.isSpectator) {
            return;
        }

        if (this.weaponSystem.weapons[weaponType] && this.isWeaponUnlocked(weaponType)) {
            const previousWeapon = this.currentWeapon;
            if (previousWeapon === weaponType) {
                return;
            }

            this.cancelLocalWeaponCharge();
            this.disarmChargedShot(previousWeapon);
            this.clearReloadRequestLock();
            this.currentWeapon = weaponType;
            const weapon = this.weaponSystem.getWeapon(weaponType);
            const player = this.players.get(this.playerId);
            this.startWeaponSwapAnimation(this.playerId, previousWeapon, weaponType, options.direction || 0);
            
            // Update traditional UI
            const weaponDisplay = document.getElementById('currentWeapon');
            if (weaponDisplay) {
                weaponDisplay.textContent = weapon.name;
            }
            
            // Update modern HUD
            this.uiManager.updateHUD({
                weapon: weapon.name,
                ammo: this.getPlayerAmmoForWeapon(player, weaponType),
                maxAmmo: this.getWeaponMagazineSize(weaponType)
            });
            
            console.log(`Switched to ${weapon.name}`);
        }
    }

    updateGameState(gameState) {
        // Store old player data before clearing for damage detection
        const oldPlayers = new Map(this.players);
        
        // Update players
        this.players.clear();
        gameState.players.forEach(playerData => {
            const previousPlayer = oldPlayers.get(playerData.id);
            this.players.set(playerData.id, playerData);
            
            // Initialize sprite animation for this player if not already done
            if (!this.spriteRenderer.activeAnimations.has(playerData.id)) {
                const colorTheme = playerData.skinTheme || this.defaultSkinId;
                this.spriteRenderer.initializeEntity(playerData.id, 'player', colorTheme);
            }
            
            // Check for health decrease (player hit)
            if (previousPlayer && previousPlayer.health > playerData.health && playerData.alive) {
                this.spriteRenderer.setState(playerData.id, 'hit');
                this.spriteRenderer.addEffect(playerData.id, 'flash', 1.0);
                this.spriteRenderer.addEffect(playerData.id, 'shake', 0.8);
            }

            if (previousPlayer && previousPlayer.currentWeapon && playerData.currentWeapon && previousPlayer.currentWeapon !== playerData.currentWeapon) {
                const preferredDirection = playerData.id === this.playerId
                    ? this.resolveWeaponSwapDirection(previousPlayer.currentWeapon, playerData.currentWeapon)
                    : 0;
                this.startWeaponSwapAnimation(playerData.id, previousPlayer.currentWeapon, playerData.currentWeapon, preferredDirection);
            }
        });
        
        // Update bullets
        this.bullets.clear();
        gameState.bullets.forEach(bulletData => {
            this.bullets.set(bulletData.id, bulletData);
        });

        this.grenades.clear();
        if (gameState.grenades) {
            gameState.grenades.forEach((grenadeData) => {
                this.grenades.set(grenadeData.id, grenadeData);
            });
        }
        
        // Update enemies - clean up removed enemies first
        const currentEnemyIds = new Set(gameState.enemies.map(e => e.id));
        for (let [enemyId] of this.enemies) {
            if (!currentEnemyIds.has(enemyId)) {
                this.spriteRenderer.removeEntity(enemyId);
            }
        }
        
        this.enemies.clear();
        gameState.enemies.forEach(enemyData => {
            this.enemies.set(enemyData.id, enemyData);
            
            // Initialize sprite animation for this enemy if not already done
            if (!this.spriteRenderer.activeAnimations.has(enemyData.id)) {
                this.spriteRenderer.initializeEntity(enemyData.id, 'enemy', enemyData.spriteTheme || this.defaultEnemySpriteId);
            }
        });
        
        // Update particles
        this.particles.clear();
        if (gameState.particles) {
            gameState.particles.forEach(particleData => {
                this.particles.set(particleData.id, particleData);
            });
        }
        
        // Update power-ups
        this.powerUps.clear();
        if (gameState.powerUps) {
            gameState.powerUps.forEach(powerUpData => {
                this.powerUps.set(powerUpData.id, powerUpData);
            });
        }
        
        this.wave = gameState.wave;
        if (gameState.waveInfo) {
            this.waveInfo = {
                ...this.waveInfo,
                ...gameState.waveInfo
            };
        }

        this.matchMode = gameState.mode || gameState.match?.mode || this.matchMode;
        this.matchState = gameState.match || this.matchState;
        
        // Update difficulty information
        if (gameState.difficulty) {
            this.difficulty = gameState.difficulty;
        }

        const previousShopActive = this.shopState.active;
        this.shopState = gameState.shop || { active: false, endsAt: 0, durationMs: 0, endVote: { votes: 0, required: 0, playerIds: [] } };
        if (this.shopState.active) {
            this.showShop();
        } else if (previousShopActive) {
            this.hideShop();
        }
        
        // Check for player damage/death and create visual effects
        const currentPlayer = this.players.get(this.playerId);
        if (!currentPlayer?.alive) {
            this.cancelGrenadeCharge({ silent: true });
        }
        if (currentPlayer && this.lastPlayerState) {
            // Check for damage
            if (this.lastPlayerState.health > currentPlayer.health) {
                const damage = this.lastPlayerState.health - currentPlayer.health;
                this.uiManager.createDamageIndicator(currentPlayer.x, currentPlayer.y - 20, Math.floor(damage), 'normal');
                this.particleSystem.emit(currentPlayer.x, currentPlayer.y, 'bloodSplatter', 0, 1.0);
                this.uiManager.triggerHitIndicator();
            }
            
            // Check for death
            if (this.lastPlayerState.alive && !currentPlayer.alive) {
                // Player just died, show death screen (PVE) and create explosion effect
                if (this.matchMode !== 'pvp_ffa') {
                    this.showDeathScreen();
                } else {
                    this.hideDeathScreen();
                }
                this.particleSystem.emit(currentPlayer.x, currentPlayer.y, 'explosion', 0, 2.0);
                this.cameraSystem.startScreenShake(25, 800); // Stronger, longer shake for death
            }
        }
        
        // Check other players for damage effects using old player data
        gameState.players.forEach(playerData => {
            const oldPlayer = oldPlayers.get(playerData.id);
            if (oldPlayer && oldPlayer.health > playerData.health && playerData.id !== this.playerId) {
                // Another player took damage
                const damage = oldPlayer.health - playerData.health;
                this.uiManager.createDamageIndicator(playerData.x, playerData.y - 20, Math.floor(damage), 'normal');
                this.particleSystem.emit(playerData.x, playerData.y, 'hitSpark', 0, 0.8);
            }
        });

        if (!this.isSpectator && currentPlayer?.currentWeapon && this.weaponSystem.weapons[currentPlayer.currentWeapon]) {
            const localSwap = this.getWeaponSwapAnimation(this.playerId);
            if (!localSwap || localSwap.toWeaponType === currentPlayer.currentWeapon) {
                this.currentWeapon = currentPlayer.currentWeapon;
            }
        }
        
        this.lastPlayerState = currentPlayer ? { ...currentPlayer } : null;
        this.refreshSpectatorControls();

        // Push snapshot into interpolation buffer (keep last 3)
        this.stateBuffer.push({
            timestamp: performance.now(),
            players: new Map(this.players),
            enemies: new Map(this.enemies)
        });
        if (this.stateBuffer.length > 3) this.stateBuffer.shift();

        // Update UI
        this.updateUI();
    }

    getInterpolatedState() {
        const buf = this.stateBuffer;
        if (buf.length < 2) return { players: this.players, enemies: this.enemies };

        const renderTime = performance.now() - this.interpolationDelay;

        // Find the two snapshots that bracket renderTime
        let older = buf[0];
        let newer = buf[1];
        for (let i = 1; i < buf.length; i++) {
            if (buf[i].timestamp <= renderTime) {
                older = buf[i];
            } else {
                newer = buf[i];
                break;
            }
        }

        // If renderTime is ahead of all snapshots, use latest
        if (newer.timestamp <= renderTime) return { players: newer.players, enemies: newer.enemies };

        const span = newer.timestamp - older.timestamp;
        const alpha = span > 0 ? Math.max(0, Math.min(1, (renderTime - older.timestamp) / span)) : 1;

        const lerpAngle = (a, b, t) => {
            let diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            return a + diff * t;
        };

        const players = new Map();
        for (const [id, newP] of newer.players) {
            const oldP = older.players.get(id);
            // Don't interpolate local player — show their latest server position directly
            if (!oldP || id === this.playerId) { players.set(id, newP); continue; }
            players.set(id, { ...newP, x: oldP.x + (newP.x - oldP.x) * alpha, y: oldP.y + (newP.y - oldP.y) * alpha, angle: lerpAngle(oldP.angle || 0, newP.angle || 0, alpha) });
        }

        const enemies = new Map();
        for (const [id, newE] of newer.enemies) {
            const oldE = older.enemies.get(id);
            if (!oldE) { enemies.set(id, newE); continue; }
            enemies.set(id, { ...newE, x: oldE.x + (newE.x - oldE.x) * alpha, y: oldE.y + (newE.y - oldE.y) * alpha, angle: lerpAngle(oldE.angle || 0, newE.angle || 0, alpha) });
        }

        return { players, enemies };
    }

    updateUI(playerOverride = null) {
        const ammoElement = document.getElementById('currentAmmo');
        const maxAmmoElement = document.getElementById('maxAmmo');
        const weaponStatusElement = document.getElementById('weaponStatus');
        const weaponElement = document.getElementById('currentWeapon');
        const grenadeCountElement = document.getElementById('grenadeCount');
        const grenadeStatusElement = document.getElementById('grenadeStatus');

        if (this.isSpectator) {
            const totalScore = Array.from(this.players.values()).reduce((sum, player) => sum + (player.score || 0), 0);
            const playersAlive = Array.from(this.players.values()).filter((player) => player.alive).length;
            const healthElement = document.getElementById('health');
            const scoreElement = document.getElementById('score');
            const moneyElement = document.getElementById('money');
            const weaponElement = document.getElementById('currentWeapon');

            if (healthElement) {
                healthElement.textContent = `${playersAlive}/${this.players.size}`;
                healthElement.style.color = 'white';
            }
            if (scoreElement) {
                scoreElement.textContent = totalScore;
            }
            if (moneyElement) {
                moneyElement.textContent = this.roomRoster.length || this.players.size || 0;
            }
            if (weaponElement) {
                weaponElement.textContent = 'Spectator';
            }
            if (ammoElement) {
                ammoElement.textContent = '--';
            }
            if (maxAmmoElement) {
                maxAmmoElement.textContent = '--';
            }
            if (weaponStatusElement) {
                weaponStatusElement.textContent = 'Observing';
                weaponStatusElement.style.color = '#9cb0bc';
            }
            if (grenadeCountElement) {
                grenadeCountElement.textContent = '--';
            }
            if (grenadeStatusElement) {
                grenadeStatusElement.textContent = 'Observing';
                grenadeStatusElement.style.color = '#9cb0bc';
            }
            this.updateSpectatorBanner(this.inGame ? `Wave ${this.wave} live` : 'Waiting for match start');
        } else {
            const myPlayer = playerOverride || this.players.get(this.playerId);
            if (myPlayer) {
                document.getElementById('health').textContent = Math.max(0, Math.floor(myPlayer.health));
                document.getElementById('score').textContent = this.matchMode === 'pvp_ffa' ? (myPlayer.kills || 0) : myPlayer.score;
                const moneyElement = document.getElementById('money');
                if (moneyElement) {
                    moneyElement.textContent = myPlayer.money || 0;
                }
                const activeWeapon = this.weaponSystem.getWeapon(this.currentWeapon);
                const currentAmmo = this.getPlayerAmmoForWeapon(myPlayer, this.currentWeapon);
                const maxAmmo = this.getWeaponMagazineSize(this.currentWeapon);
                const reloadState = this.getPlayerReloadState(myPlayer);
                const chargeState = this.getPlayerChargeState(myPlayer, this.currentWeapon);
                const grenadeState = this.getPlayerGrenadeState(myPlayer);
                const grenadeChargeState = this.getGrenadeChargeSnapshot(myPlayer);
                const isReloadingCurrentWeapon = reloadState.active && reloadState.weaponType === this.currentWeapon;
                const isChargingCurrentWeapon = chargeState.active && chargeState.weaponType === this.currentWeapon && !chargeState.ready;
                
                // Update health display to show shield
                const healthElement = document.getElementById('health');
                if (myPlayer.shield > 0) {
                    healthElement.textContent = `${Math.max(0, Math.floor(myPlayer.health))} (+${Math.floor(myPlayer.shield)})`;
                    healthElement.style.color = '#8800ff';
                } else {
                    healthElement.style.color = 'white';
                }

                if (weaponElement) {
                    weaponElement.textContent = activeWeapon.name;
                }
                if (ammoElement) {
                    ammoElement.textContent = currentAmmo;
                }
                if (maxAmmoElement) {
                    maxAmmoElement.textContent = maxAmmo;
                }
                if (weaponStatusElement) {
                    if (!myPlayer.alive) {
                        weaponStatusElement.textContent = 'Down';
                        weaponStatusElement.style.color = '#ff9f9f';
                    } else if (isChargingCurrentWeapon) {
                        const secondsRemaining = Math.max(0, (chargeState.endsAt - Date.now()) / 1000);
                        weaponStatusElement.textContent = `Charging ${secondsRemaining.toFixed(1)}s`;
                        weaponStatusElement.style.color = '#67c9ff';
                    } else if (isReloadingCurrentWeapon) {
                        const secondsRemaining = Math.max(0, (reloadState.endsAt - Date.now()) / 1000);
                        weaponStatusElement.textContent = `Reloading ${secondsRemaining.toFixed(1)}s`;
                        weaponStatusElement.style.color = '#ffd166';
                    } else if (currentAmmo <= 0) {
                        weaponStatusElement.textContent = this.mobileControls.capable ? 'Empty - reload' : 'Empty - press R';
                        weaponStatusElement.style.color = '#ff8a65';
                    } else if (currentAmmo <= Math.max(1, Math.ceil(maxAmmo * 0.3))) {
                        weaponStatusElement.textContent = 'Low ammo';
                        weaponStatusElement.style.color = '#ffd166';
                    } else {
                        weaponStatusElement.textContent = 'Ready';
                        weaponStatusElement.style.color = '#8effd1';
                    }
                }

                if (grenadeCountElement) {
                    grenadeCountElement.textContent = grenadeState.count;
                }
                if (grenadeStatusElement) {
                    if (!myPlayer.alive) {
                        grenadeStatusElement.textContent = 'Down';
                        grenadeStatusElement.style.color = '#9cb0bc';
                    } else if (grenadeChargeState.active) {
                        grenadeStatusElement.textContent = grenadeChargeState.ready ? 'Max throw' : 'Charging';
                        grenadeStatusElement.style.color = '#ffcf6c';
                    } else if (grenadeState.count <= 0) {
                        grenadeStatusElement.textContent = 'Empty';
                        grenadeStatusElement.style.color = '#ff8a65';
                    } else if (!grenadeState.ready) {
                        grenadeStatusElement.textContent = `${(grenadeState.remainingCooldownMs / 1000).toFixed(1)}s`;
                        grenadeStatusElement.style.color = '#67c9ff';
                    } else {
                        grenadeStatusElement.textContent = 'Ready';
                        grenadeStatusElement.style.color = '#8effd1';
                    }
                }
            }
        }
        
        const isPvp = this.matchMode === 'pvp_ffa';
        document.getElementById('wave').textContent = isPvp ? 'FFA' : this.wave;

        const difficultyInfo = document.getElementById('difficultyInfo');
        if (difficultyInfo) {
            difficultyInfo.style.display = isPvp ? 'none' : '';
        }
        const powerUpHelp = document.getElementById('powerUpHelp');
        if (powerUpHelp) {
            powerUpHelp.style.display = isPvp ? 'none' : '';
        }

        // Update difficulty information
        document.getElementById('enemiesRemaining').textContent = this.difficulty.enemiesRemaining;
        document.getElementById('enemiesTotal').textContent = this.difficulty.enemiesPerWave;
        document.getElementById('spawnRate').textContent = this.difficulty.spawnRate;

        if (!this.isSpectator) {
            const myPlayer = playerOverride || this.players.get(this.playerId);
            if (!this.matchOver && isPvp && myPlayer && !myPlayer.alive && myPlayer.respawnAt) {
                const secondsRemaining = Math.max(0, (myPlayer.respawnAt - Date.now()) / 1000);
                this.showRespawnOverlay(secondsRemaining);
            } else {
                this.hideRespawnOverlay();
            }
        }
        this.updateInstructionCopy();
        this.updateMobileControlsState();
        this.renderShop(playerOverride);
    }

    getUpgradeCost(type, level) {
        const config = this.shopConfig[type];
        if (!config) return Infinity;
        const rawCost = config.baseCost * Math.pow(config.scale, level);
        return Math.round(rawCost / 5) * 5;
    }

    showShop() {
        if (this.isSpectator) {
            return;
        }

        const overlay = document.getElementById('shopOverlay');
        const gameContainer = document.getElementById('gameContainer');
        const gameCanvas = document.getElementById('gameCanvas');
        if (overlay) {
            overlay.style.display = 'flex';
        }
        if (gameContainer) {
            gameContainer.style.pointerEvents = 'none';
        }
        if (gameCanvas) {
            gameCanvas.style.pointerEvents = 'none';
        }
        document.body.classList.add('shop-open');
        if (this._musicMaster && this.audioCtx) {
            const t = this.audioCtx.currentTime;
            this._musicMaster.gain.setValueAtTime(this._musicMaster.gain.value, t);
            this._musicMaster.gain.linearRampToValueAtTime(0.07, t + 0.4);
        }
        this.releaseCombatInputForShop();
        this.cancelLocalWeaponCharge();
        this.cancelGrenadeCharge({ silent: true });
        this.disarmChargedShot();
        this.clearReloadRequestLock();
        this.shopRenderSignature = '';
        this.renderShop();
    }

    hideShop() {
        const overlay = document.getElementById('shopOverlay');
        const gameContainer = document.getElementById('gameContainer');
        const gameCanvas = document.getElementById('gameCanvas');
        if (overlay) {
            overlay.style.display = 'none';
        }
        if (gameContainer) {
            gameContainer.style.pointerEvents = '';
        }
        if (gameCanvas) {
            gameCanvas.style.pointerEvents = '';
        }
        document.body.classList.remove('shop-open');
        if (this._musicMaster && this.audioCtx) {
            const t = this.audioCtx.currentTime;
            this._musicMaster.gain.setValueAtTime(this._musicMaster.gain.value, t);
            this._musicMaster.gain.linearRampToValueAtTime(0.28, t + 0.4);
        }
        this.mouse.pressed = false;
        if (this.pendingPurchase?.timeoutId) {
            window.clearTimeout(this.pendingPurchase.timeoutId);
        }
        this.pendingPurchase = null;
        this.pendingEndVote = false;
        this.shopRenderSignature = '';
        this.shopNoticeText = 'Upgrades apply instantly and last for this match.';
    }

    renderShop(playerOverride = null) {
        if (this.isSpectator) {
            return;
        }

        const overlay = document.getElementById('shopOverlay');
        const timer = document.getElementById('shopTimer');
        const timerLarge = document.getElementById('shopTimerLarge');
        const currency = document.getElementById('shopCurrency');
        const countdownLabel = document.getElementById('shopCountdownLabel');
        const progressFill = document.getElementById('shopProgressFill');
        const notice = document.getElementById('shopNotice');
        const upgrades = document.getElementById('shopUpgrades');
        const endVoteButton = document.getElementById('endRunVoteButton');
        const endVoteStatus = document.getElementById('endRunVoteStatus');
        const player = playerOverride || this.players.get(this.playerId);

        if (!overlay || !timer || !timerLarge || !currency || !upgrades || !player) {
            return;
        }

        if (!this.shopState.active) {
            overlay.style.display = 'none';
            return;
        }

        overlay.style.display = 'flex';
        const remainingMs = Math.max(0, this.shopState.endsAt - Date.now());
        const secondsRemaining = Math.max(0, Math.ceil(remainingMs / 1000));
        const durationMs = Math.max(this.shopState.durationMs || 1, 1);
        const progress = Math.max(0, Math.min(1, remainingMs / durationMs));

        timer.textContent = `${secondsRemaining}s`;
        timerLarge.textContent = `${secondsRemaining}s`;
        currency.textContent = player.money || 0;
        if (countdownLabel) {
            countdownLabel.textContent = secondsRemaining > 0
                ? `Wave resumes in ${secondsRemaining} second${secondsRemaining === 1 ? '' : 's'}`
                : 'Wave incoming';
        }
        if (progressFill) {
            progressFill.style.width = `${Math.max(progress * 100, 0)}%`;
        }
        if (notice) {
            notice.textContent = this.shopNoticeText || 'Upgrades apply instantly and last for this match.';
        }

        const voteState = this.shopState.endVote || { votes: 0, required: this.players.size || 0, playerIds: [] };
        const consentingPlayerIds = Array.isArray(voteState.playerIds) ? voteState.playerIds : [];
        const hasVotedToEnd = consentingPlayerIds.includes(this.playerId);
        if (endVoteButton) {
            endVoteButton.textContent = hasVotedToEnd ? 'Withdraw End Vote' : 'Vote To End Run';
            endVoteButton.classList.toggle('active', hasVotedToEnd);
            endVoteButton.disabled = this.pendingEndVote;
        }
        if (endVoteStatus) {
            const requiredVotes = Math.max(voteState.required || 0, 0);
            const currentVotes = Math.max(voteState.votes || 0, 0);
            endVoteStatus.textContent = requiredVotes > 0
                ? `${currentVotes}/${requiredVotes} players agreed to end after this wave.`
                : 'All active players must agree before the run ends early.';
        }

        const shopSignature = JSON.stringify({
            active: this.shopState.active,
            money: player.money || 0,
            upgrades: player.upgrades || {},
            endVote: {
                votes: voteState.votes || 0,
                required: voteState.required || 0,
                playerIds: consentingPlayerIds
            }
        });

        if (shopSignature === this.shopRenderSignature) {
            return;
        }

        this.shopRenderSignature = shopSignature;
        upgrades.innerHTML = '';
        Object.entries(this.shopConfig).forEach(([key, config]) => {
            const isGrenadePurchase = key === 'grenade';
            const level = player.upgrades?.[key] || 0;
            const maxed = level >= config.maxLevel;
            const cost = this.getUpgradeCost(key, level);
            const canAfford = (player.money || 0) >= cost;
            const buttonLabel = maxed ? 'Maxed' : (canAfford ? (isGrenadePurchase ? 'Buy +1' : 'Buy') : `Need $${cost}`);
            const card = document.createElement('div');
            card.className = 'shop-card';
            card.style.borderColor = `${config.color}33`;

            const header = document.createElement('div');
            header.className = 'shop-card-header';

            const title = document.createElement('strong');
            title.style.color = config.color;
            title.textContent = config.label;

            const levelBadge = document.createElement('span');
            levelBadge.className = 'shop-level';
            levelBadge.textContent = isGrenadePurchase
                ? `Stock ${player?.grenade?.count ?? 0}`
                : `Lv ${level}/${config.maxLevel}`;

            header.appendChild(title);
            header.appendChild(levelBadge);

            const desc = document.createElement('div');
            desc.className = 'shop-desc';
            desc.textContent = config.description;

            const footer = document.createElement('div');
            footer.className = 'shop-card-footer';

            const costLabel = document.createElement('span');
            costLabel.className = 'shop-cost';
            costLabel.textContent = maxed ? 'MAXED' : `$${cost}`;

            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.upgrade = key;
            button.textContent = buttonLabel;
            button.disabled = maxed;

            footer.appendChild(costLabel);
            footer.appendChild(button);

            card.appendChild(header);
            card.appendChild(desc);
            card.appendChild(footer);
            upgrades.appendChild(card);
        });
    }

    renderLoop(timestamp) {
        const rawDeltaTime = this.lastTime ? (timestamp - this.lastTime) / 1000 : 1 / 60;
        this.lastTime = timestamp;
        const deltaTime = Math.min(rawDeltaTime, this.maxDeltaTime);
        
        // Update all modern systems
        this.updateSystems(deltaTime);
        
        // Handle input
        this.updateInput();
        
        // Render everything
        this.render();
        
        requestAnimationFrame((timestamp) => this.renderLoop(timestamp));
    }

    updateSystems(deltaTime) {
        this.updateMouseWorldPosition();

        // Update particle system
            this.particleSystem.update(deltaTime);
        
        // Update animation manager
        this.animationManager.update(deltaTime * 1000);
        
        // Update UI system
        this.uiManager.update(deltaTime * 1000);
        
        // Update sprite animations
        this.spriteRenderer.update(deltaTime);
        
        // Update parallax background
        this.parallaxBackground.update(deltaTime);
        
        // Update advanced camera system
        this.updateCamera(deltaTime);
        
        // Update weapon system
        if (this.inGame) {
            this.updateWeaponSystem(deltaTime);
        }
    }

    updateCamera(deltaTime) {
        if (this.inGame && this.isSpectator) {
            const focusPoint = this.getSpectatorFocusPoint();
            if (focusPoint) {
                const targetX = focusPoint.x - this.canvas.width / 2;
                const targetY = focusPoint.y - this.canvas.height / 2;
                this.cameraSystem.x += (targetX - this.cameraSystem.x) * 0.12;
                this.cameraSystem.y += (targetY - this.cameraSystem.y) * 0.12;
            }
            return;
        }

        if (this.inGame && this.playerId) {
            const player = this.players.get(this.playerId);
            if (player && player.alive) {
                try {
                    // Temporarily use simple camera following to debug
                    // The camera position should be the player position minus half screen size
                    // so that when we translate by -cameraX, -cameraY, the player appears centered
                    this.cameraSystem.x = player.x - this.canvas.width / 2;
                    this.cameraSystem.y = player.y - this.canvas.height / 2;
                    
                    // Reset any shake values that might interfere
                    if (this.cameraSystem.shake) {
                        this.cameraSystem.shake.x = 0;
                        this.cameraSystem.shake.y = 0;
                    }
                } catch (error) {
                    console.warn('Camera system error, using simple follow:', error);
                    // Fallback to simple camera following
                    this.cameraSystem.x = player.x - this.canvas.width / 2;
                    this.cameraSystem.y = player.y - this.canvas.height / 2;
                }
            }
        }
    }

    render() {
        // If assets aren't loaded, show simple loading
        if (!this.assetsLoaded) {
            this.ctx.fillStyle = '#0a0a0a';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '24px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Loading...', this.canvas.width / 2, this.canvas.height / 2);
            return;
        }
        
        if (this.inGame) {
            this.drawGame();
        }
        
        // Safely render UI if available
        try {
            if (this.uiManager) {
                this.uiManager.render();
            }
        } catch (error) {
            console.warn('UI render error:', error);
        }
    }

    drawGame() {
        // Clear canvas with dark background
        this.ctx.fillStyle = '#0a0a0a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Render parallax background (before camera transform)
        this.parallaxBackground.render(this.ctx);
        
        // Use simple camera offset instead of complex transform
        this.ctx.save();
        
        // Get camera position with fallback
        let cameraX = 0;
        let cameraY = 0;
        try {
            cameraX = this.cameraSystem.x + (this.cameraSystem.shake ? this.cameraSystem.shake.x : 0);
            cameraY = this.cameraSystem.y + (this.cameraSystem.shake ? this.cameraSystem.shake.y : 0);
        } catch (error) {
            console.warn('Camera system error, using fallback:', error);
            // Use basic camera position
            const player = this.players.get(this.playerId);
            if (player) {
                cameraX = player.x - this.canvas.width / 2;
                cameraY = player.y - this.canvas.height / 2;
            }
        }
        
        // Apply simple translation
        this.ctx.translate(-cameraX, -cameraY);
        
        // Draw world background
        this.drawWorldBackground(cameraX, cameraY);

        // Arena decals and floor accents
        this.drawArenaDecor();
        
        // Draw background grid
        this.drawGrid(cameraX, cameraY);

        // Draw cover and solid arena pieces before entities
        this.drawArenaObstacles();
        
        // Draw game objects in world space
        this.drawPowerUps();
        this.drawGrenades();
        this.drawBullets();
        const { players: interpPlayers, enemies: interpEnemies } = this.getInterpolatedState();
        this.drawEnemies(interpEnemies);
        this.drawPlayers(interpPlayers);
        
        // Draw particle effects
        this.particleSystem.render(this.ctx);
        
        // Reset transform
        this.ctx.restore();
        
        // Draw UI elements in screen space (not affected by camera)
        this.drawUI(cameraX, cameraY);
    }

    drawGrid(cameraX = 0, cameraY = 0) {
        const palette = this.getArenaPalette();
        const { width: worldWidth, height: worldHeight } = this.getArenaDimensions();
        this.ctx.strokeStyle = palette.gridMinor || 'rgba(126, 155, 170, 0.18)';
        this.ctx.lineWidth = 1;
        
        const gridSize = 50;

        const startX = Math.max(0, Math.floor(cameraX / gridSize) * gridSize - gridSize);
        const endX = Math.min(worldWidth, Math.ceil((cameraX + this.canvas.width) / gridSize) * gridSize + gridSize);
        const startY = Math.max(0, Math.floor(cameraY / gridSize) * gridSize - gridSize);
        const endY = Math.min(worldHeight, Math.ceil((cameraY + this.canvas.height) / gridSize) * gridSize + gridSize);

        for (let x = startX; x <= endX; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, startY);
            this.ctx.lineTo(x, endY);
            this.ctx.stroke();
        }
        
        for (let y = startY; y <= endY; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(endX, y);
            this.ctx.stroke();
        }

        this.ctx.strokeStyle = palette.gridMajor || 'rgba(180, 210, 230, 0.08)';
        const majorGrid = gridSize * 4;
        for (let x = Math.max(0, Math.floor(cameraX / majorGrid) * majorGrid); x <= endX; x += majorGrid) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, startY);
            this.ctx.lineTo(x, endY);
            this.ctx.stroke();
        }
        for (let y = Math.max(0, Math.floor(cameraY / majorGrid) * majorGrid); y <= endY; y += majorGrid) {
            this.ctx.beginPath();
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(endX, y);
            this.ctx.stroke();
        }
    }

    drawWorldBackground(cameraX = 0, cameraY = 0) {
        const palette = this.getArenaPalette();
        const { width: worldWidth, height: worldHeight } = this.getArenaDimensions();
        const gradient = this.ctx.createLinearGradient(0, 0, worldWidth, worldHeight);
        gradient.addColorStop(0, palette.floorBase || '#111827');
        gradient.addColorStop(0.55, palette.floorAlt || '#0f1f2d');
        gradient.addColorStop(1, palette.floorBase || '#172b3a');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, worldWidth, worldHeight);

        const tileSize = 140;
        const startX = Math.max(0, Math.floor(cameraX / tileSize) * tileSize - tileSize);
        const endX = Math.min(worldWidth, cameraX + this.canvas.width + tileSize);
        const startY = Math.max(0, Math.floor(cameraY / tileSize) * tileSize - tileSize);
        const endY = Math.min(worldHeight, cameraY + this.canvas.height + tileSize);

        for (let x = startX; x <= endX; x += tileSize) {
            for (let y = startY; y <= endY; y += tileSize) {
                const alternating = ((Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2) === 0;
                this.ctx.fillStyle = alternating ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.06)';
                this.ctx.fillRect(x, y, tileSize, tileSize);

                this.ctx.fillStyle = palette.floorGlow || 'rgba(54, 179, 126, 0.045)';
                this.ctx.fillRect(x + 10, y + 10, tileSize - 20, 6);

                if (((x / tileSize) + (y / tileSize)) % 3 === 0) {
                    this.ctx.fillStyle = this.resolveArenaColor('decal', 'rgba(255,255,255,0.06)');
                    this.ctx.fillRect(x + tileSize - 34, y + tileSize - 34, 16, 16);
                }
            }
        }

        this.ctx.strokeStyle = palette.boundary || 'rgba(68, 68, 68, 0.3)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(0, 0, worldWidth, worldHeight);
        
        // Add subtle visual markers at world center
        this.ctx.strokeStyle = this.resolveArenaColor('decal', 'rgba(102, 102, 102, 0.5)');
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(worldWidth / 2 - 12, worldHeight / 2);
        this.ctx.lineTo(worldWidth / 2 + 12, worldHeight / 2);
        this.ctx.moveTo(worldWidth / 2, worldHeight / 2 - 12);
        this.ctx.lineTo(worldWidth / 2, worldHeight / 2 + 12);
        this.ctx.stroke();
    }

    drawArenaDecor() {
        if (!this.arenaState?.decor?.length) {
            return;
        }

        this.arenaState.decor.forEach((item) => {
            if (!this.isWorldRectVisible(item.x, item.y, item.width, item.height, 100)) {
                return;
            }

            this.ctx.save();
            this.ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
            this.ctx.rotate(item.rotation || 0);
            this.ctx.globalAlpha = item.alpha ?? 1;

            if (item.type === 'stripe') {
                this.ctx.fillStyle = this.resolveArenaColor(item.color, 'rgba(255,255,255,0.08)');
                this.ctx.fillRect(-item.width / 2, -item.height / 2, item.width, item.height);
                this.ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                this.ctx.lineWidth = 1;
                const segmentCount = Math.max(2, Math.floor(item.width / 60));
                for (let segment = 0; segment < segmentCount; segment++) {
                    const segmentX = -item.width / 2 + 18 + segment * ((item.width - 36) / segmentCount);
                    this.ctx.beginPath();
                    this.ctx.moveTo(segmentX, -item.height / 2 + 6);
                    this.ctx.lineTo(segmentX + 18, item.height / 2 - 6);
                    this.ctx.stroke();
                }
            } else if (item.type === 'beacon') {
                const glow = this.ctx.createRadialGradient(0, 0, 0, 0, 0, item.width);
                const glowColor = this.resolveArenaColor(item.color, '#7df9ff');
                glow.addColorStop(0, glowColor);
                glow.addColorStop(1, 'rgba(0,0,0,0)');
                this.ctx.fillStyle = glow;
                this.ctx.beginPath();
                this.ctx.arc(0, 0, item.width, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.fillStyle = '#dff9ff';
                this.ctx.fillRect(-4, -4, 8, 8);
            } else if (item.type === 'vent') {
                this.ctx.fillStyle = 'rgba(0,0,0,0.18)';
                this.ctx.fillRect(-item.width / 2, -item.height / 2, item.width, item.height);
                this.ctx.strokeStyle = this.resolveArenaColor(item.color, 'rgba(255,255,255,0.18)');
                this.ctx.lineWidth = 1.5;
                for (let offset = -item.height / 2 + 4; offset < item.height / 2 - 2; offset += 5) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(-item.width / 2 + 4, offset);
                    this.ctx.lineTo(item.width / 2 - 4, offset);
                    this.ctx.stroke();
                }
            }

            this.ctx.restore();
        });
    }

    drawArenaObstacles() {
        if (!this.arenaState?.obstacles?.length) {
            return;
        }

        this.arenaState.obstacles.forEach((obstacle) => {
            if (!this.isWorldRectVisible(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 120)) {
                return;
            }

            const radius = obstacle.radius || 16;
            const wallBase = this.resolveArenaColor('wallBase', '#243645');
            const wallTop = this.resolveArenaColor('wallTop', '#3f5c72');
            const wallTrim = this.resolveArenaColor(obstacle.accent || 'wallTrim', '#60d7ff');
            const wallShadow = this.resolveArenaColor('wallShadow', 'rgba(0,0,0,0.28)');

            this.ctx.save();

            // Drop shadow
            this.ctx.fillStyle = wallShadow;
            this.ctx.beginPath();
            this.ctx.roundRect(obstacle.x + 8, obstacle.y + 10, obstacle.width, obstacle.height, radius);
            this.ctx.fill();

            // Base shell
            this.ctx.fillStyle = wallBase;
            this.ctx.beginPath();
            this.ctx.roundRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, radius);
            this.ctx.fill();

            // Upper face
            const faceGradient = this.ctx.createLinearGradient(obstacle.x, obstacle.y, obstacle.x, obstacle.y + obstacle.height);
            faceGradient.addColorStop(0, wallTop);
            faceGradient.addColorStop(1, wallBase);
            this.ctx.fillStyle = faceGradient;
            this.ctx.beginPath();
            this.ctx.roundRect(obstacle.x + 4, obstacle.y + 4, obstacle.width - 8, obstacle.height - 8, Math.max(6, radius - 4));
            this.ctx.fill();

            // Trim
            this.ctx.strokeStyle = wallTrim;
            this.ctx.lineWidth = obstacle.style === 'crate' ? 2 : 3;
            this.ctx.beginPath();
            this.ctx.roundRect(obstacle.x + 6, obstacle.y + 6, obstacle.width - 12, obstacle.height - 12, Math.max(6, radius - 6));
            this.ctx.stroke();

            this.ctx.globalAlpha = 0.22;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.roundRect(obstacle.x + 12, obstacle.y + 12, Math.max(18, obstacle.width * 0.32), 10, 5);
            this.ctx.fill();
            this.ctx.globalAlpha = 1;

            if (obstacle.style === 'hub') {
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
                this.ctx.beginPath();
                this.ctx.roundRect(obstacle.x + obstacle.width * 0.18, obstacle.y + obstacle.height * 0.18, obstacle.width * 0.64, obstacle.height * 0.64, Math.max(8, radius - 8));
                this.ctx.fill();

                this.ctx.strokeStyle = wallTrim;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2, Math.min(obstacle.width, obstacle.height) * 0.16, 0, Math.PI * 2);
                this.ctx.stroke();
            } else if (obstacle.style === 'crate') {
                this.ctx.strokeStyle = 'rgba(255,255,255,0.14)';
                this.ctx.lineWidth = 1.5;
                this.ctx.beginPath();
                this.ctx.moveTo(obstacle.x + 12, obstacle.y + 12);
                this.ctx.lineTo(obstacle.x + obstacle.width - 12, obstacle.y + obstacle.height - 12);
                this.ctx.moveTo(obstacle.x + obstacle.width - 12, obstacle.y + 12);
                this.ctx.lineTo(obstacle.x + 12, obstacle.y + obstacle.height - 12);
                this.ctx.stroke();
            } else {
                this.ctx.fillStyle = this.resolveArenaColor('hazard', '#ff7a5c');
                this.ctx.fillRect(obstacle.x + obstacle.width * 0.18, obstacle.y + obstacle.height * 0.5 - 3, obstacle.width * 0.64, 6);
            }

            this.ctx.restore();
        });
    }

    drawPlayer(player, isMe) {
        if (!player.alive) {
            // Draw death marker with modern styling
            this.ctx.save();
            this.ctx.globalAlpha = 0.8;
            this.ctx.fillStyle = '#2c3e50';
            this.ctx.beginPath();
            this.ctx.arc(player.x, player.y, 20, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = '#ecf0f1';
            this.ctx.font = 'bold 12px Courier New';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('💀', player.x, player.y + 4);
            this.ctx.font = '10px Courier New';
            this.ctx.fillText('(Respawn when ready)', player.x, player.y + 35);
            this.ctx.restore();
            return;
        }
        
        // Update sprite animation state based on player movement
        const speed = Math.sqrt((player.vx || 0) ** 2 + (player.vy || 0) ** 2);
        let animState = 'idle';
        if (speed > 0.5) {
            animState = speed > 2 ? 'run' : 'walk';
        }
        
        // Set animation state and direction
        this.spriteRenderer.setState(player.id, animState);
        this.spriteRenderer.setDirection(player.id, player.angle > Math.PI/2 && player.angle < 3*Math.PI/2 ? -1 : 1);
        
        // Add visual effects based on player state
        if (player.powerUps) {
            if (player.powerUps.speed) {
                this.spriteRenderer.addEffect(player.id, 'glow', 0.8);
            }
            if (player.powerUps.damage) {
                this.spriteRenderer.addEffect(player.id, 'glow', 1.0);
            }
        }
        
        // Shield effect
        if (player.shield > 0) {
            this.ctx.save();
            this.ctx.strokeStyle = '#8800ff';
            this.ctx.lineWidth = 3;
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = '#8800ff';
            this.ctx.beginPath();
            this.ctx.arc(player.x, player.y, 30, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
        }

        // Render modern sprite
        this.spriteRenderer.renderEntity(this.ctx, player.id, player.x, player.y, 32, 32);
        
        // Render weapon in hand, including a short swap animation when changing guns.
        const weaponType = player.currentWeapon || (isMe ? this.currentWeapon : 'pistol');
        const weaponSwap = this.getWeaponSwapAnimation(player.id);
        if (weaponSwap) {
            const outgoingProgress = Math.min(1, weaponSwap.progress / 0.48);
            const incomingProgress = Math.max(0, (weaponSwap.progress - 0.18) / 0.82);
            const outgoingEase = 1 - Math.pow(1 - outgoingProgress, 2);
            const incomingEase = 1 - Math.pow(1 - incomingProgress, 3);

            this.renderWeaponInHands(player, weaponSwap.fromWeaponType, player.angle, {
                offsetForward: -8 * outgoingEase,
                offsetSide: weaponSwap.direction * 14 * outgoingEase,
                rotationOffset: weaponSwap.direction * 0.6 * outgoingEase,
                alpha: 1 - outgoingEase,
                scale: 1 - outgoingEase * 0.08
            });

            this.renderWeaponInHands(player, weaponSwap.toWeaponType, player.angle, {
                offsetForward: 10 * (1 - incomingEase),
                offsetSide: -weaponSwap.direction * 16 * (1 - incomingEase),
                rotationOffset: -weaponSwap.direction * 0.68 * (1 - incomingEase),
                alpha: Math.max(0, Math.min(1, incomingEase)),
                scale: 0.9 + incomingEase * 0.1
            });
        } else {
            this.renderWeaponInHands(player, weaponType, player.angle);
        }

        // Health bar
        const barWidth = 40;
        const barHeight = 4;
        const healthPercent = player.health / player.maxHealth;

        this.ctx.fillStyle = '#ff0000';
        this.ctx.fillRect(player.x - barWidth / 2, player.y - 25, barWidth, barHeight);
        
        this.ctx.fillStyle = '#00ff00';
        this.ctx.fillRect(player.x - barWidth / 2, player.y - 25, barWidth * healthPercent, barHeight);
        
        // Shield bar
        if (player.shield > 0) {
            const shieldPercent = player.shield / 100; // Assuming max shield is 100
            this.ctx.fillStyle = '#8800ff';
            this.ctx.fillRect(player.x - barWidth / 2, player.y - 30, barWidth * shieldPercent, 3);
        }
        
        // Player name
        this.ctx.fillStyle = isMe ? '#00ff00' : '#0099ff';
        this.ctx.font = '12px Courier New';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.name, player.x, player.y - 35);
        
        // Power-up indicators
        let offsetY = -45;
        if (player.powerUps) {
            if (player.powerUps.speed) {
                this.ctx.fillStyle = '#00ffff';
                this.ctx.fillText('SPD', player.x - 15, player.y + offsetY);
                offsetY -= 10;
            }
            if (player.powerUps.damage) {
                this.ctx.fillStyle = '#ff8800';
                this.ctx.fillText('DMG', player.x, player.y + offsetY);
                offsetY -= 10;
            }
            if (player.powerUps.shield) {
                this.ctx.fillStyle = '#8800ff';
                this.ctx.fillText('SHD', player.x + 15, player.y + offsetY);
            }
        }
    }

    drawBullet(bullet) {
        const angle = Math.atan2(bullet.vy || 0, bullet.vx || 1);
        const bulletProfiles = {
            sniper: {
                trailLength: 30,
                trailColor: 'rgba(78, 205, 255, 0.55)',
                lineWidth: 6,
                glowRadius: 12,
                glowInner: '#ecfbff',
                glowMid: '#67c9ff',
                glowOuter: 'rgba(103, 201, 255, 0)',
                coreColor: '#b7f3ff',
                coreRadius: 4
            },
            'enemy-bolt': {
                trailLength: 16,
                trailColor: 'rgba(255, 122, 182, 0.46)',
                lineWidth: 3,
                glowRadius: 7,
                glowInner: '#ffe4f1',
                glowMid: '#ff7ab6',
                glowOuter: 'rgba(255, 122, 182, 0)',
                coreColor: '#ffd0e6',
                coreRadius: 2.8
            },
            'boss-bolt': {
                trailLength: 22,
                trailColor: 'rgba(255, 209, 102, 0.52)',
                lineWidth: 4,
                glowRadius: 10,
                glowInner: '#fff6d6',
                glowMid: '#ffd166',
                glowOuter: 'rgba(255, 209, 102, 0)',
                coreColor: '#fff0c2',
                coreRadius: 3.4
            },
            default: {
                trailLength: 18,
                trailColor: 'rgba(255, 214, 74, 0.38)',
                lineWidth: 4,
                glowRadius: 8,
                glowInner: '#fff6a8',
                glowMid: '#ffd54a',
                glowOuter: 'rgba(255, 213, 74, 0)',
                coreColor: '#ffe066',
                coreRadius: 3
            }
        };
        const profileKey = bullet.style || bullet.weaponType;
        const profile = { ...(bulletProfiles[profileKey] || bulletProfiles.default) };
        if (bullet.hostile && bullet.color) {
            profile.trailColor = this.withAlpha(bullet.color, profileKey === 'boss-bolt' ? 0.55 : 0.45);
            profile.glowMid = bullet.color;
            profile.glowOuter = this.withAlpha(bullet.color, 0);
            profile.coreColor = '#fff5fb';
        }
        this.ctx.save();
        this.ctx.strokeStyle = profile.trailColor;
        this.ctx.lineWidth = profile.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(
            bullet.x - Math.cos(angle) * profile.trailLength,
            bullet.y - Math.sin(angle) * profile.trailLength
        );
        this.ctx.lineTo(bullet.x, bullet.y);
        this.ctx.stroke();
        this.ctx.restore();

        const glow = this.ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, profile.glowRadius);
        glow.addColorStop(0, profile.glowInner);
        glow.addColorStop(0.45, profile.glowMid);
        glow.addColorStop(1, profile.glowOuter);

        this.ctx.fillStyle = glow;
        this.ctx.beginPath();
        this.ctx.arc(bullet.x, bullet.y, profile.glowRadius, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = profile.coreColor;
        this.ctx.beginPath();
        this.ctx.arc(bullet.x, bullet.y, profile.coreRadius, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawParticle(particle) {
        this.ctx.save();
        this.ctx.globalAlpha = particle.alpha;
        this.ctx.fillStyle = particle.color;
        this.ctx.beginPath();
        this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
    }

    drawPowerUp(powerUp) {
        this.ctx.save();
        const hoverOffset = Math.sin((Date.now() + powerUp.x * 3) / 220) * 2.5;
        this.ctx.translate(powerUp.x, powerUp.y + hoverOffset);
        
        // Pulsing effect
        const scale = powerUp.pulse;
        this.ctx.scale(scale, scale);
        
        // Get power-up color
        let color, symbol;
        switch (powerUp.type) {
            case 'health':
                color = '#00ff00';
                symbol = '+';
                break;
            case 'speed':
                color = '#00ffff';
                symbol = '»';
                break;
            case 'damage':
                color = '#ff8800';
                symbol = '!';
                break;
            case 'shield':
                color = '#8800ff';
                symbol = '◆';
                break;
            case 'grenade':
                color = '#ffad49';
                symbol = 'o';
                break;
            default:
                color = '#ffffff';
                symbol = '?';
        }
        
        symbol = '';

        const halo = this.ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
        halo.addColorStop(0, color);
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        this.ctx.globalAlpha = 0.18;
        this.ctx.fillStyle = halo;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 22, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw power-up background
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = 0.7;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 12, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw power-up border
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.globalAlpha = 1;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 12, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Draw symbol
        this.ctx.fillStyle = '#000000';
        this.ctx.font = 'bold 16px Courier New';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(symbol, 0, 0);

        this.ctx.strokeStyle = '#e5f4ff';
        this.ctx.fillStyle = '#e5f4ff';
        this.ctx.lineWidth = 2.5;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        if (powerUp.type === 'health') {
            this.ctx.beginPath();
            this.ctx.moveTo(-5, 0);
            this.ctx.lineTo(5, 0);
            this.ctx.moveTo(0, -5);
            this.ctx.lineTo(0, 5);
            this.ctx.stroke();
        } else if (powerUp.type === 'speed') {
            this.ctx.beginPath();
            this.ctx.moveTo(-6, 4);
            this.ctx.lineTo(-1, -1);
            this.ctx.lineTo(-1, 2);
            this.ctx.lineTo(6, -5);
            this.ctx.stroke();
        } else if (powerUp.type === 'damage') {
            this.ctx.beginPath();
            this.ctx.moveTo(1, -7);
            this.ctx.lineTo(-3, 0);
            this.ctx.lineTo(1, 0);
            this.ctx.lineTo(-1, 7);
            this.ctx.lineTo(5, -1);
            this.ctx.lineTo(1, -1);
            this.ctx.closePath();
            this.ctx.fill();
        } else if (powerUp.type === 'shield') {
            this.ctx.beginPath();
            this.ctx.moveTo(0, -7);
            this.ctx.lineTo(6, -3);
            this.ctx.lineTo(4, 5);
            this.ctx.lineTo(0, 8);
            this.ctx.lineTo(-4, 5);
            this.ctx.lineTo(-6, -3);
            this.ctx.closePath();
            this.ctx.stroke();
        } else if (powerUp.type === 'grenade') {
            // Grenade glyph: body + pin ring
            this.ctx.beginPath();
            this.ctx.arc(0, 2, 5.4, 0, Math.PI * 2);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(-3.2, -3.2);
            this.ctx.lineTo(3.2, -3.2);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.arc(-5.2, -5.6, 1.6, 0, Math.PI * 2);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(-4.2, -5.6);
            this.ctx.lineTo(-2.4, -4.4);
            this.ctx.stroke();
        }
        
        this.ctx.restore();
    }

    withAlpha(color, alpha = 1) {
        if (typeof color !== 'string' || !color.trim()) {
            return `rgba(255, 255, 255, ${alpha})`;
        }

        const normalized = color.trim();
        if (normalized.startsWith('rgba(')) {
            return normalized.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${alpha})`);
        }
        if (normalized.startsWith('rgb(')) {
            return normalized.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
        }
        if (normalized.startsWith('#')) {
            let hex = normalized.slice(1);
            if (hex.length === 3) {
                hex = hex.split('').map((char) => char + char).join('');
            }
            const value = Number.parseInt(hex.slice(0, 6), 16);
            const red = (value >> 16) & 255;
            const green = (value >> 8) & 255;
            const blue = value & 255;
            return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        }

        return normalized;
    }

    getEnemyAccentColor(enemy) {
        return enemy?.accentColor || '#ff8b78';
    }

    getBossEnemy() {
        for (const enemy of this.enemies.values()) {
            if (enemy?.isBoss) {
                return enemy;
            }
        }
        return null;
    }

    drawEnemy(enemy) {
        // Update enemy animation state based on movement
        const speed = Math.sqrt((enemy.vx || 0) ** 2 + (enemy.vy || 0) ** 2);
        let animState = 'idle';
        if (speed > 0.3) {
            animState = 'walk';
        }
        const renderSize = Math.max(28, enemy.renderSize || ((enemy.size || 12) * 2.3));
        const accentColor = this.getEnemyAccentColor(enemy);
        const label = enemy.isBoss
            ? (enemy.label || 'Boss')
            : (enemy.type && enemy.type !== 'grunt' ? (enemy.label || enemy.type) : '');
        const auraRadius = enemy.isBoss
            ? renderSize * 0.95
            : enemy.type === 'brute'
                ? renderSize * 0.72
                : enemy.type === 'marksman'
                    ? renderSize * 0.64
                    : enemy.type === 'scout'
                        ? renderSize * 0.58
                        : 0;

        if (auraRadius > 0) {
            const aura = this.ctx.createRadialGradient(enemy.x, enemy.y, renderSize * 0.1, enemy.x, enemy.y, auraRadius);
            aura.addColorStop(0, this.withAlpha(accentColor, enemy.isBoss ? 0.28 : 0.22));
            aura.addColorStop(1, this.withAlpha(accentColor, 0));
            this.ctx.fillStyle = aura;
            this.ctx.beginPath();
            this.ctx.arc(enemy.x, enemy.y, auraRadius, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Set animation state and direction
        this.spriteRenderer.setState(enemy.id, animState);
        this.spriteRenderer.setDirection(enemy.id, enemy.angle > Math.PI/2 && enemy.angle < 3*Math.PI/2 ? -1 : 1);
        
        // Render modern enemy sprite
        this.spriteRenderer.renderEntity(this.ctx, enemy.id, enemy.x, enemy.y, renderSize, renderSize);

        this.ctx.save();
        this.ctx.translate(enemy.x, enemy.y);

        if (enemy.type === 'scout') {
            this.ctx.strokeStyle = this.withAlpha(accentColor, 0.95);
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(-renderSize * 0.34, renderSize * 0.02);
            this.ctx.lineTo(-renderSize * 0.5, renderSize * 0.14);
            this.ctx.moveTo(-renderSize * 0.18, renderSize * 0.1);
            this.ctx.lineTo(-renderSize * 0.34, renderSize * 0.22);
            this.ctx.stroke();
        } else if (enemy.type === 'brute') {
            this.ctx.strokeStyle = this.withAlpha(accentColor, 0.92);
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(-renderSize * 0.4, -renderSize * 0.14);
            this.ctx.lineTo(-renderSize * 0.22, -renderSize * 0.3);
            this.ctx.lineTo(-renderSize * 0.06, -renderSize * 0.1);
            this.ctx.moveTo(renderSize * 0.4, -renderSize * 0.14);
            this.ctx.lineTo(renderSize * 0.22, -renderSize * 0.3);
            this.ctx.lineTo(renderSize * 0.06, -renderSize * 0.1);
            this.ctx.stroke();
        } else if (enemy.type === 'marksman') {
            this.ctx.strokeStyle = this.withAlpha(accentColor, 0.95);
            this.ctx.lineWidth = 1.8;
            this.ctx.beginPath();
            this.ctx.arc(0, -renderSize * 0.44, renderSize * 0.16, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(-renderSize * 0.08, -renderSize * 0.44);
            this.ctx.lineTo(renderSize * 0.08, -renderSize * 0.44);
            this.ctx.moveTo(0, -renderSize * 0.52);
            this.ctx.lineTo(0, -renderSize * 0.36);
            this.ctx.stroke();
        } else if (enemy.isBoss) {
            this.ctx.strokeStyle = this.withAlpha(accentColor, 0.96);
            this.ctx.lineWidth = 2.4;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, renderSize * 0.54, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(-renderSize * 0.34, -renderSize * 0.54);
            this.ctx.lineTo(-renderSize * 0.16, -renderSize * 0.78);
            this.ctx.lineTo(0, -renderSize * 0.58);
            this.ctx.lineTo(renderSize * 0.16, -renderSize * 0.78);
            this.ctx.lineTo(renderSize * 0.34, -renderSize * 0.54);
            this.ctx.stroke();
        }

        this.ctx.restore();

        // Modern health bar with better styling
        if (enemy.health < enemy.maxHealth) {
            const barWidth = Math.max(24, Math.round(renderSize * 0.95));
            const barHeight = 4;
            const healthPercent = enemy.health / enemy.maxHealth;

            // Background
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            this.ctx.fillRect(enemy.x - barWidth / 2 - 1, enemy.y - (renderSize * 0.72), barWidth + 2, barHeight + 2);
            
            // Red background
            this.ctx.fillStyle = '#e74c3c';
            this.ctx.fillRect(enemy.x - barWidth / 2, enemy.y - (renderSize * 0.68), barWidth, barHeight);
            
            // Accent health
            this.ctx.fillStyle = accentColor;
            this.ctx.fillRect(enemy.x - barWidth / 2, enemy.y - (renderSize * 0.68), barWidth * healthPercent, barHeight);
        }

        if (label) {
            this.ctx.save();
            this.ctx.font = enemy.isBoss ? 'bold 12px Courier New' : 'bold 10px Courier New';
            this.ctx.textAlign = 'center';
            this.ctx.fillStyle = this.withAlpha(accentColor, 0.98);
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
            this.ctx.lineWidth = 3;
            const labelY = enemy.y - (renderSize * 0.88);
            this.ctx.strokeText(label.toUpperCase(), enemy.x, labelY);
            this.ctx.fillText(label.toUpperCase(), enemy.x, labelY);
            this.ctx.restore();
        }
    }

    drawCrosshair() {
        const size = 10;
        const weapon = this.weaponSystem.getWeapon(this.currentWeapon);
        const crosshairColor = weapon?.crosshairColor || '#ffffff';
        
        this.ctx.strokeStyle = crosshairColor;
        this.ctx.lineWidth = 2;
        
        // Horizontal line
        this.ctx.beginPath();
        this.ctx.moveTo(this.mouse.x - size, this.mouse.y);
        this.ctx.lineTo(this.mouse.x + size, this.mouse.y);
        this.ctx.stroke();
        
        // Vertical line
        this.ctx.beginPath();
        this.ctx.moveTo(this.mouse.x, this.mouse.y - size);
        this.ctx.lineTo(this.mouse.x, this.mouse.y + size);
        this.ctx.stroke();
        
        // Draw weapon cooldown indicator
        const timeSinceLastFire = Date.now() - this.lastFireTime;
        const cooldownProgress = Math.min(1, timeSinceLastFire / weapon.cooldown);
        
        if (cooldownProgress < 1) {
            // Draw cooldown arc
            this.ctx.strokeStyle = '#ff0000';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(this.mouse.x, this.mouse.y, size + 8, 
                        -Math.PI/2, 
                        -Math.PI/2 + (cooldownProgress * Math.PI * 2));
            this.ctx.stroke();
        }
        
        if (weapon?.showSpreadIndicator) {
            this.ctx.strokeStyle = weapon.spreadGuideColor || 'rgba(255, 255, 255, 0.24)';
            this.ctx.lineWidth = 1;
            
            const spreadAngle = weapon.spread / 2;
            const player = this.players.get(this.playerId);
            if (player) {
                const playerScreen = this.cameraSystem.worldToScreen(player.x, player.y);
                const centerAngle = Math.atan2(this.mouse.y - playerScreen.y, this.mouse.x - playerScreen.x);
                const distance = 100;
                
                // Draw spread lines
                for (let angle of [centerAngle - spreadAngle, centerAngle + spreadAngle]) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(playerScreen.x, playerScreen.y);
                    this.ctx.lineTo(
                        playerScreen.x + Math.cos(angle) * distance,
                        playerScreen.y + Math.sin(angle) * distance
                    );
                    this.ctx.stroke();
                }
            }
        }
    }

    drawPlayerInfo() {
        // Draw player list
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '12px Courier New';
        this.ctx.textAlign = 'left';
        
        let y = 40;
        this.ctx.fillText('Players:', 10, y);
        y += 15;
        
        this.players.forEach(player => {
            const color = player.alive ? (player.id === this.playerId ? '#00ff00' : '#0099ff') : '#666666';
            this.ctx.fillStyle = color;
            this.ctx.fillText(`${player.name}: ${player.score}`, 10, y);
            y += 15;
        });
    }

    drawWeaponEffects() {
        // Apply screen shake
        this.ctx.save();
        this.ctx.translate(this.screenShake.x, this.screenShake.y);
        
        // Draw shell casings
        this.shellCasings.forEach(casing => {
            casing.draw(this.ctx);
        });
        
        // Draw muzzle flash
        if (this.muzzleFlash.active) {
            const player = this.players.get(this.playerId);
            if (player) {
                this.drawMuzzleFlash(player.x, player.y, this.muzzleFlash.angle);
            }
        }
        
        this.ctx.restore();
    }

    drawMuzzleFlash(x, y, angle) {
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(angle);
        
        // Bright yellow/orange flash
        const gradient = this.ctx.createRadialGradient(0, 0, 5, 0, 0, 25);
        gradient.addColorStop(0, '#ffff88');
        gradient.addColorStop(0.3, '#ff8844');
        gradient.addColorStop(0.7, '#ff4400');
        gradient.addColorStop(1, 'rgba(255, 68, 0, 0)');
        
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.ellipse(15, 0, 20, 8, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Add some random sparks
        for (let i = 0; i < 5; i++) {
            const sparkX = 20 + Math.random() * 15;
            const sparkY = (Math.random() - 0.5) * 10;
            
            this.ctx.fillStyle = '#ffff00';
            this.ctx.beginPath();
            this.ctx.arc(sparkX, sparkY, 1, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        this.ctx.restore();
    }

    // Modern Drawing Methods
    drawPowerUps() {
        this.powerUps.forEach(powerUp => {
            this.drawPowerUp(powerUp);
        });
    }

    drawGrenade(grenade) {
        const pulse = 0.85 + Math.sin(Date.now() / 70 + grenade.x * 0.03) * 0.08;
        const radius = Math.max(4, grenade.size || 7);
        const fuseProgress = Math.max(0, Math.min(1, grenade.fuseProgress || 0));
        const angle = Math.atan2(grenade.vy || 0, grenade.vx || 1);

        this.ctx.save();
        this.ctx.translate(grenade.x, grenade.y);
        this.ctx.rotate(angle);

        const glow = this.ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 2.8);
        glow.addColorStop(0, 'rgba(127, 216, 255, 0.34)');
        glow.addColorStop(1, 'rgba(127, 216, 255, 0)');
        this.ctx.fillStyle = glow;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius * 2.8, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = '#2e4656';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius * pulse, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.strokeStyle = '#b9f3ff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius * pulse, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.fillStyle = '#ffcf6c';
        this.ctx.fillRect(radius * 0.15, -radius * 0.9, radius * 0.9, radius * 0.34);

        this.ctx.strokeStyle = '#ff9f43';
        this.ctx.lineWidth = 2.4;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius * 1.55, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - fuseProgress));
        this.ctx.stroke();

        this.ctx.restore();
    }

    drawGrenades() {
        this.grenades.forEach((grenade) => {
            this.drawGrenade(grenade);
        });
    }

    drawBullets() {
        this.bullets.forEach(bullet => {
            this.drawBullet(bullet);
        });
    }

    drawEnemies(enemyMap = this.enemies) {
        enemyMap.forEach(enemy => {
            this.drawEnemy(enemy);
        });
    }

    drawPlayers(playerMap = this.players) {
        playerMap.forEach(player => {
            this.drawPlayer(player, player.id === this.playerId);
        });
    }

    drawUI(cameraX = 0, cameraY = 0) {
        // Safely update UI elements
        try {
            if (this.uiManager) {
                // Update crosshair position
                this.uiManager.updateCrosshair(this.mouse.x, this.mouse.y);
                
                // Update HUD with current player data
                const player = this.players.get(this.playerId);
                if (player) {
                    const matchTimeLeftMs = this.matchMode === 'pvp_ffa' && this.matchState?.endsAt
                        ? Math.max(0, this.matchState.endsAt - Date.now())
                        : null;
                    const killLimit = this.matchMode === 'pvp_ffa'
                        ? (Number(this.matchState?.killLimit) || null)
                        : null;

                    this.uiManager.updateHUD({
                        health: player.health,
                        maxHealth: player.maxHealth || 100,
                        ammo: this.getPlayerAmmoForWeapon(player, this.currentWeapon),
                        maxAmmo: this.getWeaponMagazineSize(this.currentWeapon),
                        weapon: this.weaponSystem.getWeapon(this.currentWeapon).name,
                        score: player.score || 0,
                        kills: player.kills || 0,
                        matchMode: this.matchMode,
                        matchTimeLeftMs,
                        killLimit
                    });
                }
            }
        } catch (error) {
            console.warn('UI update error:', error);
        }

        this.drawWeaponActionIndicator();
        this.drawBossStatus();
        this.drawMinimap(cameraX, cameraY);

        // The UI manager renders itself in the main render loop
    }

    drawBossStatus() {
        const boss = this.getBossEnemy();
        const waveInfoBossAlive = this.waveInfo?.bossAlive && this.waveInfo?.bossMaxHealth > 0;

        if (!boss && !waveInfoBossAlive) {
            return;
        }

        const bossName = boss?.label || this.waveInfo?.bossName || 'BOSS';
        const bossHealth = Number.isFinite(boss?.health) ? boss.health : this.waveInfo?.bossHealth || 0;
        const bossMaxHealth = Number.isFinite(boss?.maxHealth) ? boss.maxHealth : this.waveInfo?.bossMaxHealth || 1;
        const accentColor = this.getEnemyAccentColor(boss || { accentColor: '#ffd166' });
        const panelWidth = Math.min(420, Math.max(260, this.canvas.width * 0.42));
        const panelHeight = 42;
        const panelX = (this.canvas.width - panelWidth) / 2;
        const panelY = 18;
        const healthPercent = Math.max(0, Math.min(1, bossHealth / Math.max(1, bossMaxHealth)));

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 14);
        this.ctx.fillStyle = 'rgba(10, 14, 18, 0.82)';
        this.ctx.fill();
        this.ctx.strokeStyle = this.withAlpha(accentColor, 0.45);
        this.ctx.lineWidth = 1.4;
        this.ctx.stroke();

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        this.ctx.fillRect(panelX + 14, panelY + 22, panelWidth - 28, 10);

        this.ctx.fillStyle = accentColor;
        this.ctx.fillRect(panelX + 14, panelY + 22, (panelWidth - 28) * healthPercent, 10);

        this.ctx.font = 'bold 12px Courier New';
        this.ctx.textAlign = 'left';
        this.ctx.fillStyle = '#fff6d6';
        this.ctx.fillText(`${bossName.toUpperCase()}  W${this.wave}`, panelX + 14, panelY + 15);

        this.ctx.textAlign = 'right';
        this.ctx.fillStyle = '#f1f7fb';
        this.ctx.fillText(`${Math.max(0, Math.ceil(bossHealth))} / ${Math.max(1, Math.ceil(bossMaxHealth))}`, panelX + panelWidth - 14, panelY + 15);
        this.ctx.restore();
    }

    drawWeaponActionIndicator() {
        if (this.isSpectator || !this.inGame) {
            return;
        }

        const player = this.players.get(this.playerId);
        if (!player || !player.alive) {
            return;
        }

        const weapon = this.weaponSystem.getWeapon(this.currentWeapon);
        const reloadState = this.getPlayerReloadState(player);
        const chargeState = this.getPlayerChargeState(player, this.currentWeapon);
        const grenadeChargeState = this.getGrenadeChargeSnapshot(player);

        let label = '';
        let progress = 0;
        let primaryColor = 'rgba(255, 209, 102, 0.98)';
        let backgroundColor = 'rgba(255, 209, 102, 0.18)';
        let fillColor = 'rgba(255, 209, 102, 0.08)';
        let textColor = 'rgba(255, 236, 194, 0.92)';
        let beamColor = '';

        if (grenadeChargeState.active) {
            progress = Math.max(0, Math.min(1, grenadeChargeState.progress || 0));
            label = grenadeChargeState.ready ? 'THROW' : 'GRENADE';
            primaryColor = 'rgba(255, 173, 73, 0.98)';
            backgroundColor = 'rgba(255, 173, 73, 0.18)';
            fillColor = 'rgba(255, 173, 73, 0.08)';
            textColor = 'rgba(255, 241, 214, 0.96)';
        } else if (reloadState.active && reloadState.weaponType === this.currentWeapon) {
            const durationMs = Math.max(1, reloadState.durationMs || weapon?.reloadTime || 1);
            const remainingMs = Math.max(0, reloadState.endsAt - Date.now());
            progress = Math.max(0, Math.min(1, 1 - (remainingMs / durationMs)));
            label = 'RELOAD';
        } else if (weapon?.chargeTime && chargeState.active && chargeState.weaponType === this.currentWeapon) {
            progress = Math.max(0, Math.min(1, chargeState.progress || 0));
            label = chargeState.ready ? 'READY' : 'CHARGE';
            primaryColor = 'rgba(183, 243, 255, 0.98)';
            backgroundColor = 'rgba(103, 201, 255, 0.2)';
            fillColor = 'rgba(103, 201, 255, 0.1)';
            textColor = 'rgba(216, 250, 255, 0.96)';
            beamColor = `rgba(103, 201, 255, ${0.22 + progress * 0.35})`;
        }

        if (!label) {
            return;
        }

        const radius = 24;

        this.ctx.save();

        if (beamColor) {
            const playerScreen = this.cameraSystem.worldToScreen(player.x, player.y);
            this.ctx.beginPath();
            this.ctx.moveTo(playerScreen.x, playerScreen.y);
            this.ctx.lineTo(this.mouse.x, this.mouse.y);
            this.ctx.strokeStyle = beamColor;
            this.ctx.lineWidth = 1.5 + progress * 2;
            this.ctx.lineCap = 'round';
            this.ctx.stroke();
        }

        this.ctx.beginPath();
        this.ctx.arc(this.mouse.x, this.mouse.y, radius, 0, Math.PI * 2);
        this.ctx.strokeStyle = backgroundColor;
        this.ctx.lineWidth = 4;
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(this.mouse.x, this.mouse.y, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress));
        this.ctx.strokeStyle = primaryColor;
        this.ctx.lineWidth = 4;
        this.ctx.lineCap = 'round';
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(this.mouse.x, this.mouse.y, radius - 10, 0, Math.PI * 2);
        this.ctx.fillStyle = fillColor;
        this.ctx.fill();

        this.ctx.fillStyle = textColor;
        this.ctx.font = 'bold 10px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(label, this.mouse.x, this.mouse.y - radius - 10);

        this.ctx.restore();
    }

    drawMinimap(cameraX = 0, cameraY = 0) {
        if (!this.inGame || !this.canvas || !this.ctx) {
            return;
        }

        const { width: worldWidth, height: worldHeight } = this.getArenaDimensions();
        if (!worldWidth || !worldHeight) {
            return;
        }

        const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));
        const config = this.minimapConfig || { width: 210, height: 158, margin: 18, padding: 12, headerHeight: 24 };
        const panelWidth = Math.min(config.width, Math.max(162, this.canvas.width * 0.28));
        const panelHeight = Math.min(config.height, Math.max(126, this.canvas.height * 0.24));
        const panelX = this.canvas.width - panelWidth - config.margin;
        const panelY = config.margin;
        const mapAreaX = panelX + config.padding;
        const mapAreaY = panelY + config.headerHeight + 8;
        const mapAreaWidth = panelWidth - config.padding * 2;
        const mapAreaHeight = panelHeight - config.headerHeight - config.padding - 10;
        const mapScale = Math.min(mapAreaWidth / worldWidth, mapAreaHeight / worldHeight);
        const mapWidth = worldWidth * mapScale;
        const mapHeight = worldHeight * mapScale;
        const mapOffsetX = mapAreaX + (mapAreaWidth - mapWidth) / 2;
        const mapOffsetY = mapAreaY + (mapAreaHeight - mapHeight) / 2;
        const zoom = Math.max(0.35, this.cameraSystem?.zoom || 1);
        const viewportWidth = Math.min(worldWidth, this.canvas.width / zoom);
        const viewportHeight = Math.min(worldHeight, this.canvas.height / zoom);
        const viewportX = clampValue(cameraX, 0, Math.max(0, worldWidth - viewportWidth));
        const viewportY = clampValue(cameraY, 0, Math.max(0, worldHeight - viewportHeight));
        const toMapPoint = (x, y) => ({
            x: mapOffsetX + clampValue(x, 0, worldWidth) * mapScale,
            y: mapOffsetY + clampValue(y, 0, worldHeight) * mapScale
        });

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 16);
        this.ctx.fillStyle = 'rgba(6, 14, 20, 0.84)';
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(116, 255, 203, 0.28)';
        this.ctx.lineWidth = 1.2;
        this.ctx.stroke();

        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        this.ctx.font = '11px Courier New';
        this.ctx.fillStyle = '#d8fff1';
        this.ctx.fillText('TACTICAL MAP', panelX + config.padding, panelY + 15);

        const arenaLabel = this.currentArenaName
            ? this.currentArenaName.slice(0, 20).toUpperCase()
            : 'LIVE ARENA';
        this.ctx.textAlign = 'right';
        this.ctx.fillStyle = 'rgba(214, 229, 238, 0.72)';
        this.ctx.fillText(arenaLabel, panelX + panelWidth - config.padding, panelY + 15);

        const mapGradient = this.ctx.createLinearGradient(mapOffsetX, mapOffsetY, mapOffsetX + mapWidth, mapOffsetY + mapHeight);
        mapGradient.addColorStop(0, 'rgba(17, 32, 40, 0.92)');
        mapGradient.addColorStop(1, 'rgba(9, 16, 22, 0.98)');
        this.ctx.beginPath();
        this.ctx.roundRect(mapOffsetX, mapOffsetY, mapWidth, mapHeight, 12);
        this.ctx.fillStyle = mapGradient;
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(125, 249, 255, 0.16)';
        this.ctx.stroke();

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.roundRect(mapOffsetX, mapOffsetY, mapWidth, mapHeight, 12);
        this.ctx.clip();

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        this.ctx.fillRect(mapOffsetX, mapOffsetY, mapWidth, mapHeight);

        (this.arenaState?.obstacles || []).forEach((obstacle) => {
            const obstacleX = mapOffsetX + clampValue(obstacle.x, 0, worldWidth) * mapScale;
            const obstacleY = mapOffsetY + clampValue(obstacle.y, 0, worldHeight) * mapScale;
            const obstacleWidth = Math.max(2, obstacle.width * mapScale);
            const obstacleHeight = Math.max(2, obstacle.height * mapScale);
            this.ctx.fillStyle = obstacle.style === 'hub'
                ? 'rgba(110, 181, 255, 0.34)'
                : 'rgba(142, 161, 173, 0.42)';
            this.ctx.fillRect(obstacleX, obstacleY, obstacleWidth, obstacleHeight);
            this.ctx.strokeStyle = 'rgba(230, 245, 255, 0.1)';
            this.ctx.strokeRect(obstacleX, obstacleY, obstacleWidth, obstacleHeight);
        });

        const viewTopLeft = toMapPoint(viewportX, viewportY);
        this.ctx.strokeStyle = 'rgba(255, 240, 201, 0.7)';
        this.ctx.lineWidth = 1.2;
        this.ctx.strokeRect(
            viewTopLeft.x,
            viewTopLeft.y,
            Math.max(8, viewportWidth * mapScale),
            Math.max(8, viewportHeight * mapScale)
        );

        this.powerUps.forEach((powerUp) => {
            const point = toMapPoint(powerUp.x, powerUp.y);
            this.ctx.fillStyle = powerUp.type === 'health'
                ? '#7bed9f'
                : powerUp.type === 'speed'
                    ? '#70d6ff'
                    : powerUp.type === 'damage'
                        ? '#ff9f43'
                        : powerUp.type === 'grenade'
                            ? '#ffad49'
                            : '#c792ea';
            this.ctx.fillRect(point.x - 1.5, point.y - 1.5, 3, 3);
        });

        this.enemies.forEach((enemy) => {
            const point = toMapPoint(enemy.x, enemy.y);
            const dotRadius = enemy.isBoss
                ? 4.6
                : enemy.type === 'brute'
                    ? 3.2
                    : enemy.type === 'marksman'
                        ? 2.8
                        : enemy.type === 'scout'
                            ? 2
                            : 2.4;
            this.ctx.beginPath();
            this.ctx.fillStyle = enemy.minimapColor || enemy.accentColor || '#ff8b78';
            this.ctx.arc(point.x, point.y, dotRadius, 0, Math.PI * 2);
            this.ctx.fill();
            if (enemy.isBoss) {
                this.ctx.strokeStyle = 'rgba(255, 240, 201, 0.82)';
                this.ctx.lineWidth = 1.1;
                this.ctx.beginPath();
                this.ctx.arc(point.x, point.y, dotRadius + 2.3, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        });

        this.players.forEach((player) => {
            const point = toMapPoint(player.x, player.y);
            const isSelf = player.id === this.playerId && !this.isSpectator;
            const dotRadius = isSelf ? 3.8 : 3;
            this.ctx.beginPath();
            this.ctx.fillStyle = !player.alive
                ? 'rgba(128, 141, 153, 0.78)'
                : isSelf
                    ? '#7eff96'
                    : '#70d6ff';
            this.ctx.arc(point.x, point.y, dotRadius, 0, Math.PI * 2);
            this.ctx.fill();

            if (isSelf && player.alive) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
                this.ctx.lineWidth = 1.2;
                this.ctx.arc(point.x, point.y, 6.2, 0, Math.PI * 2);
                this.ctx.stroke();

                this.ctx.beginPath();
                this.ctx.moveTo(point.x, point.y);
                this.ctx.lineTo(
                    point.x + Math.cos(player.angle || 0) * 8,
                    point.y + Math.sin(player.angle || 0) * 8
                );
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
                this.ctx.stroke();
            }
        });

        this.ctx.restore();

        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'alphabetic';
        this.ctx.font = '10px Courier New';
        this.ctx.fillStyle = '#70d6ff';
        this.ctx.fillText(`P ${this.players.size}`, panelX + config.padding, panelY + panelHeight - 10);
        this.ctx.fillStyle = '#ff8b78';
        this.ctx.fillText(`E ${this.enemies.size}`, panelX + config.padding + 42, panelY + panelHeight - 10);
        this.ctx.fillStyle = '#d9efe8';
        this.ctx.fillText(`WAVE ${this.wave}`, panelX + config.padding + 84, panelY + panelHeight - 10);
        this.ctx.restore();
    }

    startGame() {
        this.matchOver = false;
        this.hideMatchOver();
        this.hideRespawnOverlay();
        this.startMusic();
        this.inGame = true;
        this.applyResponsiveLayout();
        this.tryEnterLandscapeMode();
        const lobbyScreen = document.getElementById('lobbyScreen');
        const gameContainer = document.getElementById('gameContainer');
        const armoryScreen = document.getElementById('armoryScreen');
        const gameOver = document.getElementById('gameOver');
        if (lobbyScreen) {
            lobbyScreen.style.display = 'none';
        }
        if (gameContainer) {
            gameContainer.style.display = 'block';
        }
        if (armoryScreen) {
            armoryScreen.style.display = 'none';
        }
        if (gameOver) {
            gameOver.style.display = 'none';
        }
        
        // Initialize modern UI systems safely
        try {
            if (this.uiManager) {
                const player = this.players.get(this.playerId);
                if (player && !this.isSpectator) {
                    this.uiManager.createHUD({
                        health: player.health || 100,
                        maxHealth: player.maxHealth || 100,
                        ammo: this.getPlayerAmmoForWeapon(player, this.currentWeapon),
                        maxAmmo: this.getWeaponMagazineSize(this.currentWeapon),
                        weapon: this.weaponSystem.getWeapon(this.currentWeapon).name,
                        score: player.score || 0,
                        kills: player.kills || 0,
                        matchMode: this.matchMode
                    });
                }
                
                if (!this.isSpectator) {
                    this.uiManager.createCrosshair();
                }
                this.uiManager.createKillFeed();
                console.log('Game started with modern UI!');
            } else {
                console.log('Game started without modern UI (basic mode)');
            }
        } catch (error) {
            console.warn('UI initialization error:', error);
            console.log('Game started in basic mode');
        }
        
        // Initialize camera system
        const player = this.players.get(this.playerId);
        if (player && !this.isSpectator) {
            this.cameraSystem.setFollowTarget(player);
            // Start with a cinematic zoom-in effect
            this.cameraSystem.setZoom(0.5, false);
            this.cameraSystem.startCinematic('zoom', {
                targetZoom: 1.0,
                duration: 1500,
                easing: 'ease-out'
            });
        } else if (this.isSpectator) {
            this.cameraSystem.setZoom(0.85);
            this.updateSpectatorBanner(`Watching live match in ${this.currentRoomName || 'room'}`);
        }
    }

    updateRoomList(rooms) {
        if (this.isSpectator) {
            return;
        }

        console.log('Updating room list with', rooms.length, 'rooms');
        const roomListDiv = document.getElementById('roomList');
        roomListDiv.innerHTML = '';

        if (rooms.length === 0) {
            roomListDiv.innerHTML = '<p style="color: #aaa;">No rooms available</p>';
            return;
        }

        rooms.forEach(room => {
            const roomDiv = document.createElement('div');
            roomDiv.className = 'room-item';

            const roomInfo = document.createElement('div');
            roomInfo.className = 'room-info';

            const titleRow = document.createElement('div');
            titleRow.className = 'room-title-row';

            const roomTitle = document.createElement('strong');
            roomTitle.textContent = room.name;

            const isPvp = room.mode === 'pvp_ffa';
            const modeTag = document.createElement('span');
            modeTag.className = `room-mode-tag ${isPvp ? 'pvp' : 'pve'}`;
            modeTag.textContent = isPvp ? 'FREE FOR ALL' : 'CO-OP';

            const roomBadge = document.createElement('span');
            roomBadge.className = `room-badge ${room.gameStarted ? 'live' : 'open'}`;
            roomBadge.textContent = room.gameStarted ? 'LIVE MATCH' : 'STAGING';

            const badgeStack = document.createElement('div');
            badgeStack.className = 'room-badge-stack';
            badgeStack.appendChild(modeTag);
            badgeStack.appendChild(roomBadge);

            titleRow.appendChild(roomTitle);
            titleRow.appendChild(badgeStack);

            const roomStatus = document.createElement('div');
            roomStatus.className = 'room-status';
            roomStatus.textContent = `Players ${room.playerCount}/${room.maxPlayers}`;

            const playerPreview = document.createElement('div');
            playerPreview.className = 'room-player-preview';

            if (room.players && room.players.length > 0) {
                room.players.forEach(player => {
                    const pill = document.createElement('span');
                    pill.className = 'room-player-pill';
                    pill.textContent = player.isHost ? `${player.name} (Host)` : player.name;
                    playerPreview.appendChild(pill);
                });
            } else {
                const emptyPill = document.createElement('span');
                emptyPill.className = 'room-player-pill empty';
                emptyPill.textContent = 'Open slot';
                playerPreview.appendChild(emptyPill);
            }

            roomInfo.appendChild(titleRow);
            roomInfo.appendChild(roomStatus);
            roomInfo.appendChild(playerPreview);

            const joinButton = document.createElement('button');
            joinButton.textContent = room.gameStarted ? 'Join Match' : 'Join Room';
            joinButton.disabled = room.playerCount >= room.maxPlayers;
            joinButton.onclick = () => joinRoom(room.id);
            joinButton.className = `room-action${room.gameStarted ? ' live' : ''}`;

            roomDiv.appendChild(roomInfo);
            roomDiv.appendChild(joinButton);
            roomListDiv.appendChild(roomDiv);
        });
    }

    showWaitingRoom(roomName) {
        const roomControls = document.getElementById('roomControls');
        const waitingRoom = document.getElementById('waitingRoom');
        this.closeLoadoutShop();
        if (roomControls) {
            roomControls.style.display = 'none';
        }
        if (waitingRoom) {
            waitingRoom.style.display = 'block';
        }
        this.currentRoomName = roomName;
        const roomNameElement = document.getElementById('currentRoomName');
        if (roomNameElement) {
            roomNameElement.textContent = roomName;
        }
        const startButton = document.getElementById('startGameButton');
        if (startButton) {
            startButton.style.display = this.isSpectator ? 'none' : 'inline-flex';
        }
        if (this.isSpectator) {
            this.updateSpectatorBanner('Connected to room');
        }
        this.updatePlayersInRoom();
    }

    handleRoomState(roomState) {
        if (!roomState) return;
        if (this.roomId && roomState.id !== this.roomId) return;

        this.roomId = roomState.id;
        this.currentRoomName = roomState.name;
        this.currentArenaName = roomState.arenaName || '';
        this.currentRoomHostId = roomState.hostId;
        this.matchMode = roomState.mode || this.matchMode;
        this.matchSettings = roomState.matchSettings || null;
        this.roomRoster = roomState.players || [];
        if (this.isSpectator) {
            this.updateSpectatorBanner(roomState.gameStarted ? `Watching ${roomState.name}` : `Waiting in ${roomState.name}`);
        }
        this.refreshSpectatorControls();
        const localPlayer = this.roomRoster.find((player) => player.id === this.playerId);
        if (localPlayer?.skinTheme && localPlayer.skinTheme !== this.selectedSkin) {
            this.selectedSkin = localPlayer.skinTheme;
            this.saveSelectedSkin(localPlayer.skinTheme);
            this.updateSkinSelector();
        }
        if (localPlayer?.selectedWeapon && localPlayer.selectedWeapon !== this.selectedLoadoutWeapon && this.isWeaponUnlocked(localPlayer.selectedWeapon)) {
            this.selectedLoadoutWeapon = localPlayer.selectedWeapon;
            this.saveSelectedLoadoutWeapon(localPlayer.selectedWeapon);
            if (!this.inGame) {
                this.currentWeapon = localPlayer.selectedWeapon;
            }
            this.updateWeaponSelector();
        }

        const roomName = document.getElementById('currentRoomName');
        if (roomName) {
            roomName.textContent = roomState.name;
        }

        this.updatePlayersInRoom();
    }

    showWaveNotification(waveData) {
        const wave = typeof waveData === 'number' ? waveData : (waveData?.wave || this.wave);
        const bossWave = Boolean(waveData?.bossWave);
        const label = bossWave
            ? (waveData?.bossName ? `${waveData.bossName.toUpperCase()} INBOUND` : `BOSS WAVE ${wave}`)
            : (waveData?.label ? waveData.label.toUpperCase() : `WAVE ${wave}`);
        const background = bossWave ? 'rgba(53, 27, 3, 0.94)' : 'rgba(255, 0, 0, 0.9)';
        const border = bossWave ? '#ffd166' : '#ff0000';

        // Create a temporary notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: ${background};
            color: white;
            padding: 20px;
            border: 3px solid ${border};
            font-size: 24px;
            font-weight: bold;
            z-index: 1000;
            border-radius: 10px;
            box-shadow: 0 18px 42px rgba(0, 0, 0, 0.35);
        `;
        notification.textContent = label;
        document.body.appendChild(notification);
        
        // Remove after 2 seconds
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 2000);
    }

    showGameOver(finalWave, leaderboard) {
        this.stopMusic();
        document.getElementById('finalWave').textContent = finalWave;
        
        // Auto-show leaderboard after game ends
        if (leaderboard) {
            // Small delay to ensure death screen appears first
            setTimeout(() => {
                this.displayLeaderboard(leaderboard);
            }, 1000);
        }
    }

    displayLeaderboard(leaderboard) {
        const leaderboardDiv = document.getElementById('leaderboard');
        const leaderboardListDiv = document.getElementById('leaderboardList');
        
        if (!leaderboardDiv) {
            console.error('Leaderboard element not found');
            return;
        }
        
        if (!leaderboardListDiv) {
            console.error('Leaderboard list element not found');
            return;
        }
        
        let content = '';
        
        if (!leaderboard || leaderboard.length === 0) {
            content = `
                <div style="color: #aaa; text-align: center; padding: 20px;">
                    <p>No scores yet! Be the first to play!</p>
                    <p style="font-size: 14px; color: #666;">Complete a game to appear on the leaderboard</p>
                </div>
            `;
        } else {
            // Add leaderboard header
            content += `
                <div class="leaderboard-entry" style="background: #444; font-weight: bold; margin-bottom: 10px;">
                    <span class="leaderboard-rank">Rank</span>
                    <span class="leaderboard-name">Name</span>
                    <span class="leaderboard-score">Score</span>
                    <span class="leaderboard-wave">Wave</span>
                    <span class="leaderboard-date">Date</span>
                </div>
            `;
            
            // Display top entries (limit to 10 for UI purposes)
            leaderboard.slice(0, 10).forEach((entry, index) => {
                const rank = index + 1;
                const rankClass = rank <= 3 ? `rank-${rank}` : '';
                content += `
                    <div class="leaderboard-entry ${rankClass}">
                        <span class="leaderboard-rank">${rank}.</span>
                        <span class="leaderboard-name">${entry.name || 'Anonymous'}</span>
                        <span class="leaderboard-score">${entry.score || 0}</span>
                        <span class="leaderboard-wave">W${entry.wave || 1}</span>
                        <span class="leaderboard-date">${entry.date || 'N/A'}</span>
                    </div>
                `;
            });
            
            if (leaderboard.length > 10) {
                content += `<p style="color: #aaa; font-size: 12px; text-align: center; margin-top: 10px;">
                    Showing top 10 of ${leaderboard.length} entries
                </p>`;
            }
        }
        
        // Update only the leaderboard list content, not the whole modal
        leaderboardListDiv.innerHTML = content;
        leaderboardDiv.style.display = 'block';
        
        console.log('Full leaderboard modal displayed with', leaderboard ? leaderboard.length : 0, 'entries');
    }



    showDeathScreen() {
        const myPlayer = this.players.get(this.playerId);
        if (myPlayer) {
            document.getElementById('currentScore').textContent = myPlayer.score;
            document.getElementById('currentWave').textContent = this.wave;
        }
        document.getElementById('deathScreen').style.display = 'block';
        this.updateMobileControlsState();
    }

    hideDeathScreen() {
        document.getElementById('deathScreen').style.display = 'none';
        this.updateMobileControlsState();
    }

    showPersonalGameOver(endData) {
        this.stopMusic();
        this.hideDeathScreen();
        
        // Show final results
        document.getElementById('finalScore').textContent = endData.finalScore;
        document.getElementById('finalWave').textContent = endData.finalWave;
        const rewardRow = document.getElementById('finalMetaRewardRow');
        const rewardValue = document.getElementById('finalMetaReward');
        if (rewardRow && rewardValue) {
            const reward = Number(endData?.metaReward || 0);
            rewardRow.style.display = reward > 0 ? 'block' : 'none';
            rewardValue.textContent = reward;
        }
        document.getElementById('gameOver').style.display = 'block';
        
        // Return to lobby
        setTimeout(() => {
            this.returnToLobby();
        }, 3000);
    }

    returnToLobby() {
        this.closeLoadoutShop();
        document.getElementById('gameOver').style.display = 'none';
        document.getElementById('deathScreen').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'none';
        document.getElementById('lobbyScreen').style.display = 'block';
        document.getElementById('waitingRoom').style.display = 'none';
        this.hideShop();
        this.hideMatchOver();
        this.hideRespawnOverlay();
        this.matchOver = false;
        this.matchState = null;
        this.matchMode = 'pve';
        this.inGame = false;
        this.roomId = null;
        this.currentRoomName = '';
        this.currentArenaName = '';
        this.currentRoomHostId = null;
        this.roomRoster = [];
        this.shopState = { active: false, endsAt: 0, durationMs: 0, endVote: { votes: 0, required: 0, playerIds: [] } };
        this.cancelLocalWeaponCharge();
        this.cancelGrenadeCharge({ silent: true });
        this.disarmChargedShot();
        this.clearReloadRequestLock();
        this.currentWeapon = this.selectedLoadoutWeapon || this.defaultWeaponId;
        this.resetMobileControlState();
        this.applyResponsiveLayout();
        this.exitLandscapeMode();
        
        // Reset game state
        this.players.clear();
        this.bullets.clear();
        this.grenades.clear();
        this.enemies.clear();
        this.particles.clear();
        this.powerUps.clear();
        this.grenadeRequestLockUntil = 0;
        this.applyArenaState(this.getDefaultArenaState());
        this.lastPlayerState = null;
        const rewardRow = document.getElementById('finalMetaRewardRow');
        if (rewardRow) {
            rewardRow.style.display = 'none';
        }
        this.syncLobbyIdentityState();
    }

    updatePlayersInRoom() {
        const playersDiv = document.getElementById('playersInRoom');
        const roomCode = document.getElementById('roomCodeValue');
        const roomStatus = document.getElementById('stagingStatus');
        const roomHint = document.getElementById('stagingHint');
        const startButton = document.getElementById('startGameButton');
        const hostBanner = document.getElementById('roomHostLabel');
        const roster = this.roomRoster || [];

        if (roomCode) {
            roomCode.textContent = this.roomId ? this.roomId.slice(0, 8).toUpperCase() : '----';
        }

        if (hostBanner) {
            const host = roster.find(player => player.id === this.currentRoomHostId);
            hostBanner.textContent = host ? `Host: ${host.name}` : 'Host: Waiting';
        }

        if (roomStatus) {
            roomStatus.textContent = `${roster.length}/4 operators in staging`;
        }

        if (roomHint) {
            const baseHint = roster.length > 1
                ? 'Everyone in this room is visible before launch. The host can start when ready.'
                : 'Invite more players or start solo. New arrivals will appear here live.';
            const modeLabel = this.matchMode === 'pvp_ffa' ? 'Mode: Free For All' : 'Mode: Co-op Survival';
            const matchSettings = this.matchSettings && typeof this.matchSettings === 'object' ? this.matchSettings : null;
            const killLimit = matchSettings && Number.isFinite(matchSettings.killLimit) ? matchSettings.killLimit : null;
            const timeLimitMs = matchSettings && Number.isFinite(matchSettings.timeLimitMs) ? matchSettings.timeLimitMs : null;
            const timeMinutes = timeLimitMs ? Math.max(1, Math.round(timeLimitMs / 60000)) : null;
            const modeConfig = this.matchMode === 'pvp_ffa' && (killLimit || timeMinutes)
                ? ` (${killLimit ? `${killLimit} kills` : ''}${killLimit && timeMinutes ? ', ' : ''}${timeMinutes ? `${timeMinutes} min` : ''})`
                : '';
            const prefix = `${modeLabel}${modeConfig}. `;
            roomHint.textContent = this.currentArenaName
                ? `${prefix}${baseHint} Next arena: ${this.currentArenaName}.`
                : `${prefix}${baseHint}`;
        }

        if (startButton) {
            const amHost = !this.isSpectator && this.playerId && this.playerId === this.currentRoomHostId;
            startButton.disabled = !amHost;
            startButton.textContent = this.isSpectator ? 'Spectating' : (amHost ? 'Launch Match' : 'Host Controls Launch');
        }

        this.refreshSpectatorControls();

        playersDiv.innerHTML = '';

        if (roster.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'player-item player-item-empty';
            emptyState.textContent = 'Waiting for players to join the room...';
            playersDiv.appendChild(emptyState);
            return;
        }

        roster.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = `player-item${player.id === this.playerId ? ' is-you' : ''}`;

            const avatar = document.createElement('div');
            const skinTheme = player.skinTheme || this.defaultSkinId || `player${(index % 4) + 1}`;
            avatar.className = 'staging-avatar';
            const skinUrl = this.getSkinAssetUrl(skinTheme);
            if (skinUrl) {
                avatar.style.backgroundImage = `url("${skinUrl}")`;
                avatar.style.backgroundSize = 'contain';
                avatar.style.backgroundPosition = 'center';
                avatar.style.backgroundRepeat = 'no-repeat';
                avatar.style.backgroundColor = 'rgba(8, 14, 20, 0.85)';
                avatar.textContent = '';
            } else {
                avatar.classList.add(skinTheme);
                avatar.textContent = (player.name || '?').slice(0, 1).toUpperCase();
            }

            const details = document.createElement('div');
            details.className = 'staging-player-details';

            const nameRow = document.createElement('div');
            nameRow.className = 'staging-name-row';

            const name = document.createElement('div');
            name.className = 'staging-player-name';
            name.textContent = player.id === this.playerId ? `${player.name} (You)` : player.name;

            nameRow.appendChild(name);

            if (player.id === this.currentRoomHostId) {
                const hostTag = document.createElement('span');
                hostTag.className = 'staging-tag host';
                hostTag.textContent = 'HOST';
                nameRow.appendChild(hostTag);
            }

            const meta = document.createElement('div');
            meta.className = 'staging-player-meta';
            const selectedWeaponLabel = this.weaponAssetCatalog[player.selectedWeapon]?.label || player.selectedWeapon || 'Pistol';
            meta.textContent = this.inGame
                ? `${player.alive ? 'Alive in match' : 'Waiting to respawn'} • ${selectedWeaponLabel}`
                : `Ready in staging • ${selectedWeaponLabel}`;

            details.appendChild(nameRow);
            details.appendChild(meta);
            playerDiv.appendChild(avatar);
            playerDiv.appendChild(details);
            playersDiv.appendChild(playerDiv);
        });
    }
}

// Global functions for UI
function setPlayerName() {
    const nameInput = document.getElementById('playerNameInput');
    const fallbackName = window.game?.profile?.username || '';
    const name = (nameInput.value.trim() || fallbackName).trim();
    
    if (name.length < 2) {
        alert('Name must be at least 2 characters long');
        return;
    }
    
    window.game.playerName = name;
    nameInput.value = name;
    window.game.syncLobbyIdentityState();
}

function createRoom() {
    const roomNameInput = document.getElementById('roomNameInput');
    const roomName = roomNameInput.value.trim();
    
    if (roomName.length < 3) {
        alert('Room name must be at least 3 characters long');
        return;
    }

    if (!window.game.playerName && window.game.profile?.username) {
        window.game.playerName = window.game.profile.username;
    }

    const modeSelect = document.getElementById('roomModeSelect');
    const roomMode = modeSelect ? modeSelect.value : 'pve';
    const roomOptions = {};
    if (roomMode === 'pvp_ffa') {
        const killLimitInput = document.getElementById('pvpKillLimitInput');
        const timeLimitInput = document.getElementById('pvpTimeLimitInput');
        const rawKillLimit = killLimitInput ? Number(killLimitInput.value) : NaN;
        const rawTimeLimitMinutes = timeLimitInput ? Number(timeLimitInput.value) : NaN;
        if (Number.isFinite(rawKillLimit)) {
            roomOptions.killLimit = rawKillLimit;
        }
        if (Number.isFinite(rawTimeLimitMinutes)) {
            roomOptions.timeLimitMinutes = rawTimeLimitMinutes;
        }
    }
    
    window.game.socket.emit('createRoom', roomName, window.game.playerName, window.game.selectedSkin, window.game.selectedLoadoutWeapon, roomMode, roomOptions);
}

function joinRoom(roomId) {
    if (!window.game.playerName && window.game.profile?.username) {
        window.game.playerName = window.game.profile.username;
    }
    window.game.socket.emit('joinRoom', roomId, window.game.playerName, window.game.selectedSkin, window.game.selectedLoadoutWeapon);
}

function leaveRoom() {
    window.game.socket.disconnect();
    window.game.connectToServer();
    
    document.getElementById('waitingRoom').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'none';
    document.getElementById('lobbyScreen').style.display = 'block';
    window.game.closeLoadoutShop();
    window.game.hideShop();
    window.game.hideMatchOver();
    window.game.hideRespawnOverlay();
    window.game.matchOver = false;
    window.game.matchState = null;
    window.game.matchMode = 'pve';
    window.game.inGame = false;
    window.game.roomId = null;
    window.game.currentRoomName = '';
    window.game.currentRoomHostId = null;
    window.game.roomRoster = [];
    window.game.shopState = { active: false, endsAt: 0, durationMs: 0, endVote: { votes: 0, required: 0, playerIds: [] } };
    window.game.resetMobileControlState();
    window.game.applyResponsiveLayout();
    window.game.exitLandscapeMode();
    window.game.syncLobbyIdentityState();
    window.game.updatePlayersInRoom();
}

function startMultiplayerGame() {
    window.game.tryEnterLandscapeMode({ requestFullscreen: true });
    window.game.socket.emit('startGame');
}

function restartGame() {
    leaveRoom();
}

// Simple leaderboard functions
function showLeaderboard() {
    console.log('showLeaderboard called - opening full modal');
    
    if (window.game && window.game.socket && window.game.connected) {
        console.log('Requesting full leaderboard from server...');
        window.game.showingFullLeaderboard = true;
        window.game.socket.emit('getLeaderboard');
    } else {
        console.log('Not connected, showing offline leaderboard');
        // Show offline message if not connected
        displayOfflineLeaderboard();
    }
}

function hideLeaderboard() {
    document.getElementById('leaderboard').style.display = 'none';
}

function closeLeaderboard() {
    hideLeaderboard();
}

// Update the lobby leaderboard display
function updateLobbyLeaderboard(leaderboard) {
    const topPlayersDiv = document.getElementById('topPlayersList');
    
    if (!topPlayersDiv) {
        console.log('Top players div not found, probably in game');
        return;
    }
    
    if (!leaderboard || leaderboard.length === 0) {
        topPlayersDiv.innerHTML = `
            <div style="color: #aaa; text-align: center; padding: 15px; font-style: italic; font-size: 11px;">
                No scores yet!<br>Be the first! 🎯
            </div>
        `;
        return;
    }
    
    let content = '';
    const topPlayers = leaderboard.slice(0, 5); // Top 5 players
    
    topPlayers.forEach((player, index) => {
        const rank = index + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        const medal = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
        
        // Truncate long names for compact display
        const displayName = (player.name || 'Anonymous').length > 12 
            ? (player.name || 'Anonymous').substring(0, 12) + '...' 
            : (player.name || 'Anonymous');
        
        content += `
            <div class="top-player-item ${rankClass}">
                <div class="top-player-rank ${rankClass}">${medal}</div>
                <div class="top-player-info">
                    <div class="top-player-name">${displayName}</div>
                    <div class="top-player-details">W${player.wave || 1}</div>
                </div>
                <div class="top-player-score">${(player.score || 0).toLocaleString()}</div>
            </div>
        `;
    });
    
    topPlayersDiv.innerHTML = content;
    console.log('Lobby leaderboard updated with', topPlayers.length, 'players');
}

// Request leaderboard data for lobby display
function refreshLobbyLeaderboard() {
    if (window.game && window.game.socket && window.game.connected) {
        console.log('Requesting leaderboard for lobby display...');
        window.game.showingFullLeaderboard = false;
        window.game.socket.emit('getLeaderboard');
    } else {
        console.log('Not connected, showing offline lobby leaderboard');
        // Show offline state
        updateLobbyLeaderboard([]);
    }
}

// Test function to directly show modal with test data
function testFullLeaderboardModal() {
    console.log('Testing full leaderboard modal directly');
    const testData = [
        { name: 'Zalmi', score: 12300, wave: 8, date: '2025-10-17' },
        { name: 'TestPlayer1', score: 1500, wave: 8, date: '2025-10-16' },
        { name: 'TestPlayer2', score: 1200, wave: 6, date: '2025-10-16' }
    ];
    
    if (window.game) {
        window.game.displayLeaderboard(testData);
    } else {
        console.error('window.game not found!');
    }
}

function displayOfflineLeaderboard() {
    const leaderboardDiv = document.getElementById('leaderboard');
    const leaderboardListDiv = document.getElementById('leaderboardList');
    
    if (!leaderboardDiv || !leaderboardListDiv) {
        console.error('Leaderboard elements not found');
        return;
    }
    
    leaderboardListDiv.innerHTML = `
        <div style="color: #ff6b6b; text-align: center; padding: 20px; margin: 20px 0;">
            <div style="font-size: 48px; margin-bottom: 10px;">📡</div>
            <p><strong>Not connected to server</strong></p>
            <p style="font-size: 14px; color: #aaa; margin-top: 10px;">
                Connect to the game server to view the live leaderboard with player scores and rankings.
            </p>
        </div>
    `;
    leaderboardDiv.style.display = 'block';
}

function respawnPlayer() {
    if (window.game) {
        window.game.requestRespawn();
    }
}

function endGameSession() {
    if (window.game) {
        window.game.requestEndGame();
    }
}

function buyUpgrade(upgradeType) {
    if (window.game) {
        window.game.requestUpgradePurchase(upgradeType);
    }
}

// Refresh rooms function
function refreshRooms() {
    console.log('Manually refreshing rooms...');
    if (window.game && window.game.socket && window.game.connected) {
        // Request fresh room list from server
        window.game.socket.emit('getRooms');
    } else {
        console.log('Not connected to server - cannot refresh rooms');
        alert('Not connected to server. Please refresh the page.');
    }
}

// Weapon System Classes
class WeaponSystem {
    constructor(weaponEntries = null, defaultWeaponId = FALLBACK_DEFAULT_WEAPON_ID) {
        this.defaultWeaponId = defaultWeaponId || FALLBACK_DEFAULT_WEAPON_ID;
        this.weaponOrder = [];
        this.weapons = {};
        this.configureFromCatalog(
            Array.isArray(weaponEntries) && weaponEntries.length > 0 ? weaponEntries : cloneWeaponCatalogEntries(),
            this.defaultWeaponId
        );
    }

    normalizeWeaponEntry(entry = {}, fallback = {}) {
        const stats = entry?.stats && typeof entry.stats === 'object' ? entry.stats : {};
        const fx = entry?.fx && typeof entry.fx === 'object' ? entry.fx : {};
        const presentation = entry?.presentation && typeof entry.presentation === 'object' ? entry.presentation : {};
        const id = entry.id || fallback.id || FALLBACK_DEFAULT_WEAPON_ID;
        const label = entry.label || entry.name || fallback.label || fallback.name || id;
        const resolveNumber = (value, fallbackValue) => Number.isFinite(Number(value)) ? Number(value) : fallbackValue;

        return {
            id,
            name: label,
            label,
            description: entry.description || fallback.description || '',
            cost: Math.max(0, Math.round(resolveNumber(entry.cost, fallback.cost || 0))),
            sortOrder: Math.max(0, Math.round(resolveNumber(entry.sortOrder, fallback.sortOrder || 0))),
            behaviorId: entry.behaviorId || fallback.behaviorId || 'projectile',
            slot: entry.slot || fallback.slot || 'primary',
            publicUrl: entry.publicUrl || fallback.publicUrl || '',
            artPath: entry.artPath || fallback.artPath || '',
            pelletCount: Math.max(1, Math.round(resolveNumber(stats.pelletCount ?? entry.pelletCount, fallback.pelletCount || 1))),
            damage: Math.max(1, resolveNumber(stats.damage ?? entry.damage, fallback.damage || 1)),
            range: Math.max(1, resolveNumber(stats.range ?? entry.range, fallback.range || 1)),
            spread: Math.max(0, resolveNumber(stats.spread ?? entry.spread, fallback.spread || 0)),
            cooldown: Math.max(0, Math.round(resolveNumber(stats.cooldown ?? entry.cooldown, fallback.cooldown || 0))),
            speed: Math.max(1, resolveNumber(stats.speed ?? entry.speed, fallback.speed || 600)),
            magazineSize: Math.max(1, Math.round(resolveNumber(stats.magazineSize ?? entry.magazineSize, fallback.magazineSize || 1))),
            reloadTime: Math.max(0, Math.round(resolveNumber(stats.reloadTime ?? entry.reloadTime, fallback.reloadTime || 0))),
            chargeTime: Math.max(0, Math.round(resolveNumber(stats.chargeTime ?? entry.chargeTime, fallback.chargeTime || 0))),
            recoilForce: Math.max(0, resolveNumber(fx.recoilForce ?? entry.recoilForce, fallback.recoilForce || 0)),
            muzzleFlashDuration: Math.max(0, Math.round(resolveNumber(
                fx.muzzleFlashDuration ?? entry.muzzleFlashDuration,
                fallback.muzzleFlashDuration || 0
            ))),
            shellEjection: fx.shellEjection !== undefined
                ? Boolean(fx.shellEjection)
                : (entry.shellEjection !== undefined ? Boolean(entry.shellEjection) : Boolean(fallback.shellEjection)),
            energyBeam: fx.energyBeam !== undefined
                ? Boolean(fx.energyBeam)
                : (entry.energyBeam !== undefined ? Boolean(entry.energyBeam) : Boolean(fallback.energyBeam)),
            sound: fx.sound || entry.sound || fallback.sound || 'weapon_fire',
            impactColor: fx.impactColor || entry.impactColor || fallback.impactColor || '#ffffff',
            hitRadius: Math.max(1, resolveNumber(fx.hitRadius ?? entry.hitRadius, fallback.hitRadius || 3)),
            crosshairColor: presentation.crosshairColor || entry.crosshairColor || fallback.crosshairColor || '#ffffff',
            spreadGuideColor: presentation.spreadGuideColor || entry.spreadGuideColor || fallback.spreadGuideColor || 'rgba(255, 255, 255, 0.24)',
            holdOffset: resolveNumber(presentation.holdOffset ?? entry.holdOffset, fallback.holdOffset || 18),
            muzzleOffset: resolveNumber(presentation.muzzleOffset ?? entry.muzzleOffset, fallback.muzzleOffset || 16),
            ejectBackOffset: resolveNumber(presentation.ejectBackOffset ?? entry.ejectBackOffset, fallback.ejectBackOffset || 5),
            ejectSideOffset: resolveNumber(presentation.ejectSideOffset ?? entry.ejectSideOffset, fallback.ejectSideOffset || -7),
            shellEjectAngleBias: resolveNumber(
                presentation.shellEjectAngleBias ?? entry.shellEjectAngleBias,
                fallback.shellEjectAngleBias || -0.08
            ),
            smokeTrailScale: Math.max(0, resolveNumber(
                presentation.smokeTrailScale ?? entry.smokeTrailScale,
                fallback.smokeTrailScale || 0
            )),
            showSpreadIndicator: presentation.showSpreadIndicator !== undefined
                ? Boolean(presentation.showSpreadIndicator)
                : (entry.showSpreadIndicator !== undefined
                    ? Boolean(entry.showSpreadIndicator)
                    : Boolean(fallback.showSpreadIndicator))
        };
    }

    configureFromCatalog(weaponEntries = [], defaultWeaponId = this.defaultWeaponId) {
        const fallbackEntries = cloneWeaponCatalogEntries();
        const fallbackById = Object.fromEntries(fallbackEntries.map((entry) => {
            const stats = entry.stats || {};
            const fx = entry.fx || {};
            const presentation = entry.presentation || {};
            return [entry.id, {
                id: entry.id,
                label: entry.label,
                description: entry.description,
                cost: entry.cost,
                sortOrder: entry.sortOrder,
                behaviorId: entry.behaviorId,
                slot: entry.slot,
                publicUrl: entry.publicUrl,
                artPath: entry.artPath,
                ...stats,
                ...fx,
                ...presentation
            }];
        }));
        const sourceEntries = Array.isArray(weaponEntries) && weaponEntries.length > 0 ? weaponEntries : fallbackEntries;
        const normalizedEntries = sourceEntries
            .filter((entry) => entry?.id && entry.playable !== false)
            .map((entry) => this.normalizeWeaponEntry(entry, fallbackById[entry.id] || fallbackById[FALLBACK_DEFAULT_WEAPON_ID]))
            .sort((left, right) => {
                if (left.sortOrder !== right.sortOrder) {
                    return left.sortOrder - right.sortOrder;
                }
                return (left.label || left.id).localeCompare(right.label || right.id);
            });

        if (normalizedEntries.length === 0) {
            const emergencyFallback = fallbackEntries.map((entry) => this.normalizeWeaponEntry(entry, fallbackById[entry.id]));
            this.weaponOrder = emergencyFallback.map((entry) => entry.id);
            this.weapons = Object.fromEntries(emergencyFallback.map((entry) => [entry.id, entry]));
            this.defaultWeaponId = this.weaponOrder[0] || FALLBACK_DEFAULT_WEAPON_ID;
            return;
        }

        this.weaponOrder = normalizedEntries.map((entry) => entry.id);
        this.weapons = Object.fromEntries(normalizedEntries.map((entry) => [entry.id, entry]));
        this.defaultWeaponId = this.weapons[defaultWeaponId] ? defaultWeaponId : this.weaponOrder[0];
    }

    getWeaponOrder() {
        return [...this.weaponOrder];
    }

    getWeapon(weaponType) {
        return this.weapons[weaponType] || this.weapons[this.defaultWeaponId] || Object.values(this.weapons)[0];
    }

    // Calculate damage based on distance (damage falloff)
    calculateDamage(weapon, distance) {
        const maxDamage = weapon.damage;
        const falloffStart = weapon.range * 0.3; // 30% of max range
        
        if (distance <= falloffStart) {
            return maxDamage; // Full damage up close
        } else if (distance >= weapon.range) {
            return Math.max(1, maxDamage * 0.1); // Minimum 10% damage at max range
        } else {
            // Linear falloff between 30% and 100% of range
            const falloffRatio = (distance - falloffStart) / (weapon.range - falloffStart);
            return Math.max(1, maxDamage * (1 - falloffRatio * 0.9));
        }
    }

    // Generate pellet trajectories for shotgun spread
    generatePellets(weapon, centerAngle, startX, startY) {
        const pellets = [];
        
        for (let i = 0; i < weapon.pelletCount; i++) {
            // Random spread around center angle
            const spreadAngle = (Math.random() - 0.5) * weapon.spread;
            const pelletAngle = centerAngle + spreadAngle;
            
            // Calculate velocity components
            const speed = 800; // pixels per second
            const velocityX = Math.cos(pelletAngle) * speed;
            const velocityY = Math.sin(pelletAngle) * speed;
            
            pellets.push({
                id: `pellet_${Date.now()}_${i}`,
                x: startX,
                y: startY,
                velocityX,
                velocityY,
                angle: pelletAngle,
                damage: weapon.damage,
                range: weapon.range,
                distanceTraveled: 0,
                lifetime: weapon.range / speed * 1000, // milliseconds
                startTime: Date.now()
            });
        }
        
        return pellets;
    }
}

class ShellCasing {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.velocityX = Math.cos(angle + Math.PI/2) * (100 + Math.random() * 50);
        this.velocityY = Math.sin(angle + Math.PI/2) * (100 + Math.random() * 50) - 50;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 10;
        this.gravity = 300;
        this.bounce = 0.4;
        this.friction = 0.8;
        this.lifetime = 3000 + Math.random() * 2000;
        this.startTime = Date.now();
        this.grounded = false;
    }

    update(deltaTime) {
        if (!this.grounded) {
            // Apply physics
            this.x += this.velocityX * deltaTime;
            this.y += this.velocityY * deltaTime;
            this.velocityY += this.gravity * deltaTime;
            this.rotation += this.rotationSpeed * deltaTime;

            // Ground collision (simple)
            if (this.y > 580) { // Assuming canvas height is 600
                this.y = 580;
                this.velocityY *= -this.bounce;
                this.velocityX *= this.friction;
                this.rotationSpeed *= this.friction;
                
                if (Math.abs(this.velocityY) < 20) {
                    this.grounded = true;
                    this.velocityY = 0;
                }
            }
        }
        
        return Date.now() - this.startTime < this.lifetime;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // Draw shell casing
        ctx.fillStyle = '#b8860b'; // Dark goldenrod
        ctx.fillRect(-3, -1, 6, 2);
        ctx.fillStyle = '#daa520'; // Goldenrod
        ctx.fillRect(-2, -0.5, 4, 1);
        
        ctx.restore();
    }
}

// Initialize the multiplayer game when the page loads
window.addEventListener('load', () => {
    window.game = new MultiplayerGame(window.GAME_BOOTSTRAP || {});
    
    // Hide the game container initially
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.style.display = 'none';
    }
});
