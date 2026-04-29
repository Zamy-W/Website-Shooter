'use strict';

const fs = require('fs');
const path = require('path');
const { humanizeAssetName, sanitizeAssetSlug, toAssetId, toForwardSlashPath, isPathInside } = require('./utils');
const { BUILT_IN_SKIN_CATALOG, BUILT_IN_ENEMY_SPRITES } = require('./upgrades');
const { weaponCatalogStore, DEFAULT_WEAPON_ID } = require('./weapons');
const { ROOM_MODES } = require('./config');

const PROJECT_ROOT = path.join(__dirname, '..');
const ASSETS_ROOT = path.join(PROJECT_ROOT, 'assets');
const DATA_ROOT = path.join(PROJECT_ROOT, 'data');
const GAME_ASSET_METADATA_PATH = path.join(DATA_ROOT, 'game-asset-metadata.json');
const MAX_ASSET_UPLOAD_BYTES = 5 * 1024 * 1024;

// ── Asset metadata store ──────────────────────────────────────────────────────

function createDefaultGameAssetMetadataStore() { return { items: {} }; }

function normalizeAssetMetadataEntry(entry = {}) {
    const normalized = {};
    if (typeof entry.label === 'string' && entry.label.trim()) normalized.label = entry.label.trim();
    if (typeof entry.description === 'string' && entry.description.trim()) normalized.description = entry.description.trim();
    if (entry.cost !== undefined && entry.cost !== null && entry.cost !== '') {
        const n = Number(entry.cost);
        if (Number.isFinite(n)) normalized.cost = Math.max(0, Math.round(n));
    }
    if (typeof entry.category === 'string' && entry.category.trim()) normalized.category = entry.category.trim();
    return normalized;
}

function normalizeGameAssetMetadataStore(store) {
    const normalizedItems = {};
    const sourceItems = store?.items && typeof store.items === 'object' ? store.items : {};
    Object.entries(sourceItems).forEach(([relativePath, entry]) => {
        const normalized = String(relativePath || '').replace(/\\/g, '/').trim();
        if (!normalized) return;
        const e = normalizeAssetMetadataEntry(entry);
        if (Object.keys(e).length > 0) normalizedItems[normalized] = e;
    });
    return { items: normalizedItems };
}

function loadGameAssetMetadataStore() {
    try {
        if (!fs.existsSync(GAME_ASSET_METADATA_PATH)) return createDefaultGameAssetMetadataStore();
        return normalizeGameAssetMetadataStore(JSON.parse(fs.readFileSync(GAME_ASSET_METADATA_PATH, 'utf8')));
    } catch { return createDefaultGameAssetMetadataStore(); }
}

let gameAssetMetadataStore = loadGameAssetMetadataStore();

function saveGameAssetMetadataStore() {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    fs.writeFileSync(GAME_ASSET_METADATA_PATH, JSON.stringify(normalizeGameAssetMetadataStore(gameAssetMetadataStore), null, 2));
}

function getGameAssetMetadataEntry(relativePath) {
    const p = String(relativePath || '').replace(/\\/g, '/').trim();
    return p ? (gameAssetMetadataStore.items[p] || {}) : {};
}

function setGameAssetMetadataEntry(relativePath, entry) {
    const p = String(relativePath || '').replace(/\\/g, '/').trim();
    if (!p) return;
    const e = normalizeAssetMetadataEntry(entry);
    if (Object.keys(e).length === 0) delete gameAssetMetadataStore.items[p];
    else gameAssetMetadataStore.items[p] = e;
    saveGameAssetMetadataStore();
    invalidateGameAssetCatalog();
}

function deleteGameAssetMetadataEntry(relativePath) {
    const p = String(relativePath || '').replace(/\\/g, '/').trim();
    if (!p || !gameAssetMetadataStore.items[p]) return;
    delete gameAssetMetadataStore.items[p];
    saveGameAssetMetadataStore();
    invalidateGameAssetCatalog();
}

