'use strict';

const { GAME_CONFIG } = require('./config');
const { normalizeIpAddress, formatMilliseconds } = require('./utils');

// Injected by entry point
let _io;
let _getLeaderboard;
let _addToLeaderboard;
let _getPublicProfile;
let _getUserStore;

function initRoomsDeps(deps) {
    _io = deps.io;
    _getLeaderboard = deps.getLeaderboard;
    _addToLeaderboard = deps.addToLeaderboard;
    _getPublicProfile = deps.getPublicProfile;
    _getUserStore = deps.getUserStore;
}

const gameRooms = new Map();
const blockedIps = new Set();
let blockNewConnections = false;

function isIpBlocked(ipAddress) {
    return blockedIps.has(normalizeIpAddress(ipAddress));
}

function findRoomByPlayerId(playerId) {
    for (const room of gameRooms.values()) {
        if (room.players.has(playerId)) return room;
    }
    return null;
}

function disconnectSocketForModeration(socket, reason, metadata = {}) {
    if (!socket) return;
    socket.data = socket.data || {};
    socket.data.moderationReason = reason;
    socket.data.moderationMetadata = metadata;
    socket.emit('adminNotice', { type: reason, ...metadata });
    socket.disconnect(true);
}

function disconnectSocketsByIp(ipAddress, reason = 'ip_blocked') {
    const normalizedIp = normalizeIpAddress(ipAddress);
    for (const socket of _io.sockets.sockets.values()) {
        if (normalizeIpAddress(socket.data?.clientIp) === normalizedIp) {
            disconnectSocketForModeration(socket, reason, { ipAddress: normalizedIp });
        }
    }
}

function disconnectSocketsByUserId(userId, reason = 'account_deleted') {
    for (const socket of _io.sockets.sockets.values()) {
        if (socket.data?.authUserId === userId) {
            disconnectSocketForModeration(socket, reason, { userId });
        }
    }
}

function syncSocketsForAdminUserUpdate(user, forceReconnect = false) {
    for (const socket of _io.sockets.sockets.values()) {
        if (socket.data?.authUserId !== user.id) continue;
        if (forceReconnect) { disconnectSocketForModeration(socket, 'account_password_reset', { userId: user.id }); continue; }
        socket.data.authUsername = user.username;
        socket.emit('authState', { authenticated: true, profile: _getPublicProfile(user) });
    }
}

function serializeRoomSummary(room) {
    return {
        id: room.id,
        name: room.name,
        mode: room.mode,
        matchSettings: room.isPvpMode() ? { killLimit: room.pvpState.killLimit, timeLimitMs: room.pvpState.timeLimitMs } : null,
        playerCount: room.players.size,
        spectatorCount: room.spectators.size,
        maxPlayers: GAME_CONFIG.maxPlayersPerRoom,
        gameStarted: room.gameStarted,
        locked: room.locked,
        hostId: room.hostId,
        players: Array.from(room.players.values()).map((player) => ({
            id: player.id, name: player.name, alive: player.alive, score: player.score,
            skinTheme: player.skinTheme, isHost: player.id === room.hostId
        }))
    };
}

function emitRoomList(target = null) {
    (target || _io).emit('roomList', Array.from(gameRooms.values()).map(serializeRoomSummary));
}

function emitRoomState(room) {
    _io.to(room.id).emit('roomState', room.getRoomState());
}

function endRoomByConsensus(room) {
    if (!room || !room.gameStarted) return;
    const finalWave = room.wave;
    const playerEntries = Array.from(room.players.entries());
    const spectatorIds = Array.from(room.spectators.values());

    room.gameStarted = false;
    room.shopPhase = false;
    room.shopEndTime = 0;
    room.resetEndMatchVotes();

    for (const [playerId, player] of playerEntries) {
        let rank = null;
        if (player.score > 0) {
            rank = _addToLeaderboard(player.accountUsername || player.name, player.score, finalWave, { accountUserId: player.accountUserId });
        }
        const rewardSummary = room.awardPersistentProgress(player, finalWave);
        if (rewardSummary?.profile) _io.to(playerId).emit('profileUpdated', rewardSummary.profile);
        _io.to(playerId).emit('gameEndedPersonal', {
            finalScore: player.score, finalWave, rank,
            leaderboard: _getLeaderboard(),
            metaReward: rewardSummary?.reward || 0,
            metaCurrency: rewardSummary?.profile?.metaCurrency ?? null,
            reason: 'consensus'
        });
        const playerSocket = _io.sockets.sockets.get(playerId);
        if (playerSocket) playerSocket.leave(room.id);
    }

    for (const spectatorId of spectatorIds) {
        _io.to(spectatorId).emit('gameEnded', { finalWave, leaderboard: _getLeaderboard(), reason: 'consensus' });
        const spectatorSocket = _io.sockets.sockets.get(spectatorId);
        if (spectatorSocket) spectatorSocket.leave(room.id);
    }

    room.players.clear();
    room.spectators.clear();
    room.hostId = null;
    gameRooms.delete(room.id);
    emitRoomList();
}

