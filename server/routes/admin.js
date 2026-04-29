'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();

const { requireAdminAuth, getUserById, updateUserAccountFromAdmin, deleteUserAccountFromAdmin, isUserAdmin } = require('../auth');
const { getAdminUserSnapshot } = require('../auth');
const { getGameAssetCatalog, buildAdminGameAssetCatalogPayload, resolveAssetRelativePath, writeAssetFile, listAssetDirectory, collectSvgTemplates, setGameAssetMetadataEntry, getGameAssetMetadataEntry, deleteGameAssetMetadataEntry, renameGameAssetMetadataEntry, renameGameAssetMetadataPrefix, invalidateGameAssetCatalog, inferGameAssetCategory, deleteGameAssetMetadataDirectory, ASSETS_ROOT } = require('../assets');
const { getLeaderboard, getLeaderboardSettings, getAdminLeaderboardEntries, addLeaderboardEntryFromAdmin, clearLeaderboardFromAdmin, updateLeaderboardEntryFromAdmin, deleteLeaderboardEntryFromAdmin } = require('../leaderboard');
const { sanitizeAssetSlug, humanizeAssetName, isPathInside, toForwardSlashPath, normalizeIpAddress } = require('../utils');
const { gameRooms, getAdminSummary, getRoomAdminSnapshot, emitRoomState, emitRoomList, blockedIps, disconnectSocketsByIp, disconnectSocketForModeration, kickPlayerSocket } = require('../rooms');
const roomsModule = require('../rooms');

// ── Summary ───────────────────────────────────────────────────────────────────

router.get('/summary', requireAdminAuth, (req, res) => {
    res.json({ ...getAdminSummary(), viewer: { id: req.user.id, username: req.user.username, isAdmin: true } });
});

// ── Users ─────────────────────────────────────────────────────────────────────

function getAdminUsersPayload() {
    const { skins, weapons } = getGameAssetCatalog();
    const { userStore } = require('../auth');
    const users = [...userStore.users]
        .sort((l, r) => {
            const lt = l.lastLoginAt ? Date.parse(l.lastLoginAt) : 0;
            const rt = r.lastLoginAt ? Date.parse(r.lastLoginAt) : 0;
            if (lt !== rt) return rt - lt;
            return l.username.localeCompare(r.username);
        })
        .map(getAdminUserSnapshot);
    return {
        ok: true, users,
        availableSkins: skins.map((s) => ({ id: s.id, label: s.label, cost: s.cost })),
        availableWeapons: weapons.filter((w) => w.playable).map((w) => ({ id: w.id, label: w.label, cost: w.cost }))
    };
}

router.get('/users', requireAdminAuth, (req, res) => { res.json(getAdminUsersPayload()); });

router.post('/users/:userId', requireAdminAuth, (req, res) => {
    const user = getUserById(req.params.userId);
    if (!user) return res.status(404).json({ ok: false, error: 'User account not found.' });
    const result = updateUserAccountFromAdmin(user, req.body || {});
    if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
    res.json({ ok: true, user: result.user, passwordChanged: result.passwordChanged, users: getAdminUsersPayload().users });
});

router.delete('/users/:userId', requireAdminAuth, (req, res) => {
    const result = deleteUserAccountFromAdmin(req.params.userId);
    if (!result.ok) {
        const statusCode = result.reason === 'User account not found.' ? 404 : 400;
        return res.status(statusCode).json({ ok: false, error: result.reason });
    }
    res.json({ ok: true, deletedUserId: req.params.userId, users: getAdminUsersPayload().users });
});

// ── Leaderboard ───────────────────────────────────────────────────────────────

router.get('/leaderboard', requireAdminAuth, (req, res) => {
    const settings = getLeaderboardSettings();
    res.json({ ok: true, maxEntries: settings.maxEntries, entries: getAdminLeaderboardEntries() });
});

