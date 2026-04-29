'use strict';

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const os = require('os');

// ── Core modules ──────────────────────────────────────────────────────────────
const { GAME_CONFIG } = require('./server/config');
const { ensureDataStorage, initAuthDeps, initUserStore, getAuthenticatedUserFromRequest, isUserAdmin, saveUserStore, userStore, getPublicProfile, awardProgressionToUser, getUserById } = require('./server/auth');
const { loadGameAssetMetadataStore, getGameAssetCatalog, getAssetPublicUrl, normalizeSkinTheme, normalizeWeaponType, normalizeRoomMode, sanitizeUnlockedSkins, sanitizeUnlockedWeapons } = require('./server/assets');
const { getLeaderboard, addToLeaderboard } = require('./server/leaderboard');
const { UPGRADE_CONFIG } = require('./server/upgrades');
const { initServerPlayerDeps } = require('./server/entities/ServerPlayer');
const { initServerEnemyDeps } = require('./server/entities/ServerEnemy');
const { initGameRoomDeps } = require('./server/entities/GameRoom');
const { initRoomsDeps, gameRooms, emitRoomList, serializeRoomSummary } = require('./server/rooms');
const { registerSocketHandlers } = require('./server/sockets');

// ── Express + Socket.IO setup ─────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ── Init: wire dependency injections ─────────────────────────────────────────
initAuthDeps({ getGameAssetCatalog, normalizeSkinTheme, normalizeWeaponType, sanitizeUnlockedSkins, sanitizeUnlockedWeapons });

ensureDataStorage();
loadGameAssetMetadataStore();
initUserStore();

initServerPlayerDeps({ normalizeSkinTheme, normalizeWeaponType, sanitizeUnlockedWeapons, getGameAssetCatalog });
initServerEnemyDeps({ getGameAssetCatalog });

initGameRoomDeps({
    io,
    emitRoomState: (room) => io.to(room.id).emit('roomState', room.getRoomState()),
    emitRoomList: () => io.emit('roomList', Array.from(gameRooms.values()).map(serializeRoomSummary)),
    getUserById,
    saveUserStore,
    awardProgressionToUser,
    getGameAssetCatalog,
    normalizeSkinTheme,
    normalizeWeaponType,
    normalizeRoomMode,
    sanitizeUnlockedSkins,
    sanitizeUnlockedWeapons,
    addToLeaderboard,
    getLeaderboard
});

initRoomsDeps({
    io,
    getLeaderboard,
    addToLeaderboard,
    getPublicProfile,
    getUserStore: () => userStore
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

const ADMIN_PAGE_PATHS = new Set([
    '/admin.html', '/asset-admin.html', '/progress-admin.html',
    '/sprite-forge.html', '/sprite-builder.html', '/spectator.html'
]);

app.use((req, res, next) => {
    if (!ADMIN_PAGE_PATHS.has(req.path)) return next();
    const user = getAuthenticatedUserFromRequest(req);
    if (!user) return res.redirect('/?admin=required');
    if (!isUserAdmin(user)) return res.redirect('/?admin=forbidden');
    req.user = user;
    next();
});

app.use(express.static(path.join(__dirname), {
    etag: false,
    maxAge: 0,
    setHeaders: (res, filePath) => {
        if (/\.(html|js|css|svg)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/admin', require('./server/routes/admin'));
app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/profile', require('./server/routes/profile'));
app.use('/api', require('./server/routes/public'));

// ── Socket.IO ─────────────────────────────────────────────────────────────────
registerSocketHandlers(io);

// ── Game loop (60 FPS tick) ───────────────────────────────────────────────────
setInterval(() => {
    for (const room of gameRooms.values()) {
        room.update();
        if (room.gameStarted && room.players.size > 0) {
            io.to(room.id).emit('gameState', room.getGameState());
        }
    }
}, 1000 / GAME_CONFIG.tickRate);

// ── Periodic room list sync ───────────────────────────────────────────────────
setInterval(() => {
    if (io.engine.clientsCount > 0) {
        const roomListData = Array.from(gameRooms.values()).map(serializeRoomSummary);
        if (roomListData.length > 0) {
            io.emit('roomList', roomListData);
        }
    }
}, 5000);

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Game accessible at http://localhost:${PORT}`);

    const interfaces = os.networkInterfaces();
    const addresses = Object.values(interfaces)
        .flatMap((entries) => Array.isArray(entries) ? entries : [])
        .filter((entry) => entry?.family === 'IPv4' && !entry.internal)
        .map((entry) => entry.address)
        .filter(Boolean);
    const uniqueAddresses = [...new Set(addresses)];
    if (uniqueAddresses.length > 0) {
        console.log(`Network access: ${uniqueAddresses.map((ip) => `http://${ip}:${PORT}`).join(' | ')}`);
    }
});

process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => { console.log('Server shut down.'); process.exit(0); });
});