function renameGameAssetMetadataEntry(fromPath, toPath) {
    const f = String(fromPath || '').replace(/\\/g, '/').trim();
    const t = String(toPath || '').replace(/\\/g, '/').trim();
    if (!f || !t || !gameAssetMetadataStore.items[f]) return;
    gameAssetMetadataStore.items[t] = gameAssetMetadataStore.items[f];
    delete gameAssetMetadataStore.items[f];
    saveGameAssetMetadataStore();
    invalidateGameAssetCatalog();
}

function renameGameAssetMetadataPrefix(fromPath, toPath) {
    const f = String(fromPath || '').replace(/\\/g, '/').trim();
    const t = String(toPath || '').replace(/\\/g, '/').trim();
    if (!f || !t) return;
    let changed = false;
    Object.entries({ ...gameAssetMetadataStore.items }).forEach(([p, meta]) => {
        if (p === f || p.startsWith(`${f}/`)) {
            gameAssetMetadataStore.items[`${t}${p.slice(f.length)}`] = meta;
            delete gameAssetMetadataStore.items[p];
            changed = true;
        }
    });
    if (changed) { saveGameAssetMetadataStore(); invalidateGameAssetCatalog(); }
}

// ── Catalog ───────────────────────────────────────────────────────────────────

const gameAssetCatalogCache = { expiresAt: 0, data: null };

function invalidateGameAssetCatalog() {
    gameAssetCatalogCache.expiresAt = 0;
    gameAssetCatalogCache.data = null;
}