router.post('/leaderboard', requireAdminAuth, (req, res) => {
    const entry = addLeaderboardEntryFromAdmin(req.body || {});
    res.json({ ok: true, entry, entries: getAdminLeaderboardEntries() });
});

router.post('/leaderboard/reset', requireAdminAuth, (req, res) => {
    clearLeaderboardFromAdmin();
    res.json({ ok: true, entries: getAdminLeaderboardEntries() });
});

router.post('/leaderboard/:entryId', requireAdminAuth, (req, res) => {
    const result = updateLeaderboardEntryFromAdmin(req.params.entryId, req.body || {});
    if (!result.ok) return res.status(404).json({ ok: false, error: result.reason });
    res.json({ ok: true, entry: result.entry, entries: getAdminLeaderboardEntries() });
});

router.delete('/leaderboard/:entryId', requireAdminAuth, (req, res) => {
    const result = deleteLeaderboardEntryFromAdmin(req.params.entryId);
    if (!result.ok) return res.status(404).json({ ok: false, error: result.reason });
    res.json({ ok: true, entries: getAdminLeaderboardEntries() });
});

// ── Game Assets ───────────────────────────────────────────────────────────────

router.get('/game-assets/catalog', requireAdminAuth, (req, res) => { res.json(buildAdminGameAssetCatalogPayload()); });

router.post('/game-assets/import', requireAdminAuth, async (req, res) => {
    try {
        const assetKind = typeof req.body?.assetKind === 'string' ? req.body.assetKind.trim() : '';
        const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
        const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
        const fileNameInput = typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';
        const contentBase64 = typeof req.body?.contentBase64 === 'string' ? req.body.contentBase64 : '';
        const overwrite = Boolean(req.body?.overwrite);
        const safeCost = req.body?.cost === '' || req.body?.cost === undefined || req.body?.cost === null
            ? 0 : Math.max(0, Math.round(Number(req.body.cost) || 0));

        const assetDirectoryByKind = { playerSkin: 'sprites', enemySprite: 'sprites', weaponArt: 'weapons' };
        const targetDirectory = assetDirectoryByKind[assetKind];
        if (!targetDirectory) return res.status(400).json({ error: 'Choose a valid game asset type.' });

        const fileStem = sanitizeAssetSlug(fileNameInput || label || `asset-${Date.now()}`);
        if (!fileStem) return res.status(400).json({ error: 'Provide a label or file name for the new asset.' });

        let normalizedFileStem = fileStem;
        if (assetKind === 'enemySprite' && !normalizedFileStem.includes('enemy')) normalizedFileStem = `enemy-${normalizedFileStem}`;

        const resolvedFileName = `${normalizedFileStem}.svg`;
        const uploadResult = await writeAssetFile({ directory: targetDirectory, fileName: resolvedFileName, contentBase64, overwrite });
        setGameAssetMetadataEntry(uploadResult.relativePath, { label: label || humanizeAssetName(resolvedFileName), description: description || '', cost: safeCost, category: assetKind });
        res.json({ ok: true, imported: uploadResult.relativePath, catalog: buildAdminGameAssetCatalogPayload() });
    } catch (error) {
        res.status(400).json({ error: error.code === 'EEXIST' ? 'A file with that name already exists.' : (error.message || 'Unable to import asset.') });
    }
});

router.post('/game-assets/metadata', requireAdminAuth, async (req, res) => {
    try {
        const relativePath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
        if (!relativePath) return res.status(400).json({ error: 'Asset path is required.' });
        const { absolutePath, relativePath: normalizedRelativePath } = resolveAssetRelativePath(relativePath);
        const stat = await fs.promises.stat(absolutePath).catch(() => null);
        if (!stat || !stat.isFile()) return res.status(400).json({ error: 'Select an existing file asset to edit metadata.' });
        setGameAssetMetadataEntry(normalizedRelativePath, { label: req.body?.label, description: req.body?.description, cost: req.body?.cost, category: req.body?.category || inferGameAssetCategory(normalizedRelativePath) });
        res.json({ ok: true, path: normalizedRelativePath, metadata: getGameAssetMetadataEntry(normalizedRelativePath), catalog: buildAdminGameAssetCatalogPayload() });
    } catch (error) {
        res.status(400).json({ error: error.message || 'Unable to update asset metadata.' });
    }
});

