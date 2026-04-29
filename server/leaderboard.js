'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_ROOT = path.join(__dirname, '..', 'data');
const LEADERBOARD_DB_PATH = path.join(DATA_ROOT, 'leaderboard.json');

function normalizeLeaderboardDate(value) {
    const v = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date().toISOString().split('T')[0];
}

function normalizeLeaderboardNameKey(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function compareLeaderboardEntries(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    if (b.wave !== a.wave) return b.wave - a.wave;
    const dc = a.date.localeCompare(b.date);
    if (dc !== 0) return dc;
    const nc = a.name.localeCompare(b.name);
    if (nc !== 0) return nc;
    return a.id.localeCompare(b.id);
}

function isLeaderboardImprovement(candidate, existing) {
    if (!existing) return true;
    if (candidate.score !== existing.score) return candidate.score > existing.score;
    if (candidate.wave !== existing.wave) return candidate.wave > existing.wave;
    return false;
}

function getLeaderboardOwnerSnapshot(entry = {}) {
    const accountUserId = typeof entry.accountUserId === 'string' && entry.accountUserId.trim() ? entry.accountUserId.trim() : '';
    const ownerType = entry.ownerType === 'account' || entry.ownerType === 'guest' ? entry.ownerType : '';
    const ownerKey = typeof entry.ownerKey === 'string' ? entry.ownerKey.trim() : '';
    if (accountUserId) return { ownerType: 'account', ownerKey: ownerKey || `account:${accountUserId}`, accountUserId };
    if (ownerType && ownerKey) return { ownerType, ownerKey, accountUserId: null };
    const guestKey = normalizeLeaderboardNameKey(entry.name);
    return { ownerType: 'guest', ownerKey: guestKey ? `guest:${guestKey}` : '', accountUserId: null };
}

function normalizeLeaderboardEntry(entry = {}) {
    const owner = getLeaderboardOwnerSnapshot(entry);
    return {
        id: typeof entry.id === 'string' && entry.id ? entry.id : uuidv4(),
        name: String(entry.name || 'Player').trim().slice(0, 32) || 'Player',
        score: Math.max(0, Math.round(Number(entry.score) || 0)),
        wave: Math.max(0, Math.round(Number(entry.wave) || 0)),
        date: normalizeLeaderboardDate(entry.date),
        ownerType: owner.ownerType,
        ownerKey: owner.ownerKey,
        accountUserId: owner.accountUserId
    };
}

function createDefaultLeaderboardStore() {
    return {
        maxEntries: 10,
        topScores: [
            normalizeLeaderboardEntry({ name: 'TestPlayer1', score: 1500, wave: 8, date: '2025-10-16' }),
            normalizeLeaderboardEntry({ name: 'TestPlayer2', score: 1200, wave: 6, date: '2025-10-16' }),
            normalizeLeaderboardEntry({ name: 'TestPlayer3', score: 800,  wave: 4, date: '2025-10-16' })
        ]
    };
}

function normalizeLeaderboardStore(store = {}) {
    const defaults = createDefaultLeaderboardStore();
    const maxEntries = Math.max(1, Math.round(Number(store?.maxEntries) || defaults.maxEntries));
    const bestByOwner = new Map();
    (Array.isArray(store?.topScores) ? store.topScores : defaults.topScores).map(normalizeLeaderboardEntry).forEach((entry) => {
        const key = entry.ownerKey || `entry:${entry.id}`;
        const existing = bestByOwner.get(key);
        if (!existing || isLeaderboardImprovement(entry, existing)) bestByOwner.set(key, entry);
    });
    return { maxEntries, topScores: Array.from(bestByOwner.values()).sort(compareLeaderboardEntries) };
}

function loadLeaderboardStore() {
    try {
        if (!fs.existsSync(LEADERBOARD_DB_PATH)) return createDefaultLeaderboardStore();
        return normalizeLeaderboardStore(JSON.parse(fs.readFileSync(LEADERBOARD_DB_PATH, 'utf8')));
    } catch { return createDefaultLeaderboardStore(); }
}

let globalLeaderboard = loadLeaderboardStore();

function saveLeaderboardStore() {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    globalLeaderboard = normalizeLeaderboardStore(globalLeaderboard);
    fs.writeFileSync(LEADERBOARD_DB_PATH, JSON.stringify(globalLeaderboard, null, 2));
}

function getSortedLeaderboardEntries() {
    return [...globalLeaderboard.topScores].sort(compareLeaderboardEntries);
}

function getLeaderboard() {
    return getSortedLeaderboardEntries().slice(0, globalLeaderboard.maxEntries).map((e) => ({ ...e }));
}

function getAdminLeaderboardEntries() { return getSortedLeaderboardEntries().map((e) => ({ ...e })); }

function getLeaderboardRankByEntryId(entryId) {
    return getSortedLeaderboardEntries().findIndex((e) => e.id === entryId) + 1;
}

function getLeaderboardEntryById(entryId) {
    return globalLeaderboard.topScores.find((e) => e.id === entryId) || null;
}

function addToLeaderboard(playerName, score, wave, options = {}) {
    const entry = normalizeLeaderboardEntry({ name: playerName, score, wave, date: new Date().toISOString().split('T')[0], accountUserId: options.accountUserId, ownerType: options.ownerType, ownerKey: options.ownerKey });
    const existingIndex = globalLeaderboard.topScores.findIndex((lb) => (lb.ownerKey || `entry:${lb.id}`) === (entry.ownerKey || `entry:${entry.id}`));
    if (existingIndex === -1) { globalLeaderboard.topScores.push(entry); saveLeaderboardStore(); return getLeaderboardRankByEntryId(entry.id); }
    const existing = globalLeaderboard.topScores[existingIndex];
    if (!isLeaderboardImprovement(entry, existing)) { saveLeaderboardStore(); return getLeaderboardRankByEntryId(existing.id); }
    globalLeaderboard.topScores.splice(existingIndex, 1, { ...existing, ...entry, id: existing.id, ownerType: existing.ownerType || entry.ownerType, ownerKey: existing.ownerKey || entry.ownerKey, accountUserId: existing.accountUserId || entry.accountUserId });
    saveLeaderboardStore();
    return getLeaderboardRankByEntryId(existing.id);
}

function addLeaderboardEntryFromAdmin(payload = {}) {
    const entry = normalizeLeaderboardEntry(payload);
    const existing = globalLeaderboard.topScores.find((c) => (c.ownerKey || `entry:${c.id}`) === (entry.ownerKey || `entry:${entry.id}`));
    if (!existing) { globalLeaderboard.topScores.push(entry); saveLeaderboardStore(); return getLeaderboardEntryById(entry.id); }
    if (!isLeaderboardImprovement(entry, existing)) { saveLeaderboardStore(); return getLeaderboardEntryById(existing.id); }
    Object.assign(existing, { ...entry, id: existing.id, ownerType: existing.ownerType || entry.ownerType, ownerKey: existing.ownerKey || entry.ownerKey, accountUserId: existing.accountUserId || entry.accountUserId });
    saveLeaderboardStore();
    return getLeaderboardEntryById(existing.id);
}

function updateLeaderboardEntryFromAdmin(entryId, payload = {}) {
    const entry = getLeaderboardEntryById(entryId);
    if (!entry) return { ok: false, reason: 'Leaderboard entry not found.' };
    Object.assign(entry, normalizeLeaderboardEntry({ ...entry, ...payload, id: entry.id }));
    saveLeaderboardStore();
    return { ok: true, entry: getLeaderboardEntryById(entryId) };
}

function deleteLeaderboardEntryFromAdmin(entryId) {
    const prev = globalLeaderboard.topScores.length;
    globalLeaderboard.topScores = globalLeaderboard.topScores.filter((e) => e.id !== entryId);
    if (globalLeaderboard.topScores.length === prev) return { ok: false, reason: 'Leaderboard entry not found.' };
    saveLeaderboardStore();
    return { ok: true };
}

function clearLeaderboardFromAdmin() {
    globalLeaderboard.topScores = [];
    saveLeaderboardStore();
}

function getLeaderboardSettings() {
    return { maxEntries: globalLeaderboard.maxEntries };
}

module.exports = {
    LEADERBOARD_DB_PATH,
    createDefaultLeaderboardStore,
    getLeaderboard,
    getLeaderboardSettings,
    getAdminLeaderboardEntries,
    getLeaderboardEntryById,
    addToLeaderboard,
    addLeaderboardEntryFromAdmin,
    updateLeaderboardEntryFromAdmin,
    deleteLeaderboardEntryFromAdmin,
    clearLeaderboardFromAdmin
};
