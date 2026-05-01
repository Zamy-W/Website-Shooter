'use strict';

/**
 * AudioManager — procedural Web Audio API sound engine.
 * No audio files needed; all sounds are synthesised at runtime.
 * Lazy-initialises on first play() call (respects browser autoplay policy).
 */
class AudioManager {
    constructor() {
        this._ctx          = null;
        this._masterGain   = null;
        this._sfxGain      = null;
        this._musicGain    = null;
        this._initialized  = false;
        this._noiseBuffer  = null;

        // Volume settings (0–1)
        this.masterVolume  = 0.72;
        this.sfxVolume     = 0.85;
        this.musicVolume   = 0.22;

        // Music state
        this._musicPlaying = false;
        this._musicIntervals = [];

        // Load saved prefs
        try {
            const saved = JSON.parse(localStorage.getItem('audioPrefs') || '{}');
            if (typeof saved.master === 'number') this.masterVolume = saved.master;
            if (typeof saved.sfx    === 'number') this.sfxVolume    = saved.sfx;
            if (typeof saved.music  === 'number') this.musicVolume  = saved.music;
        } catch (_) {}
    }

    // ── Init ────────────────────────────────────────────────────────────────

    _init() {
        if (this._initialized) return;
        try {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();

            this._masterGain = this._ctx.createGain();
            this._masterGain.gain.value = this.masterVolume;
            this._masterGain.connect(this._ctx.destination);

            this._sfxGain = this._ctx.createGain();
            this._sfxGain.gain.value = this.sfxVolume;
            this._sfxGain.connect(this._masterGain);

            this._musicGain = this._ctx.createGain();
            this._musicGain.gain.value = this.musicVolume;
            this._musicGain.connect(this._masterGain);

            this._noiseBuffer = this._buildNoiseBuffer(1.5);
            this._initialized = true;
        } catch (e) {
            console.warn('[AudioManager] Web Audio not available:', e);
        }
    }

    _resume() {
        if (this._ctx?.state === 'suspended') this._ctx.resume();
    }

    _buildNoiseBuffer(duration = 1.5) {
        const sr = this._ctx.sampleRate;
        const len = Math.ceil(sr * duration);
        const buf = this._ctx.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return buf;
    }

    // ── Low-level building blocks ────────────────────────────────────────────