function getAssetPublicUrl(relativePath) {
    const normalized = (relativePath || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return normalized ? `/assets/${normalized}` : '/assets';
}

function readSvgFilesFromDirectory(relativeDirectory) {
    const absoluteDirectory = path.join(ASSETS_ROOT, relativeDirectory);
    if (!fs.existsSync(absoluteDirectory)) return [];
    const results = [];
    const walk = (absPath, relPath) => {
        const entries = fs.readdirSync(absPath, { withFileTypes: true });
        for (const entry of entries) {
            const entryRel = relPath ? `${relPath}/${entry.name}` : entry.name;
            const entryAbs = path.join(absPath, entry.name);
            if (entry.isDirectory()) { walk(entryAbs, entryRel); continue; }
            if (/\.svg$/i.test(entry.name)) {
                results.push({
                    id: toAssetId(entryRel),
                    name: entry.name,
                    relativePath: `${relativeDirectory}/${entryRel}`.replace(/\\/g, '/'),
                    publicUrl: `/assets/${`${relativeDirectory}/${entryRel}`.replace(/\\/g, '/')}`.split('/').filter(Boolean).map(encodeURIComponent).join('/').replace(/^/, '/')
                });
            }
        }
    };
    walk(absoluteDirectory, '');
    results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return results;
}

function buildGameAssetCatalog() {
    const skinCatalog = { ...BUILT_IN_SKIN_CATALOG };
    const enemySprites = { ...BUILT_IN_ENEMY_SPRITES };

    readSvgFilesFromDirectory('sprites').forEach((asset) => {
        const meta = getGameAssetMetadataEntry(asset.relativePath);
        const builtIn = BUILT_IN_SKIN_CATALOG[asset.id];
        const entry = { id: asset.id, label: meta.label || builtIn?.label || humanizeAssetName(path.basename(asset.name, '.svg')), cost: meta.cost ?? builtIn?.cost ?? 0, description: meta.description || builtIn?.description || 'Custom sprite discovered from the assets library.', relativePath: asset.relativePath, publicUrl: asset.publicUrl, autoDiscovered: !builtIn, category: meta.category || 'playerSkin' };
        if (/enemy/i.test(asset.id)) {
            enemySprites[asset.id] = { id: asset.id, label: meta.label || humanizeAssetName(path.basename(asset.name, '.svg')), cost: meta.cost ?? 0, description: meta.description || 'Enemy sprite variant discovered from the assets library.', relativePath: asset.relativePath, publicUrl: asset.publicUrl, autoDiscovered: !BUILT_IN_ENEMY_SPRITES[asset.id], category: meta.category || 'enemySprite' };
            return;
        }
        skinCatalog[asset.id] = entry;
    });

    const builtInOrder = Object.keys(BUILT_IN_SKIN_CATALOG);
    const skins = Object.values(skinCatalog).sort((a, b) => {
        const ai = builtInOrder.indexOf(a.id), bi = builtInOrder.indexOf(b.id);
        const ab = ai === -1 ? 1 : 0, bb = bi === -1 ? 1 : 0;
        if (ab !== bb) return ab - bb;
        if (ab === 0 && bb === 0) return ai - bi;
        return a.label.localeCompare(b.label);
    });

    const discoveredWeapons = readSvgFilesFromDirectory('weapons');
    const discoveredById = new Map(discoveredWeapons.map((a) => [a.id, a]));
    const weaponEntriesById = new Map();

    weaponCatalogStore.weapons.forEach((weapon) => {
        const asset = discoveredById.get(weapon.id);
        const relativePath = weapon.artPath || asset?.relativePath || `weapons/${weapon.id}.svg`;
        const meta = getGameAssetMetadataEntry(relativePath);
        weaponEntriesById.set(weapon.id, { id: weapon.id, label: meta.label || weapon.label, cost: meta.cost ?? weapon.cost, description: meta.description || weapon.description, relativePath, publicUrl: asset?.publicUrl || getAssetPublicUrl(relativePath), playable: weapon.playable !== false, category: meta.category || 'weaponArt', sortOrder: weapon.sortOrder, behaviorId: weapon.behaviorId, slot: weapon.slot, artPath: relativePath, stats: { ...weapon.stats }, fx: { ...weapon.fx }, presentation: { ...weapon.presentation }, ...weapon.stats, ...weapon.fx, ...weapon.presentation });
    });

    discoveredWeapons.forEach((asset, index) => {
        if (weaponEntriesById.has(asset.id)) return;
        const meta = getGameAssetMetadataEntry(asset.relativePath);
        weaponEntriesById.set(asset.id, { id: asset.id, label: meta.label || humanizeAssetName(path.basename(asset.name, '.svg')), cost: meta.cost ?? 0, description: meta.description || 'Weapon art discovered from the assets library.', relativePath: asset.relativePath, publicUrl: asset.publicUrl, playable: false, category: meta.category || 'weaponArt', sortOrder: 1000 + index, behaviorId: 'projectile', slot: 'misc', artPath: asset.relativePath });
    });

    const weapons = Array.from(weaponEntriesById.values()).sort((a, b) => {
        const ao = Number.isFinite(a.sortOrder) ? a.sortOrder : Number.MAX_SAFE_INTEGER;
        const bo = Number.isFinite(b.sortOrder) ? b.sortOrder : Number.MAX_SAFE_INTEGER;
        return ao !== bo ? ao - bo : a.label.localeCompare(b.label);
    });

    const enemyVariants = Object.values(enemySprites).sort((a, b) => a.label.localeCompare(b.label));
    const defaultSkinId = skinCatalog.player1 ? 'player1' : (skins[0]?.id || 'player1');
    const defaultWeaponId = weapons.some((w) => w.id === DEFAULT_WEAPON_ID && w.playable) ? DEFAULT_WEAPON_ID : (weapons.find((w) => w.playable)?.id || DEFAULT_WEAPON_ID);

    return { defaultSkinId, defaultWeaponId, defaultEnemySpriteId: enemySprites.enemy ? 'enemy' : (enemyVariants[0]?.id || 'enemy'), skins, skinCatalog, weapons, enemySprites: enemyVariants };
}

function getGameAssetCatalog() {
    const now = Date.now();
    if (gameAssetCatalogCache.data && gameAssetCatalogCache.expiresAt > now) return gameAssetCatalogCache.data;
    gameAssetCatalogCache.data = buildGameAssetCatalog();
    gameAssetCatalogCache.expiresAt = now + 1500;
    return gameAssetCatalogCache.data;
}

function normalizeSkinTheme(value) {
    const { skinCatalog, defaultSkinId } = getGameAssetCatalog();
    return skinCatalog[value] ? value : defaultSkinId;
}

function normalizeWeaponType(value) {
    const { weapons, defaultWeaponId } = getGameAssetCatalog();
    const playable = new Set(weapons.filter((w) => w.playable).map((w) => w.id));
    return playable.has(value) ? value : defaultWeaponId;
}

function normalizeRoomMode(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === ROOM_MODES.PVP_FFA || raw === 'pvp' || raw === 'ffa' || raw === 'pvpffa') return ROOM_MODES.PVP_FFA;
    return ROOM_MODES.PVE;
}