router.get('/assets', requireAdminAuth, async (req, res) => {
    try {
        const directory = typeof req.query.dir === 'string' ? req.query.dir : '';
        res.json({ ok: true, ...await listAssetDirectory(directory) });
    } catch (error) {
        res.status(400).json({ error: error.message || 'Unable to list assets.' });
    }
});

router.get('/assets/svg-templates', requireAdminAuth, async (req, res) => {
    try {
        res.json({ ok: true, templates: await collectSvgTemplates('') });
    } catch (error) {
        res.status(400).json({ error: error.message || 'Unable to list SVG templates.' });
    }
});

router.post('/assets/folders', requireAdminAuth, async (req, res) => {
    try {
        const parentDirectory = typeof req.body?.dir === 'string' ? req.body.dir : '';
        const folderName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        if (!folderName || /[<>:"|?*\x00-\x1F\\/]/.test(folderName)) return res.status(400).json({ error: 'Folder name is missing or contains invalid characters.' });
        const { absolutePath: parentAbsolutePath, relativePath: parentRelativePath } = resolveAssetRelativePath(parentDirectory);
        const newFolderAbsolutePath = path.join(parentAbsolutePath, folderName);
        if (!isPathInside(ASSETS_ROOT, newFolderAbsolutePath)) return res.status(400).json({ error: 'Folder path is invalid.' });
        await fs.promises.mkdir(newFolderAbsolutePath, { recursive: false });
        invalidateGameAssetCatalog();
        res.json({ ok: true, created: parentRelativePath ? `${parentRelativePath}/${folderName}` : folderName });
    } catch (error) {
        res.status(400).json({ error: error.code === 'EEXIST' ? 'A folder with that name already exists.' : (error.message || 'Unable to create folder.') });
    }
});

router.post('/assets/upload', requireAdminAuth, async (req, res) => {
    try {
        const directory = typeof req.body?.dir === 'string' ? req.body.dir : '';
        const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';
        const contentBase64 = typeof req.body?.contentBase64 === 'string' ? req.body.contentBase64 : '';
        const overwrite = Boolean(req.body?.overwrite);
        if (!contentBase64) return res.status(400).json({ error: 'File content is required.' });
        const uploadResult = await writeAssetFile({ directory, fileName, contentBase64, overwrite });
        res.json({ ok: true, uploaded: uploadResult.relativePath, overwritten: uploadResult.overwritten });
    } catch (error) {
        res.status(400).json({ error: error.code === 'EEXIST' ? 'A file with that name already exists.' : (error.message || 'Unable to upload asset.') });
    }
});

router.post('/assets/rename', requireAdminAuth, async (req, res) => {
    try {
        const currentPath = typeof req.body?.path === 'string' ? req.body.path : '';
        const newName = typeof req.body?.newName === 'string' ? req.body.newName.trim() : '';
        if (!currentPath) return res.status(400).json({ error: 'Select a specific asset or folder to rename.' });
        if (!newName || /[<>:"|?*\x00-\x1F\\/]/.test(newName)) return res.status(400).json({ error: 'New name is missing or contains invalid characters.' });
        const { absolutePath: currentAbsolutePath, relativePath: currentRelativePath } = resolveAssetRelativePath(currentPath);
        const targetAbsolutePath = path.join(path.dirname(currentAbsolutePath), newName);
        if (!isPathInside(ASSETS_ROOT, targetAbsolutePath)) return res.status(400).json({ error: 'Rename target is invalid.' });
        const currentStat = await fs.promises.stat(currentAbsolutePath);
        await fs.promises.rename(currentAbsolutePath, targetAbsolutePath);
        const renamedRelativePath = toForwardSlashPath(path.relative(ASSETS_ROOT, targetAbsolutePath));
        if (currentStat.isDirectory()) {
            renameGameAssetMetadataPrefix(currentRelativePath, renamedRelativePath);
        } else {
            renameGameAssetMetadataEntry(currentRelativePath, renamedRelativePath);
        }
        invalidateGameAssetCatalog();
        res.json({ ok: true, renamedFrom: currentRelativePath, renamedTo: renamedRelativePath });
    } catch (error) {
        res.status(400).json({ error: error.code === 'EEXIST' ? 'A file or folder with that name already exists.' : (error.message || 'Unable to rename asset.') });
    }
});

router.delete('/assets', requireAdminAuth, async (req, res) => {
    try {
        const targetPath = typeof req.query.path === 'string' ? req.query.path : '';
        const confirmName = typeof req.query.confirmName === 'string' ? req.query.confirmName.trim() : '';
        if (!targetPath) return res.status(400).json({ error: 'Select a specific asset or folder to delete.' });
        const { absolutePath, relativePath } = resolveAssetRelativePath(targetPath);
        const expectedName = path.basename(relativePath);
        if (!confirmName || confirmName !== expectedName) return res.status(400).json({ error: `Type "${expectedName}" to confirm deletion.` });
        const stat = await fs.promises.stat(absolutePath);
        if (stat.isDirectory()) {
            await fs.promises.rm(absolutePath, { recursive: true, force: false });
            deleteGameAssetMetadataDirectory(relativePath);
        } else {
            await fs.promises.unlink(absolutePath);
            deleteGameAssetMetadataEntry(relativePath);
        }
        invalidateGameAssetCatalog();
        res.json({ ok: true, deleted: relativePath });
    } catch (error) {
        res.status(400).json({ error: error.message || 'Unable to delete asset.' });
    }
});

// ── Rooms & Server ────────────────────────────────────────────────────────────

router.get('/rooms/:roomId', requireAdminAuth, (req, res) => {
    const room = gameRooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ generatedAt: new Date().toISOString(), room: getRoomAdminSnapshot(room) });
});

router.post('/server/connections', requireAdminAuth, (req, res) => {
    roomsModule.blockNewConnections = Boolean(req.body?.blocked);
    res.json({ ok: true, blockNewConnections: roomsModule.blockNewConnections });
});

router.post('/rooms/:roomId/lock', requireAdminAuth, (req, res) => {
    const room = gameRooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    room.locked = Boolean(req.body?.locked);
    emitRoomState(room);
    emitRoomList();
    res.json({ ok: true, room: getRoomAdminSnapshot(room) });
});

router.post('/rooms/:roomId/players/:playerId/kick', requireAdminAuth, (req, res) => {
    const room = gameRooms.get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (!room.players.has(req.params.playerId)) return res.status(404).json({ error: 'Player not found in room' });
    const kicked = kickPlayerSocket(req.params.playerId, room.id, room.name);
    if (!kicked) return res.status(404).json({ error: 'Player socket not connected' });
    res.json({ ok: true });
});

router.post('/ip-blocks', requireAdminAuth, (req, res) => {
    const ipAddress = normalizeIpAddress(req.body?.ipAddress);
    const disconnectExisting = req.body?.disconnectExisting !== false;
    if (!ipAddress || ipAddress === 'unknown') return res.status(400).json({ error: 'A valid IP address is required' });
    blockedIps.add(ipAddress);
    if (disconnectExisting) disconnectSocketsByIp(ipAddress, 'ip_blocked');
    res.json({ ok: true, blockedIps: Array.from(blockedIps.values()).sort() });
});

router.delete('/ip-blocks/:ipAddress', requireAdminAuth, (req, res) => {
    const ipAddress = normalizeIpAddress(decodeURIComponent(req.params.ipAddress));
    blockedIps.delete(ipAddress);
    res.json({ ok: true, blockedIps: Array.from(blockedIps.values()).sort() });
});

module.exports = router;