function getRoomAdminSnapshot(room) {
    const now = Date.now();
    const currentSpawnRate = typeof room.getCurrentSpawnRate === 'function'
        ? room.getCurrentSpawnRate()
        : Math.max(800, GAME_CONFIG.enemy.spawnRate - (room.wave - 1) * GAME_CONFIG.enemy.spawnRateDecrease);
    const players = Array.from(room.players.values());
    const alivePlayers = players.filter((p) => p.alive).length;
    const hostPlayer = room.hostId ? room.players.get(room.hostId) : null;
    const endVoteState = room.getEndMatchVoteState();
    const votingPlayerIds = new Set(endVoteState.playerIds || []);
    const arena = room.arena ? {
        id: room.arena.id, name: room.arena.name, themeId: room.arena.themeId, layoutId: room.arena.layoutId,
        obstacleCount: Array.isArray(room.arena.obstacles) ? room.arena.obstacles.length : 0,
        decorCount: Array.isArray(room.arena.decor) ? room.arena.decor.length : 0
    } : null;

    return {
        id: room.id, name: room.name, locked: room.locked, hostId: room.hostId,
        hostName: hostPlayer ? hostPlayer.name : null, gameStarted: room.gameStarted,
        playerCount: room.players.size, spectatorCount: room.spectators.size,
        maxPlayers: GAME_CONFIG.maxPlayersPerRoom, alivePlayers,
        deadPlayers: room.players.size - alivePlayers, wave: room.wave,
        bossWave: Boolean(room.waveProfile?.bossWave), shopPhase: room.shopPhase,
        shopEndsAt: room.shopPhase ? room.shopEndTime : null,
        shopEndsInMs: room.shopPhase ? Math.max(0, room.shopEndTime - now) : 0,
        shopEndsInLabel: room.shopPhase ? formatMilliseconds(Math.max(0, room.shopEndTime - now)) : '0s',
        shopEndVote: endVoteState, gameStartTime: room.gameStartTime || null,
        gameDurationMs: room.gameStarted && room.gameStartTime ? now - room.gameStartTime : 0,
        gameDurationLabel: room.gameStarted && room.gameStartTime ? formatMilliseconds(now - room.gameStartTime) : '0s',
        waveStartTime: room.waveStartTime || null, enemiesAlive: room.enemies.size,
        enemiesSpawnedThisWave: room.enemiesThisWave, maxEnemiesPerWave: room.maxEnemiesPerWave,
        enemiesRemainingToSpawn: Math.max(0, room.maxEnemiesPerWave - room.enemiesThisWave),
        activeBullets: room.bullets.size, activePowerUps: room.powerUps.size,
        activeParticles: room.particles.size, currentEnemySpawnRateMs: currentSpawnRate,
        currentEnemySpawnRateLabel: `${currentSpawnRate} ms`, arena,
        players: players.map((player) => ({
            id: player.id, name: player.name, alive: player.alive, isHost: player.id === room.hostId,
            health: Math.round(player.health), maxHealth: player.maxHealth, shield: Math.round(player.shield),
            score: player.score, money: player.money, ipAddress: player.ipAddress,
            ipBlocked: isIpBlocked(player.ipAddress), skinTheme: player.skinTheme,
            currentWeapon: player.currentWeapon, votedToEndMatch: votingPlayerIds.has(player.id),
            powerUps: { speed: player.powerUpEffects.speed > 0, damage: player.powerUpEffects.damage > 0, shield: player.powerUpEffects.shield > 0 },
            upgradeLevels: { ...player.upgrades }
        }))
    };
}

function getAdminSummary() {
    const rooms = Array.from(gameRooms.values());
    const roomSnapshots = rooms.map(getRoomAdminSnapshot);
    const totals = roomSnapshots.reduce((acc, room) => {
        acc.players += room.playerCount; acc.spectators += room.spectatorCount;
        acc.alivePlayers += room.alivePlayers; acc.enemies += room.enemiesAlive;
        acc.bullets += room.activeBullets; acc.powerUps += room.activePowerUps;
        acc.particles += room.activeParticles; acc.shopRooms += room.shopPhase ? 1 : 0;
        return acc;
    }, { players: 0, spectators: 0, alivePlayers: 0, enemies: 0, bullets: 0, powerUps: 0, particles: 0, shopRooms: 0 });

    const userStore = _getUserStore ? _getUserStore() : { users: [] };
    return {
        generatedAt: new Date().toISOString(),
        uptimeMs: process.uptime() * 1000,
        uptimeLabel: formatMilliseconds(process.uptime() * 1000),
        adminAccountRequired: true,
        moderation: { blockNewConnections, blockedIps: Array.from(blockedIps.values()).sort() },
        totals: {
            connectedClients: _io.engine.clientsCount, roomCount: rooms.length,
            activeGames: roomSnapshots.filter((r) => r.gameStarted).length,
            userAccounts: userStore.users.length,
            ...totals
        },
        memory: process.memoryUsage(),
        leaderboard: _getLeaderboard(),
        rooms: roomSnapshots
    };
}

function getIo() { return _io; }

function getActiveSocketCountForUser(userId) {
    if (!_io) return 0;
    let count = 0;
    for (const socket of _io.sockets.sockets.values()) {
        if (socket.data?.authUserId === userId) count++;
    }
    return count;
}

function kickPlayerSocket(playerId, roomId, roomName) {
    if (!_io) return false;
    const socket = _io.sockets.sockets.get(playerId);
    if (!socket) return false;
    disconnectSocketForModeration(socket, 'player_kicked', { roomId, roomName });
    return true;
}

module.exports = {
    gameRooms, blockedIps,
    get blockNewConnections() { return blockNewConnections; },
    set blockNewConnections(value) { blockNewConnections = value; },
    initRoomsDeps,
    isIpBlocked,
    findRoomByPlayerId,
    disconnectSocketForModeration,
    disconnectSocketsByIp,
    disconnectSocketsByUserId,
    syncSocketsForAdminUserUpdate,
    serializeRoomSummary,
    emitRoomList,
    emitRoomState,
    endRoomByConsensus,
    getRoomAdminSnapshot,
    getAdminSummary,
    getIo,
    kickPlayerSocket,
    getActiveSocketCountForUser
};