    _noise({ volume = 0.5, attack = 0.001, decay = 0.15, hp = 0, lp = 22000, dest = null } = {}) {
        if (!this._ctx) return;
        const now = dest ? this._ctx.currentTime : this._ctx.currentTime;
        const out  = dest || this._sfxGain;

        const src = this._ctx.createBufferSource();
        src.buffer = this._noiseBuffer;
        src.loop   = true;

        let chain = src;
        if (hp > 0) {
            const f = this._ctx.createBiquadFilter();
            f.type = 'highpass'; f.frequency.value = hp; f.Q.value = 0.5;
            chain.connect(f); chain = f;
        }
        if (lp < 22000) {
            const f = this._ctx.createBiquadFilter();
            f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.5;
            chain.connect(f); chain = f;
        }

        const g = this._ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(volume, now + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
        chain.connect(g); g.connect(out);

        src.start(now);
        src.stop(now + attack + decay + 0.02);
    }

    _tone({ type = 'sine', freq = 440, freqEnd = null, volume = 0.3,
            attack = 0.001, decay = 0.2, dest = null } = {}) {
        if (!this._ctx) return;
        const now = this._ctx.currentTime;
        const out = dest || this._sfxGain;

        const osc = this._ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (freqEnd !== null)
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + attack + decay);

        const g = this._ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(volume, now + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
        osc.connect(g); g.connect(out);

        osc.start(now);
        osc.stop(now + attack + decay + 0.02);
    }

    /** Schedule a callback only when AudioContext is alive. */
    _delay(ms, fn) {
        setTimeout(() => { if (this._ctx && this._musicPlaying !== undefined) fn(); }, ms);
    }

    // ── Public API ───────────────────────────────────────────────────────────

    play(sound, opts = {}) {
        if (!this._initialized) this._init();
        if (!this._initialized) return;
        this._resume();

        const map = {
            shoot_pistol:   () => this._shootPistol(),
            shoot_shotgun:  () => this._shootShotgun(),
            shoot_sniper:   () => this._shootSniper(),
            shoot_smg:      () => this._shootSmg(),
            shoot_rifle:    () => this._shootRifle(),
            shoot_laser:    () => this._shootLaser(),
            shoot_plasma:   () => this._shootPlasma(),
            reload:         () => this._reload(),
            hit_enemy:      () => this._hitEnemy(),
            hit_player:     () => this._hitPlayer(),
            enemy_die:      () => this._enemyDie(),
            player_die:     () => this._playerDie(),
            explosion:      () => this._explosion(),
            grenade_throw:  () => this._grenadeThrow(),
            pickup_powerup: () => this._pickupPowerUp(),
            wave_start:     () => this._waveStart(),
            boss_warning:   () => this._bossWarning(),
            shop_open:      () => this._shopOpen(),
            upgrade_buy:    () => this._upgradeBuy(),
            ui_click:       () => this._uiClick(),
            friend_ping:    () => this._friendPing(),
            pm_receive:     () => this._pmReceive(),
            game_win:       () => this._gameWin(),
        };
        map[sound]?.();
    }

    // ── Weapon sounds ────────────────────────────────────────────────────────

    _shootPistol() {
        this._noise({ volume: 0.55, attack: 0.001, decay: 0.09, hp: 1800, lp: 8000 });
        this._tone({ type: 'triangle', freq: 190, freqEnd: 65, volume: 0.38, attack: 0.001, decay: 0.14 });
    }

    _shootShotgun() {
        this._noise({ volume: 0.88, attack: 0.001, decay: 0.2,  hp: 300,  lp: 5500 });
        this._tone({ type: 'sine',     freq: 115,  freqEnd: 38,  volume: 0.55, attack: 0.001, decay: 0.24 });
        // Second noise layer for body
        this._noise({ volume: 0.4,  attack: 0.002, decay: 0.12, hp: 600,  lp: 3000 });
    }

    _shootSniper() {
        this._noise({ volume: 0.72, attack: 0.001, decay: 0.04, hp: 4500 });
        this._noise({ volume: 0.28, attack: 0.002, decay: 0.38, hp: 180,  lp: 2800 });
        this._tone({ type: 'sine', freq: 210, freqEnd: 28, volume: 0.52, attack: 0.001, decay: 0.38 });
    }

    _shootSmg() {
        this._noise({ volume: 0.42, attack: 0.001, decay: 0.055, hp: 2200, lp: 7000 });
        this._tone({ type: 'triangle', freq: 260, freqEnd: 110, volume: 0.22, attack: 0.001, decay: 0.06 });
    }

    _shootRifle() {
        this._noise({ volume: 0.62, attack: 0.001, decay: 0.13, hp: 1100, lp: 9000 });
        this._tone({ type: 'sine', freq: 155, freqEnd: 52, volume: 0.44, attack: 0.001, decay: 0.2 });
    }

    _shootLaser() {
        this._tone({ type: 'sawtooth', freq: 1900, freqEnd: 380, volume: 0.32, attack: 0.001, decay: 0.16 });
        this._tone({ type: 'sine',     freq: 950,  freqEnd: 190, volume: 0.18, attack: 0.001, decay: 0.14 });
    }

    _shootPlasma() {
        this._tone({ type: 'sawtooth', freq: 600, freqEnd: 1200, volume: 0.28, attack: 0.01, decay: 0.12 });
        this._tone({ type: 'sine',     freq: 300, freqEnd: 150,  volume: 0.22, attack: 0.001, decay: 0.18 });
        this._noise({ volume: 0.2, attack: 0.001, decay: 0.08, hp: 4000 });
    }

    // ── Combat sounds ────────────────────────────────────────────────────────

    _reload() {
        // Click out
        this._noise({ volume: 0.28, attack: 0.001, decay: 0.04, hp: 3000 });
        // Rack in (delayed)
        setTimeout(() => {
            if (!this._ctx) return;
            this._noise({ volume: 0.38, attack: 0.001, decay: 0.06, hp: 2000 });
            this._tone({ type: 'square', freq: 620, freqEnd: 820, volume: 0.13, attack: 0.001, decay: 0.06 });
        }, 380);
    }

    _hitEnemy() {
        this._noise({ volume: 0.35, attack: 0.001, decay: 0.05, hp: 3200, lp: 10000 });
        this._tone({ type: 'sine', freq: 820, freqEnd: 410, volume: 0.18, attack: 0.001, decay: 0.06 });
    }

    _hitPlayer() {
        this._noise({ volume: 0.72, attack: 0.001, decay: 0.12, hp: 140, lp: 2200 });
        this._tone({ type: 'sine', freq: 82,  freqEnd: 38,  volume: 0.52, attack: 0.001, decay: 0.18 });
    }

    _enemyDie() {
        this._noise({ volume: 0.48, attack: 0.001, decay: 0.14, hp: 900, lp: 5500 });
        this._tone({ type: 'sine', freq: 310, freqEnd: 75, volume: 0.28, attack: 0.001, decay: 0.16 });
    }

    _playerDie() {
        this._noise({ volume: 0.6, attack: 0.001, decay: 0.55, lp: 700 });
        this._tone({ type: 'sine', freq: 205, freqEnd: 58, volume: 0.52, attack: 0.001, decay: 0.55 });
        setTimeout(() => {
            if (!this._ctx) return;
            this._tone({ type: 'sine', freq: 155, freqEnd: 38, volume: 0.42, attack: 0.001, decay: 0.65 });
        }, 110);
    }

    _grenadeThrow() {
        this._noise({ volume: 0.3, attack: 0.04, decay: 0.2, hp: 1100, lp: 4000 });
    }

    _explosion() {
        this._noise({ volume: 1.0, attack: 0.001, decay: 0.75, lp: 1400 });
        this._tone({ type: 'sine', freq: 62, freqEnd: 18, volume: 0.72, attack: 0.001, decay: 0.65 });
        this._noise({ volume: 0.55, attack: 0.001, decay: 0.28, hp: 750, lp: 4200 });
        // Small secondary debris
        setTimeout(() => {
            if (!this._ctx) return;
            this._noise({ volume: 0.22, attack: 0.001, decay: 0.12, hp: 2000, lp: 6000 });
        }, 180);
    }

    // ── UI / meta sounds ─────────────────────────────────────────────────────

    _pickupPowerUp() {
        [523, 659, 784, 1047].forEach((f, i) =>
            setTimeout(() => { if (this._ctx) this._tone({ freq: f, volume: 0.22, decay: 0.18 }); }, i * 55)
        );
    }

    _waveStart() {
        this._tone({ type: 'sawtooth', freq: 220, freqEnd: 440, volume: 0.28, attack: 0.04, decay: 0.45 });
        setTimeout(() => {
            if (!this._ctx) return;
            this._tone({ type: 'sawtooth', freq: 330, freqEnd: 660, volume: 0.22, attack: 0.04, decay: 0.42 });
        }, 160);
    }

    _bossWarning() {
        this._tone({ type: 'sawtooth', freq: 110, freqEnd: 55, volume: 0.35, attack: 0.05, decay: 0.8 });
        setTimeout(() => {
            if (!this._ctx) return;
            this._tone({ type: 'square', freq: 165, freqEnd: 82, volume: 0.28, attack: 0.05, decay: 0.7 });
        }, 250);
    }

    _shopOpen() {
        [523, 659, 784].forEach((f, i) =>
            setTimeout(() => { if (this._ctx) this._tone({ freq: f, volume: 0.16, attack: 0.01, decay: 0.38 }); }, i * 85)
        );
    }

    _upgradeBuy() {
        [659, 880, 1047].forEach((f, i) =>
            setTimeout(() => { if (this._ctx) this._tone({ freq: f, volume: 0.18, attack: 0.005, decay: 0.22 }); }, i * 60)
        );
    }

    _uiClick() {
        this._tone({ freq: 820, freqEnd: 620, volume: 0.1, attack: 0.001, decay: 0.055 });
    }

    _friendPing() {
        [880, 1100].forEach((f, i) =>
            setTimeout(() => { if (this._ctx) this._tone({ freq: f, volume: 0.14, attack: 0.005, decay: 0.2 }); }, i * 90)
        );
    }

    _pmReceive() {
        this._tone({ freq: 1047, freqEnd: 1319, volume: 0.13, attack: 0.005, decay: 0.18 });
    }

    _gameWin() {
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
            setTimeout(() => {
                if (!this._ctx) return;
                this._tone({ freq: f, volume: 0.2, attack: 0.01, decay: 0.3 });
                if (i > 1) this._tone({ type: 'triangle', freq: f * 1.5, volume: 0.08, attack: 0.01, decay: 0.28 });
            }, i * 95)
        );
    }