function sanitizeUnlockedSkins(value) {
    const { skins, skinCatalog, defaultSkinId } = getGameAssetCatalog();
    const unlocked = new Set(skins.filter((s) => Number(s.cost) <= 0).map((s) => s.id));
    unlocked.add(defaultSkinId);
    if (Array.isArray(value)) value.forEach((entry) => { const id = normalizeSkinTheme(entry); if (skinCatalog[id]) unlocked.add(id); });
    return Array.from(unlocked);
}

function sanitizeUnlockedWeapons(value) {
    const { weapons, defaultWeaponId } = getGameAssetCatalog();
    const playable = weapons.filter((w) => w.playable);
    const unlocked = new Set(playable.filter((w) => Number(w.cost) <= 0).map((w) => w.id));
    unlocked.add(defaultWeaponId);
    if (Array.isArray(value)) value.forEach((entry) => { const id = normalizeWeaponType(entry); if (playable.some((w) => w.id === id)) unlocked.add(id); });
    return Array.from(unlocked);
}

// ── Asset file operations ─────────────────────────────────────────────────────

function resolveAssetRelativePath(inputPath = '') {
    const raw = typeof inputPath === 'string' ? inputPath.trim() : '';
    const normalized = raw ? path.normalize(raw).replace(/^([/\\])+/, '') : '';
    const absolute = path.resolve(ASSETS_ROOT, normalized);
    if (!isPathInside(ASSETS_ROOT, absolute)) throw new Error('Asset path is outside the allowed assets directory.');
    return { absolutePath: absolute, relativePath: toForwardSlashPath(path.relative(ASSETS_ROOT, absolute)) };
}

function inferGameAssetCategory(relativePath = '') {
    const p = String(relativePath || '').replace(/\\/g, '/').toLowerCase();
    if (p.startsWith('weapons/')) return 'weaponArt';
    if (p.startsWith('sprites/')) return p.includes('enemy') ? 'enemySprite' : 'playerSkin';
    return 'genericAsset';
}

function listConfiguredGameAssetMetadata() {
    return Object.fromEntries(Object.entries(gameAssetMetadataStore.items).map(([p, e]) => [p, { ...e, category: e.category || inferGameAssetCategory(p) }]));
}

function decodeUploadedAssetBuffer(contentBase64) {
    const buffer = Buffer.from(contentBase64, 'base64');
    if (!buffer.length) throw new Error('Uploaded file is empty or invalid.');
    if (buffer.length > MAX_ASSET_UPLOAD_BYTES) throw new Error(`File exceeds ${MAX_ASSET_UPLOAD_BYTES} bytes.`);
    return buffer;
}

