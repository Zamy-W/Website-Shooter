'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const PROJECT_ROOT = require('path').join(__dirname, '..');
const DATA_ROOT = require('path').join(PROJECT_ROOT, 'data');
const USERS_DB_PATH = require('path').join(DATA_ROOT, 'users.json');
const AUTH_SECRET_PATH = require('path').join(DATA_ROOT, 'auth-secret.txt');
const AUTH_COOKIE_NAME = 'website_shooter_auth';
const TOKEN_LIFETIME_MS = 1000 * 60 * 60 * 24 * 30;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

// ── Lazy imports to avoid circular deps ───────────────────────────────────────
let _getGameAssetCatalog, _sanitizeUnlockedSkins, _sanitizeUnlockedWeapons, _normalizeSkinTheme, _normalizeWeaponType;

function initAuthDeps(deps) {
    _getGameAssetCatalog = deps.getGameAssetCatalog;
    _sanitizeUnlockedSkins = deps.sanitizeUnlockedSkins;
    _sanitizeUnlockedWeapons = deps.sanitizeUnlockedWeapons;
    _normalizeSkinTheme = deps.normalizeSkinTheme;
    _normalizeWeaponType = deps.normalizeWeaponType;
}

// ── Storage ───────────────────────────────────────────────────────────────────

function ensureDataStorage() {
    const { ensureWeaponCatalogStorage } = require('./weapons');
    const { createDefaultGameAssetMetadataStore, GAME_ASSET_METADATA_PATH } = require('./assets');
    const { LEADERBOARD_DB_PATH, createDefaultLeaderboardStore } = require('./leaderboard');
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    ensureWeaponCatalogStorage();
    if (!fs.existsSync(USERS_DB_PATH)) fs.writeFileSync(USERS_DB_PATH, JSON.stringify({ users: [] }, null, 2));
    if (!fs.existsSync(AUTH_SECRET_PATH)) fs.writeFileSync(AUTH_SECRET_PATH, crypto.randomBytes(48).toString('hex'));
    if (!fs.existsSync(GAME_ASSET_METADATA_PATH)) fs.writeFileSync(GAME_ASSET_METADATA_PATH, JSON.stringify(createDefaultGameAssetMetadataStore(), null, 2));
    if (!fs.existsSync(LEADERBOARD_DB_PATH)) fs.writeFileSync(LEADERBOARD_DB_PATH, JSON.stringify(createDefaultLeaderboardStore(), null, 2));
}

function readAuthSecret() {
    if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    if (!fs.existsSync(AUTH_SECRET_PATH)) {
        const next = crypto.randomBytes(48).toString('hex');
        fs.writeFileSync(AUTH_SECRET_PATH, next);
        return next;
    }
    const value = fs.readFileSync(AUTH_SECRET_PATH, 'utf8').trim();
    if (value) return value;
    const next = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(AUTH_SECRET_PATH, next);
    return next;
}

const AUTH_SECRET = readAuthSecret();

// ── User store ────────────────────────────────────────────────────────────────

function createDefaultProgression() {
    const { defaultSkinId, defaultWeaponId } = _getGameAssetCatalog();
    const unlockedSkins = _sanitizeUnlockedSkins([]);
    const unlockedWeapons = _sanitizeUnlockedWeapons([]);
    return {
        metaCurrency: 0,
        unlockedSkins,
        selectedSkin: unlockedSkins.includes(defaultSkinId) ? defaultSkinId : unlockedSkins[0],
        unlockedWeapons,
        selectedWeapon: unlockedWeapons.includes(defaultWeaponId) ? defaultWeaponId : unlockedWeapons[0],
        stats: { matchesPlayed: 0, bestWave: 0, totalScore: 0, totalMetaCurrencyEarned: 0 }
    };
}