    // ── Background music ─────────────────────────────────────────────────────

    startMusic(type = 'game') {
        if (!this._initialized) this._init();
        if (!this._initialized || this._musicPlaying) return;
        this._resume();
        this._musicPlaying = true;
        if (type === 'game')  this._startGameMusic();
        else                  this._startLobbyMusic();
    }

    stopMusic(fadeMs = 1400) {
        if (!this._musicPlaying || !this._musicGain) return;
        this._musicPlaying = false;
        const now = this._ctx.currentTime;
        this._musicGain.gain.setValueAtTime(this._musicGain.gain.value, now);
        this._musicGain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
        setTimeout(() => {
            this._musicIntervals.forEach(clearInterval);
            this._musicIntervals = [];
            if (this._musicGain) this._musicGain.gain.value = this.musicVolume;
        }, fadeMs + 50);
    }

    _clearMusicIntervals() {
        this._musicIntervals.forEach(clearInterval);
        this._musicIntervals = [];
    }

    _startGameMusic() {
        this._clearMusicIntervals();
        const BPM  = 130;
        const beat = (60 / BPM) * 1000;

        // Kick on every beat
        const kick = setInterval(() => {
            if (!this._musicPlaying) return;
            this._noise({ volume: 0.18, attack: 0.001, decay: 0.13, lp: 280, dest: this._musicGain });
            this._tone({ type: 'sine', freq: 78, freqEnd: 28, volume: 0.24, attack: 0.001, decay: 0.12, dest: this._musicGain });
        }, beat);

        // Snare on 2 & 4
        let snareCount = 0;
        const snare = setInterval(() => {
            snareCount++;
            if (!this._musicPlaying || snareCount % 2 === 0) return;
            this._noise({ volume: 0.12, attack: 0.001, decay: 0.09, hp: 1800, lp: 7000, dest: this._musicGain });
        }, beat);

        // Hi-hat on 8ths
        const hat = setInterval(() => {
            if (!this._musicPlaying) return;
            this._noise({ volume: 0.05, attack: 0.001, decay: 0.028, hp: 9000, dest: this._musicGain });
        }, beat / 2);

        // Bassline (16 notes cycle)
        const bassSeq = [110, 110, 130, 110, 98, 110, 130, 146, 110, 98, 110, 130, 110, 98, 82, 98];
        let bi = 0;
        const bass = setInterval(() => {
            if (!this._musicPlaying) return;
            this._tone({
                type: 'sawtooth', freq: bassSeq[bi % bassSeq.length],
                volume: 0.1, attack: 0.01, decay: beat / 1000 * 0.72, dest: this._musicGain
            });
            bi++;
        }, beat);

        // Atmospheric pad (every 2 beats)
        const padSeq = [220, 246, 261, 220, 196, 220, 246, 261];
        let pi = 0;
        const pad = setInterval(() => {
            if (!this._musicPlaying) return;
            this._tone({
                type: 'sine', freq: padSeq[pi % padSeq.length],
                volume: 0.055, attack: 0.12, decay: beat / 1000 * 1.6, dest: this._musicGain
            });
            pi++;
        }, beat * 2);

        this._musicIntervals.push(kick, snare, hat, bass, pad);
    }