async function writeAssetFile({ directory = '', fileName, contentBase64, overwrite = false }) {
    if (!fileName || /[<>:"|?*\x00-\x1F\\/]/.test(fileName)) throw new Error('File name is missing or contains invalid characters.');
    const buffer = decodeUploadedAssetBuffer(contentBase64);
    const { absolutePath: dirAbs, relativePath: dirRel } = resolveAssetRelativePath(directory);
    const fileAbs = path.join(dirAbs, fileName);
    if (!isPathInside(ASSETS_ROOT, fileAbs)) throw new Error('Upload path is invalid.');
    await fs.promises.writeFile(fileAbs, buffer, { flag: overwrite ? 'w' : 'wx' });
    invalidateGameAssetCatalog();
    return { relativePath: dirRel ? `${dirRel}/${fileName}` : fileName, overwritten: overwrite };
}

async function listAssetDirectory(relativeDirectory = '') {
    const { absolutePath, relativePath } = resolveAssetRelativePath(relativeDirectory);
    const stat = await fs.promises.stat(absolutePath).catch(() => null);
    if (!stat || !stat.isDirectory()) throw new Error('Asset directory does not exist.');
    const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
    const detailed = await Promise.all(entries.map(async (entry) => {
        const entryRel = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        const entryAbs = path.join(absolutePath, entry.name);
        const entryStat = await fs.promises.stat(entryAbs);
        return { name: entry.name, type: entry.isDirectory() ? 'directory' : 'file', relativePath: toForwardSlashPath(entryRel), publicUrl: entry.isDirectory() ? null : getAssetPublicUrl(toForwardSlashPath(entryRel)), size: entry.isDirectory() ? null : entryStat.size, modifiedAt: entryStat.mtime.toISOString() };
    }));
    detailed.sort((a, b) => a.type !== b.type ? (a.type === 'directory' ? -1 : 1) : a.name.localeCompare(b.name));
    const segments = relativePath ? relativePath.split('/').filter(Boolean).map((seg, i, arr) => ({ name: seg, relativePath: arr.slice(0, i + 1).join('/') })) : [];
    return { currentDirectory: relativePath, breadcrumbs: [{ name: 'assets', relativePath: '' }, ...segments], entries: detailed };
}

async function collectSvgTemplates(relativeDirectory = '') {
    const { absolutePath, relativePath } = resolveAssetRelativePath(relativeDirectory);
    const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
    const templates = [];
    for (const entry of entries) {
        const entryRel = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        if (entry.isDirectory()) { templates.push(...await collectSvgTemplates(entryRel)); continue; }
        if (/\.svg$/i.test(entry.name)) templates.push({ name: entry.name, relativePath: toForwardSlashPath(entryRel), publicUrl: getAssetPublicUrl(toForwardSlashPath(entryRel)) });
    }
    templates.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return templates;
}

function buildAdminGameAssetCatalogPayload() {
    const catalog = getGameAssetCatalog();
    return { ok: true, defaultSkinId: catalog.defaultSkinId, defaultWeaponId: catalog.defaultWeaponId, defaultEnemySpriteId: catalog.defaultEnemySpriteId, skins: catalog.skins, enemySprites: catalog.enemySprites, weapons: catalog.weapons, metadata: listConfiguredGameAssetMetadata() };
}

function deleteGameAssetMetadataDirectory(dirPath) {
    const prefix = dirPath ? `${dirPath}/` : '';
    let changed = false;
    Object.keys(gameAssetMetadataStore.items).forEach((entryPath) => {
        if (entryPath === dirPath || (prefix && entryPath.startsWith(prefix))) {
            delete gameAssetMetadataStore.items[entryPath];
            changed = true;
        }
    });
    if (changed) { saveGameAssetMetadataStore(); invalidateGameAssetCatalog(); }
}

module.exports = {
    ASSETS_ROOT,
    GAME_ASSET_METADATA_PATH,
    createDefaultGameAssetMetadataStore,
    loadGameAssetMetadataStore,
    getGameAssetMetadataEntry,
    setGameAssetMetadataEntry,
    deleteGameAssetMetadataEntry,
    renameGameAssetMetadataEntry,
    renameGameAssetMetadataPrefix,
    invalidateGameAssetCatalog,
    getGameAssetCatalog,
    getAssetPublicUrl,
    normalizeSkinTheme,
    normalizeWeaponType,
    normalizeRoomMode,
    sanitizeUnlockedSkins,
    sanitizeUnlockedWeapons,
    resolveAssetRelativePath,
    inferGameAssetCategory,
    listConfiguredGameAssetMetadata,
    writeAssetFile,
    listAssetDirectory,
    collectSvgTemplates,
    buildAdminGameAssetCatalogPayload,
    deleteGameAssetMetadataDirectory
};