function normalizeUserRecord(user) {
    const defaultProgression = createDefaultProgression();
    const unlockedSkins = _sanitizeUnlockedSkins(user?.progression?.unlockedSkins);
    const unlockedWeapons = _sanitizeUnlockedWeapons(user?.progression?.unlockedWeapons);
    const { defaultSkinId, defaultWeaponId } = _getGameAssetCatalog();
    const selectedSkin = unlockedSkins.includes(user?.progression?.selectedSkin) ? user.progression.selectedSkin : defaultSkinId;
    const selectedWeapon = unlockedWeapons.includes(user?.progression?.selectedWeapon) ? user.progression.selectedWeapon : defaultWeaponId;

    return {
        id: user?.id || uuidv4(),
        username: typeof user?.username === 'string' ? user.username : 'Player',
        usernameLower: typeof user?.usernameLower === 'string' ? user.usernameLower : String(user?.username || 'player').toLowerCase(),
        isAdmin: Boolean(user?.isAdmin),
        passwordSalt: typeof user?.passwordSalt === 'string' ? user.passwordSalt : '',
        passwordHash: typeof user?.passwordHash === 'string' ? user.passwordHash : '',
        sessionNonce: typeof user?.sessionNonce === 'string' && user.sessionNonce ? user.sessionNonce : crypto.randomBytes(16).toString('hex'),
        createdAt: typeof user?.createdAt === 'string' ? user.createdAt : new Date().toISOString(),
        lastLoginAt: typeof user?.lastLoginAt === 'string' ? user.lastLoginAt : null,
        progression: {
            metaCurrency: Number.isFinite(user?.progression?.metaCurrency) ? Math.max(0, user.progression.metaCurrency) : defaultProgression.metaCurrency,
            unlockedSkins, selectedSkin, unlockedWeapons, selectedWeapon,
            stats: {
                matchesPlayed: Number.isFinite(user?.progression?.stats?.matchesPlayed) ? Math.max(0, user.progression.stats.matchesPlayed) : 0,
                bestWave: Number.isFinite(user?.progression?.stats?.bestWave) ? Math.max(0, user.progression.stats.bestWave) : 0,
                totalScore: Number.isFinite(user?.progression?.stats?.totalScore) ? Math.max(0, user.progression.stats.totalScore) : 0,
                totalMetaCurrencyEarned: Number.isFinite(user?.progression?.stats?.totalMetaCurrencyEarned) ? Math.max(0, user.progression.stats.totalMetaCurrencyEarned) : 0
            }
        },
        friends: Array.isArray(user?.friends)
            ? user.friends.filter(f => f?.userId && typeof f.username === 'string').map(f => ({ userId: f.userId, username: f.username }))
            : [],
        friendRequests: Array.isArray(user?.friendRequests)
            ? user.friendRequests.filter(r => r?.requestId && r?.fromUserId && typeof r.fromUsername === 'string').map(r => ({ requestId: r.requestId, fromUserId: r.fromUserId, fromUsername: r.fromUsername, sentAt: r.sentAt || new Date().toISOString() }))
            : [],
        pendingPms: Array.isArray(user?.pendingPms)
            ? user.pendingPms.filter(m => m?.fromUserId && typeof m.text === 'string' && m.ts).slice(-100)
            : [],
    };
}

let userStore = { users: [] };

function loadUserStore() {
    try {
        fs.mkdirSync(DATA_ROOT, { recursive: true });
        if (!fs.existsSync(USERS_DB_PATH)) return { users: [] };
        const raw = fs.readFileSync(USERS_DB_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return { users: Array.isArray(parsed?.users) ? parsed.users.map(normalizeUserRecord) : [] };
    } catch (error) {
        console.warn('Unable to load user store, starting fresh:', error.message);
        return { users: [] };
    }
}

function saveUserStore() {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify({ users: userStore.users.map(normalizeUserRecord) }, null, 2));
}

function initUserStore() {
    const loaded = loadUserStore();
    userStore.users = loaded.users;
}

function getUserById(userId) {
    return userStore.users.find((u) => u.id === userId) || null;
}

function getUserByUsername(username) {
    const lower = String(username || '').trim().toLowerCase();
    return lower ? (userStore.users.find((u) => u.usernameLower === lower) || null) : null;
}

// ── Passwords & tokens ────────────────────────────────────────────────────────

function createPasswordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
    return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