    _startLobbyMusic() {
        this._clearMusicIntervals();
        const BPM  = 75;
        const beat = (60 / BPM) * 1000;

        // Gentle pad chords
        const padNotes = [261, 329, 392, 329, 261, 246, 261, 293];
        let pi = 0;
        const pad = setInterval(() => {
            if (!this._musicPlaying) return;
            this._tone({
                type: 'sine', freq: padNotes[pi % padNotes.length],
                volume: 0.07, attack: 0.14, decay: beat / 1000 * 1.8, dest: this._musicGain
            });
            pi++;
        }, beat * 2);

        // Sparse kick
        const kick = setInterval(() => {
            if (!this._musicPlaying) return;
            this._noise({ volume: 0.07, attack: 0.001, decay: 0.1, lp: 250, dest: this._musicGain });
            this._tone({ type: 'sine', freq: 65, freqEnd: 25, volume: 0.1, attack: 0.001, decay: 0.1, dest: this._musicGain });
        }, beat * 2);

        this._musicIntervals.push(pad, kick);
    }

    // ── Volume controls ───────────────────────────────────────────────────────

    setMasterVolume(v) {
        this.masterVolume = Math.max(0, Math.min(1, v));
        if (this._masterGain) this._masterGain.gain.value = this.masterVolume;
        this._savePrefs();
    }

    setSfxVolume(v) {
        this.sfxVolume = Math.max(0, Math.min(1, v));
        if (this._sfxGain) this._sfxGain.gain.value = this.sfxVolume;
        this._savePrefs();
    }

    setMusicVolume(v) {
        this.musicVolume = Math.max(0, Math.min(1, v));
        if (this._musicGain) this._musicGain.gain.value = this.musicVolume;
        this._savePrefs();
    }

    _savePrefs() {
        try {
            localStorage.setItem('audioPrefs', JSON.stringify({
                master: this.masterVolume, sfx: this.sfxVolume, music: this.musicVolume
            }));
        } catch (_) {}
    }

    /** Map a weapon type string to its sound name. */
    static weaponSound(weaponType) {
        const map = {
            pistol: 'shoot_pistol', shotgun: 'shoot_shotgun',
            sniper: 'shoot_sniper', smg: 'shoot_smg',
            rifle: 'shoot_rifle',   assault_rifle: 'shoot_rifle',
            laser: 'shoot_laser',   plasma: 'shoot_plasma',
            minigun: 'shoot_smg',   revolver: 'shoot_pistol',
            burst_rifle: 'shoot_rifle', grenade_launcher: 'shoot_shotgun',
        };
        return map[weaponType] || 'shoot_pistol';
    }
}