function verifyPassword(password, user) {
    if (!user?.passwordSalt || !user?.passwordHash) return false;
    const expected = Buffer.from(user.passwordHash, 'hex');
    const actual = Buffer.from(crypto.scryptSync(password, user.passwordSalt, 64).toString('hex'), 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function encodeTokenSegment(value) { return Buffer.from(value).toString('base64url'); }
function decodeTokenSegment(value) { return Buffer.from(value, 'base64url').toString('utf8'); }
function signTokenPayload(encoded) { return crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url'); }

function createAuthToken(user) {
    const payload = { sub: user.id, nonce: user.sessionNonce, exp: Date.now() + TOKEN_LIFETIME_MS };
    const encoded = encodeTokenSegment(JSON.stringify(payload));
    return `${encoded}.${signTokenPayload(encoded)}`;
}

function verifyAuthToken(token) {
    if (typeof token !== 'string' || !token.includes('.')) return null;
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;
    const expectedBuf = Buffer.from(signTokenPayload(encoded));
    const actualBuf = Buffer.from(signature);
    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) return null;
    try {
        const payload = JSON.parse(decodeTokenSegment(encoded));
        if (!payload?.sub || !payload?.nonce || !payload?.exp || payload.exp < Date.now()) return null;
        const user = getUserById(payload.sub);
        return user && user.sessionNonce === payload.nonce ? user : null;
    } catch { return null; }
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

function parseCookieHeader(cookieHeader = '') {
    return String(cookieHeader || '').split(';').map((e) => e.trim()).filter(Boolean).reduce((acc, entry) => {
        const sep = entry.indexOf('=');
        if (sep !== -1) { const k = entry.slice(0, sep).trim(); if (k) acc[k] = entry.slice(sep + 1).trim(); }
        return acc;
    }, {});
}

function createAuthCookieHeader(token, maxAgeSeconds = Math.floor(TOKEN_LIFETIME_MS / 1000)) {
    return [`${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`].join('; ');
}

function createClearedAuthCookieHeader() {
    return [`${AUTH_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'].join('; ');
}

function setAuthCookie(res, token) { res.append('Set-Cookie', createAuthCookieHeader(token)); }
function clearAuthCookie(res) { res.append('Set-Cookie', createClearedAuthCookieHeader()); }

function getTokenFromRequest(req) {
    const auth = req.get('authorization') || '';
    if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
    const cookies = parseCookieHeader(req.get('cookie') || '');
    return cookies[AUTH_COOKIE_NAME] ? decodeURIComponent(cookies[AUTH_COOKIE_NAME]) : '';
}

function getAuthenticatedUserFromRequest(req) { return verifyAuthToken(getTokenFromRequest(req)); }

function requireUserAuth(req, res, next) {
    const user = getAuthenticatedUserFromRequest(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Authentication required' });
    req.user = user;
    next();
}

function requireAdminAuth(req, res, next) {
    const user = getAuthenticatedUserFromRequest(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Admin account sign-in required.' });
    if (!isUserAdmin(user)) return res.status(403).json({ ok: false, error: 'This account does not have admin access.' });
    req.user = user;
    next();
}

function isUserAdmin(user) { return Boolean(user?.isAdmin); }

// ── Profile & account management ─────────────────────────────────────────────

function getPublicProfile(user) {
    const unlockedSkins = _sanitizeUnlockedSkins(user?.progression?.unlockedSkins);
    const unlockedWeapons = _sanitizeUnlockedWeapons(user?.progression?.unlockedWeapons);
    const { skins, weapons, defaultSkinId, defaultWeaponId } = _getGameAssetCatalog();
    return {
        id: user.id, username: user.username, isAdmin: isUserAdmin(user),
        metaCurrency: user.progression.metaCurrency,
        unlockedSkins, selectedSkin: unlockedSkins.includes(user.progression.selectedSkin) ? user.progression.selectedSkin : defaultSkinId,
        unlockedWeapons, selectedWeapon: unlockedWeapons.includes(user.progression.selectedWeapon) ? user.progression.selectedWeapon : defaultWeaponId,
        stats: { matchesPlayed: user.progression.stats.matchesPlayed, bestWave: user.progression.stats.bestWave, totalScore: user.progression.stats.totalScore, totalMetaCurrencyEarned: user.progression.stats.totalMetaCurrencyEarned },
        availableSkins: skins,
        availableWeapons: weapons.filter((w) => w.playable),
        friends: Array.isArray(user.friends) ? user.friends : []
    };
}

function countEffectiveAdminUsers(overrides = new Map(), deletedUserId = null) {
    return userStore.users.reduce((count, user) => {
        if (deletedUserId && user.id === deletedUserId) return count;
        const override = overrides.get(user.id);
        return count + ((override?.isAdmin ?? Boolean(user.isAdmin)) ? 1 : 0);
    }, 0);
}

function validateCredentials(username, password) {
    const u = String(username || '').trim(), p = String(password || '');
    if (!USERNAME_PATTERN.test(u)) return { ok: false, reason: 'Username must be 3-20 characters and use letters, numbers, or underscores.' };
    if (p.length < 6 || p.length > 64) return { ok: false, reason: 'Password must be 6-64 characters long.' };
    return { ok: true, username: u, password: p };
}

function createUserAccount(username, password) {
    const v = validateCredentials(username, password);
    if (!v.ok) return v;
    if (getUserByUsername(v.username)) return { ok: false, reason: 'That username is already taken.' };
    const pwd = createPasswordHash(v.password);
    const user = normalizeUserRecord({ id: uuidv4(), username: v.username, usernameLower: v.username.toLowerCase(), isAdmin: userStore.users.length === 0, passwordSalt: pwd.salt, passwordHash: pwd.hash, sessionNonce: crypto.randomBytes(16).toString('hex'), createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(), progression: createDefaultProgression() });
    userStore.users.push(user);
    saveUserStore();
    return { ok: true, user };
}

function loginUserAccount(username, password) {
    const v = validateCredentials(username, password);
    if (!v.ok) return v;
    const user = getUserByUsername(v.username);
    if (!user || !verifyPassword(v.password, user)) return { ok: false, reason: 'Invalid username or password.' };
    user.lastLoginAt = new Date().toISOString();
    saveUserStore();
    return { ok: true, user };
}

function updateUserSelectedSkin(user, skinTheme) {
    const normalized = _normalizeSkinTheme(skinTheme);
    const unlocked = _sanitizeUnlockedSkins(user.progression.unlockedSkins);
    if (!unlocked.includes(normalized)) return { ok: false, reason: 'Skin is not unlocked on this account.' };
    user.progression.selectedSkin = normalized;
    user.progression.unlockedSkins = unlocked;
    saveUserStore();
    return { ok: true, profile: getPublicProfile(user) };
}

function updateUserSelectedWeapon(user, weaponType) {
    const normalized = _normalizeWeaponType(weaponType);
    const unlocked = _sanitizeUnlockedWeapons(user.progression.unlockedWeapons);
    if (!unlocked.includes(normalized)) return { ok: false, reason: 'Weapon is not unlocked on this account.' };
    user.progression.selectedWeapon = normalized;
    user.progression.unlockedWeapons = unlocked;
    saveUserStore();
    return { ok: true, profile: getPublicProfile(user) };
}

function unlockSkinForUser(user, skinTheme) {
    const normalized = _normalizeSkinTheme(skinTheme);
    const { skinCatalog } = _getGameAssetCatalog();
    const skin = skinCatalog[normalized];
    if (!skin) return { ok: false, reason: 'Unknown skin.' };
    const unlocked = _sanitizeUnlockedSkins(user.progression.unlockedSkins);
    if (unlocked.includes(normalized)) return { ok: false, reason: 'Skin is already unlocked.' };
    if (user.progression.metaCurrency < skin.cost) return { ok: false, reason: `Need ${skin.cost} credits to unlock ${skin.label}.` };
    user.progression.metaCurrency -= skin.cost;
    unlocked.push(normalized);
    user.progression.unlockedSkins = _sanitizeUnlockedSkins(unlocked);
    user.progression.selectedSkin = normalized;
    saveUserStore();
    return { ok: true, profile: getPublicProfile(user), unlockedSkin: normalized };
}

function unlockWeaponForUser(user, weaponType) {
    const normalized = _normalizeWeaponType(weaponType);
    const { weapons } = _getGameAssetCatalog();
    const weapon = weapons.find((w) => w.id === normalized && w.playable);
    if (!weapon) return { ok: false, reason: 'Unknown weapon.' };
    const unlocked = _sanitizeUnlockedWeapons(user.progression.unlockedWeapons);
    if (unlocked.includes(normalized)) return { ok: false, reason: 'Weapon is already unlocked.' };
    if (user.progression.metaCurrency < weapon.cost) return { ok: false, reason: `Need ${weapon.cost} credits to unlock ${weapon.label}.` };
    user.progression.metaCurrency -= weapon.cost;
    unlocked.push(normalized);
    user.progression.unlockedWeapons = _sanitizeUnlockedWeapons(unlocked);
    user.progression.selectedWeapon = normalized;
    saveUserStore();
    return { ok: true, profile: getPublicProfile(user), unlockedWeapon: normalized };
}

function calculateMetaCurrencyReward(score, wave) {
    return Math.max(0, Math.floor(Math.max(0, Number(score) || 0) / 20) + Math.max(0, Math.max(1, Number(wave) || 1) - 1) * 25);
}

function awardProgressionToUser(user, score, wave, selectedSkin = null) {
    const reward = calculateMetaCurrencyReward(score, wave);
    const { defaultSkinId } = _getGameAssetCatalog();
    const requestedSkin = _normalizeSkinTheme(selectedSkin || defaultSkinId);
    user.progression.metaCurrency += reward;
    user.progression.unlockedSkins = _sanitizeUnlockedSkins(user.progression.unlockedSkins);
    if (user.progression.unlockedSkins.includes(requestedSkin)) user.progression.selectedSkin = requestedSkin;
    user.progression.stats.matchesPlayed += 1;
    user.progression.stats.bestWave = Math.max(user.progression.stats.bestWave, Math.max(1, Number(wave) || 1));
    user.progression.stats.totalScore += Math.max(0, Number(score) || 0);
    user.progression.stats.totalMetaCurrencyEarned += reward;
    user.lastLoginAt = new Date().toISOString();
    saveUserStore();
    return { reward, profile: getPublicProfile(user) };
}

// ── Admin user management ─────────────────────────────────────────────────────

function getAdminUserSnapshot(user, getActiveSocketCountForUser) {
    const profile = getPublicProfile(user);
    return {
        id: user.id, username: user.username, isAdmin: isUserAdmin(user),
        createdAt: user.createdAt, lastLoginAt: user.lastLoginAt,
        activeSocketCount: getActiveSocketCountForUser ? getActiveSocketCountForUser(user.id) : 0,
        passwordSet: Boolean(user.passwordHash && user.passwordSalt),
        progression: { metaCurrency: profile.metaCurrency, unlockedSkins: profile.unlockedSkins, selectedSkin: profile.selectedSkin, unlockedWeapons: profile.unlockedWeapons, selectedWeapon: profile.selectedWeapon, stats: profile.stats }
    };
}

function parseAdminUnlockedSkinsInput(value) {
    return _sanitizeUnlockedSkins(Array.isArray(value) ? value : String(value || '').split(/[\s,]+/).map((e) => e.trim()).filter(Boolean));
}

function parseAdminUnlockedWeaponsInput(value) {
    return _sanitizeUnlockedWeapons(Array.isArray(value) ? value : String(value || '').split(/[\s,]+/).map((e) => e.trim()).filter(Boolean));
}

function updateUserAccountFromAdmin(user, updates = {}, syncSocketsForAdminUserUpdate) {
    const requestedUsername = typeof updates.username === 'string' ? updates.username.trim() : user.username;
    if (!USERNAME_PATTERN.test(requestedUsername)) return { ok: false, reason: 'Username must be 3-20 characters and use letters, numbers, or underscores.' };
    if (userStore.users.find((u) => u.id !== user.id && u.usernameLower === requestedUsername.toLowerCase())) return { ok: false, reason: 'That username is already taken.' };

    const requestedSkin = updates.selectedSkin !== undefined ? _normalizeSkinTheme(updates.selectedSkin) : _normalizeSkinTheme(user.progression.selectedSkin);
    const requestedWeapon = updates.selectedWeapon !== undefined ? _normalizeWeaponType(updates.selectedWeapon) : _normalizeWeaponType(user.progression.selectedWeapon);
    const requestedAdminFlag = updates.isAdmin !== undefined ? Boolean(updates.isAdmin) : Boolean(user.isAdmin);
    let unlockedSkins = updates.unlockedSkins !== undefined ? parseAdminUnlockedSkinsInput(updates.unlockedSkins) : _sanitizeUnlockedSkins(user.progression.unlockedSkins);
    let unlockedWeapons = updates.unlockedWeapons !== undefined ? parseAdminUnlockedWeaponsInput(updates.unlockedWeapons) : _sanitizeUnlockedWeapons(user.progression.unlockedWeapons);

    if (!unlockedSkins.includes(requestedSkin)) { unlockedSkins.push(requestedSkin); unlockedSkins = _sanitizeUnlockedSkins(unlockedSkins); }
    if (!unlockedWeapons.includes(requestedWeapon)) { unlockedWeapons.push(requestedWeapon); unlockedWeapons = _sanitizeUnlockedWeapons(unlockedWeapons); }

    if (!requestedAdminFlag && isUserAdmin(user) && countEffectiveAdminUsers(new Map([[user.id, { isAdmin: false }]])) === 0) return { ok: false, reason: 'At least one admin account must remain.' };

    user.username = requestedUsername;
    user.usernameLower = requestedUsername.toLowerCase();
    user.isAdmin = requestedAdminFlag;
    user.progression.metaCurrency = Math.max(0, Math.round(Number(updates.metaCurrency ?? user.progression.metaCurrency) || 0));
    user.progression.unlockedSkins = unlockedSkins;
    user.progression.selectedSkin = unlockedSkins.includes(requestedSkin) ? requestedSkin : _normalizeSkinTheme(unlockedSkins[0]);
    user.progression.unlockedWeapons = unlockedWeapons;
    user.progression.selectedWeapon = unlockedWeapons.includes(requestedWeapon) ? requestedWeapon : _normalizeWeaponType(unlockedWeapons[0]);
    user.progression.stats.matchesPlayed = Math.max(0, Math.round(Number(updates?.stats?.matchesPlayed ?? user.progression.stats.matchesPlayed) || 0));
    user.progression.stats.bestWave = Math.max(0, Math.round(Number(updates?.stats?.bestWave ?? user.progression.stats.bestWave) || 0));
    user.progression.stats.totalScore = Math.max(0, Math.round(Number(updates?.stats?.totalScore ?? user.progression.stats.totalScore) || 0));
    user.progression.stats.totalMetaCurrencyEarned = Math.max(0, Math.round(Number(updates?.stats?.totalMetaCurrencyEarned ?? user.progression.stats.totalMetaCurrencyEarned) || 0));

    let passwordChanged = false;
    if (typeof updates.password === 'string' && updates.password.trim()) {
        const next = updates.password.trim();
        if (next.length < 6 || next.length > 64) return { ok: false, reason: 'Password must be 6-64 characters long.' };
        const pwd = createPasswordHash(next);
        user.passwordSalt = pwd.salt;
        user.passwordHash = pwd.hash;
        user.sessionNonce = crypto.randomBytes(16).toString('hex');
        passwordChanged = true;
    }

    saveUserStore();
    if (syncSocketsForAdminUserUpdate) syncSocketsForAdminUserUpdate(user, passwordChanged);
    return { ok: true, passwordChanged };
}

function deleteUserAccountFromAdmin(userId, disconnectSocketsByUserId) {
    const index = userStore.users.findIndex((u) => u.id === userId);
    if (index === -1) return { ok: false, reason: 'User account not found.' };
    if (isUserAdmin(userStore.users[index]) && countEffectiveAdminUsers(new Map(), userId) === 0) return { ok: false, reason: 'At least one admin account must remain.' };
    const [removed] = userStore.users.splice(index, 1);
    saveUserStore();
    if (disconnectSocketsByUserId) disconnectSocketsByUserId(removed.id, 'account_deleted');
    return { ok: true };
}

// ── Friend management ─────────────────────────────────────────────────────────

function addFriendToUser(user, targetUserId, targetUsername) {
    if (!user || !targetUserId || user.id === targetUserId) return false;
    if (!Array.isArray(user.friends)) user.friends = [];
    if (user.friends.some(f => f.userId === targetUserId)) return false; // already friends
    user.friends.push({ userId: targetUserId, username: targetUsername });
    saveUserStore();
    return true;
}

function removeFriendFromUser(user, targetUserId) {
    if (!user || !Array.isArray(user.friends)) return false;
    const before = user.friends.length;
    user.friends = user.friends.filter(f => f.userId !== targetUserId);
    if (user.friends.length !== before) { saveUserStore(); return true; }
    return false;
}

// ── Friend requests ───────────────────────────────────────────────────────────

function sendFriendRequestToUser(targetUser, fromUserId, fromUsername) {
    if (!targetUser || !fromUserId) return { ok: false, reason: 'invalid' };
    if (targetUser.id === fromUserId) return { ok: false, reason: 'self' };
    if (!Array.isArray(targetUser.friends)) targetUser.friends = [];
    if (!Array.isArray(targetUser.friendRequests)) targetUser.friendRequests = [];
    if (targetUser.friends.some(f => f.userId === fromUserId)) return { ok: false, reason: 'already_friends' };
    if (targetUser.friendRequests.some(r => r.fromUserId === fromUserId)) return { ok: false, reason: 'already_sent' };
    const { v4: uuidv4 } = require('uuid');
    const requestId = uuidv4();
    targetUser.friendRequests.push({ requestId, fromUserId, fromUsername, sentAt: new Date().toISOString() });
    saveUserStore();
    return { ok: true, requestId };
}

function acceptFriendRequest(user, requestId) {
    if (!Array.isArray(user.friendRequests)) return null;
    const req = user.friendRequests.find(r => r.requestId === requestId);
    if (!req) return null;
    user.friendRequests = user.friendRequests.filter(r => r.requestId !== requestId);
    addFriendToUser(user, req.fromUserId, req.fromUsername); // adds to user's friends list
    // saveUserStore already called in addFriendToUser
    return req;
}

function declineFriendRequest(user, requestId) {
    if (!Array.isArray(user.friendRequests)) return false;
    const before = user.friendRequests.length;
    user.friendRequests = user.friendRequests.filter(r => r.requestId !== requestId);
    if (user.friendRequests.length !== before) { saveUserStore(); return true; }
    return false;
}

// ── Offline PM queue ─────────────────────────────────────────────────────────

// Store a PM for a user who is currently offline (capped at 100 per user)
function storePendingPm(targetUser, pm) {
    if (!Array.isArray(targetUser.pendingPms)) targetUser.pendingPms = [];
    if (targetUser.pendingPms.length >= 100) targetUser.pendingPms.shift(); // drop oldest if full
    targetUser.pendingPms.push(pm);
    saveUserStore();
}

// Retrieve and clear all queued PMs for a user (called on connect)
function drainPendingPms(user) {
    if (!Array.isArray(user.pendingPms) || user.pendingPms.length === 0) return [];
    const messages = [...user.pendingPms];
    user.pendingPms = [];
    saveUserStore();
    return messages;
}

// ── Socket auth helpers ───────────────────────────────────────────────────────

function getSocketAuthToken(socket) {
    const direct = socket.handshake?.auth?.token;
    if (typeof direct === 'string' && direct) return direct;
    const cookies = parseCookieHeader(socket.handshake?.headers?.cookie || '');
    return cookies[AUTH_COOKIE_NAME] ? decodeURIComponent(cookies[AUTH_COOKIE_NAME]) : '';
}

function getAuthenticatedUserFromSocket(socket) {
    return verifyAuthToken(getSocketAuthToken(socket));
}

module.exports = {
    AUTH_COOKIE_NAME,
    TOKEN_LIFETIME_MS,
    USERNAME_PATTERN,
    userStore,
    initAuthDeps,
    initUserStore,
    ensureDataStorage,
    readAuthSecret,
    normalizeUserRecord,
    saveUserStore,
    getUserById,
    getUserByUsername,
    createPasswordHash,
    verifyPassword,
    createAuthToken,
    verifyAuthToken,
    parseCookieHeader,
    setAuthCookie,
    clearAuthCookie,
    getTokenFromRequest,
    getAuthenticatedUserFromRequest,
    requireUserAuth,
    requireAdminAuth,
    isUserAdmin,
    countEffectiveAdminUsers,
    createDefaultProgression,
    getPublicProfile,
    validateCredentials,
    createUserAccount,
    loginUserAccount,
    updateUserSelectedSkin,
    updateUserSelectedWeapon,
    unlockSkinForUser,
    unlockWeaponForUser,
    calculateMetaCurrencyReward,
    awardProgressionToUser,
    getAdminUserSnapshot,
    updateUserAccountFromAdmin,
    deleteUserAccountFromAdmin,
    getSocketAuthToken,
    getAuthenticatedUserFromSocket,
    addFriendToUser,
    removeFriendFromUser,
    sendFriendRequestToUser,
    acceptFriendRequest,
    declineFriendRequest,
    storePendingPm,
    drainPendingPms
};
