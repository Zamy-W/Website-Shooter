'use strict';

const { v4: uuidv4 } = require('uuid');
const { GAME_CONFIG } = require('./config');
const { normalizeRoomMode } = require('./assets');
const { getPublicProfile, getAuthenticatedUserFromSocket, saveUserStore } = require('./auth');
const { getLeaderboard, addToLeaderboard } = require('./leaderboard');
const { getClientIp } = require('./utils');
const { GameRoom } = require('./entities/GameRoom');
const {
    gameRooms, isIpBlocked, emitRoomList, emitRoomState, endRoomByConsensus,
    serializeRoomSummary
} = require('./rooms');

// blockNewConnections is accessed via the module object so setter/getter works
const roomsModule = require('./rooms');

const LOBBY_ROOM_ID = 'persistent-lobby';
const LOBBY_ROOM_NAME = '🏠 Social Lobby';

function ensureLobbyRoom() {
    if (!gameRooms.has(LOBBY_ROOM_ID)) {
        const lobby = new GameRoom(LOBBY_ROOM_ID, LOBBY_ROOM_NAME, { mode: 'lobby' });
        lobby.gameStarted = true;
        lobby.lastUpdateTime = Date.now();
        gameRooms.set(LOBBY_ROOM_ID, lobby);
        console.log('Social Lobby created');
    }
    return gameRooms.get(LOBBY_ROOM_ID);
}

function registerSocketHandlers(io) {
    ensureLobbyRoom();

    io.on('connection', (socket) => {
        socket.data = socket.data || {};
        socket.data.clientIp = getClientIp(socket);
        const authUser = getAuthenticatedUserFromSocket(socket);
        socket.data.authUserId = authUser?.id || null;
        socket.data.authUsername = authUser?.username || null;

        if (roomsModule.blockNewConnections) {
            socket.emit('joinRoomFailed', 'Server is temporarily locked to new connections');
            socket.disconnect(true);
            return;
        }

        if (isIpBlocked(socket.data.clientIp)) {
            socket.emit('joinRoomFailed', 'This IP address has been blocked by an admin');
            socket.disconnect(true);
            return;
        }

        console.log(`Player connected: ${socket.id} (Total clients: ${io.engine.clientsCount})`);

        socket.emit('authState', {
            authenticated: Boolean(authUser),
            profile: authUser ? getPublicProfile(authUser) : null
        });

        emitRoomList(socket);

        socket.on('getRooms', () => {
            console.log(`Player ${socket.id} requested room list refresh`);
            emitRoomList(socket);
        });

        socket.on('createRoom', (roomName, playerName, skinTheme, selectedWeapon, roomMode, roomOptions) => {
            console.log(`Creating room: ${roomName} by player: ${playerName}`);
            const roomId = uuidv4();
            const normalizedMode = normalizeRoomMode(roomMode);
            const pvpSettings = roomOptions && typeof roomOptions === 'object' ? roomOptions : {};
            const room = new GameRoom(roomId, roomName, { mode: normalizedMode, pvpSettings });
            gameRooms.set(roomId, room);

            if (room.addPlayer(socket, playerName, skinTheme, selectedWeapon)) {
                console.log(`Room created successfully. Room ID: ${roomId}`);
                socket.emit('roomJoined', { roomId, roomName, playerId: socket.id });
                emitRoomState(room);
                console.log(`Broadcasting room list update. Total rooms: ${gameRooms.size}`);
                emitRoomList();
            }
        });

        socket.on('spectateRoom', (roomId) => {
            const room = gameRooms.get(roomId);
            if (!room) { socket.emit('joinRoomFailed', 'Room does not exist for spectating'); return; }
            room.addSpectator(socket);
            socket.emit('spectatorJoined', { roomId: room.id, roomName: room.name });
            emitRoomState(room);
            if (room.gameStarted) {
                socket.emit('arenaState', room.getArenaState());
                socket.emit('gameStarted');
                socket.emit('gameState', room.getGameState());
            }
            emitRoomList();
        });

        socket.on('joinRoom', (roomId, playerName, skinTheme, selectedWeapon) => {
            const room = gameRooms.get(roomId);
            if (room && room.locked) { socket.emit('joinRoomFailed', 'This room has been locked by an admin'); return; }
            if (room && room.addPlayer(socket, playerName, skinTheme, selectedWeapon)) {
                socket.emit('roomJoined', { roomId, roomName: room.name, playerId: socket.id });
                emitRoomState(room);
                if (room.gameStarted) {
                    socket.emit('arenaState', room.getArenaState());
                    socket.emit('gameStarted');
                    if (!room.isPvpMode()) {
                        socket.emit('waveStart', { wave: room.wave, enemyCount: room.maxEnemiesPerWave, spawnRate: room.getCurrentSpawnRate(), ...room.getWaveInfo() });
                    }
                    console.log(`Player ${playerName} joined game in progress`);
                }
                socket.to(roomId).emit('playerJoined', { playerId: socket.id, playerName });
                emitRoomState(room);
                emitRoomList();
            } else {
                socket.emit('joinRoomFailed', 'Room is full or does not exist');
            }
        });

        socket.on('startGame', () => {
            for (const room of gameRooms.values()) {
                if (room.players.has(socket.id)) {
                    if (room.hostId !== socket.id) { socket.emit('joinRoomFailed', 'Only the host can start this room'); break; }
                    if (!room.gameStarted && room.players.size > 0) {
                        room.startGame();
                        emitRoomState(room);
                        io.to(room.id).emit('gameStarted');
                        room.emitWaveStart();
                    }
                    break;
                }
            }
        });

        socket.on('playerInput', (inputState) => {
            for (const room of gameRooms.values()) {
                if (room.players.has(socket.id)) { room.updatePlayerInput(socket.id, inputState); break; }
            }
        });

        socket.on('playerShoot', (weaponType, callback) => {
            let handled = false;
            for (const room of gameRooms.values()) {
                if (room.players.has(socket.id)) {
                    handled = true;
                    const result = room.playerShoot(socket.id, weaponType);
                    if (typeof callback === 'function') callback(result);
                    if (result?.ok) io.to(room.id).emit('gameState', room.getGameState());
                    break;
                }
            }
            if (!handled && typeof callback === 'function') callback({ ok: false, reason: 'Player is not in an active room' });
        });

        socket.on('reloadWeapon', (weaponType, callback) => {
            let handled = false;
            for (const room of gameRooms.values()) {
                if (room.players.has(socket.id)) {
                    handled = true;
                    const result = room.requestReload(socket.id, weaponType);
                    if (result.ok) io.to(room.id).emit('gameState', room.getGameState());
                    if (typeof callback === 'function') callback(result);
                    break;
                }
            }
            if (!handled && typeof callback === 'function') callback({ ok: false, reason: 'Room not found' });
        });

        socket.on('throwGrenade', (options, callback) => {
            let handled = false;
            for (const room of gameRooms.values()) {
                if (room.players.has(socket.id)) {
                    handled = true;
                    const result = room.throwGrenade(socket.id, options);
                    if (result?.ok) io.to(room.id).emit('gameState', room.getGameState());
                    if (typeof callback === 'function') callback(result);
                    break;
                }
            }
            if (!handled && typeof callback === 'function') callback({ ok: false, reason: 'Room not found' });
        });

        socket.on('buyUpgrade', (upgradeType, callback) => {
            let handled = false;
            for (const room of gameRooms.values()) {
                if (room.players.has(socket.id)) {
                    handled = true;
                    const result = room.purchaseUpgrade(socket.id, upgradeType);
                    if (typeof callback === 'function') callback(result);
                    socket.emit('shopPurchaseResult', result);
                    if (result.ok) {
                        io.to(room.id).emit('gameState', room.getGameState());
                    } else {
                        socket.emit('shopError', result.reason);
                    }
                    break;
                }
            }
            if (!handled && typeof callback === 'function') callback({ ok: false, reason: 'Player not found in active room' });
        });

        socket.on('voteEndMatch', (callback) => {
            let handled = false;
            for (const room of gameRooms.values()) {
                if (room.players.has(socket.id)) {
                    handled = true;
                    const result = room.toggleEndMatchVote(socket.id);
                    if (typeof callback === 'function') callback(result);
                    if (!result.ok) { socket.emit('shopError', result.reason); break; }
                    io.to(room.id).emit('gameState', room.getGameState());
                    if (result.completed) endRoomByConsensus(room);
                    break;
                }
            }
            if (!handled && typeof callback === 'function') callback({ ok: false, reason: 'Player not found in active room' });
        });

        socket.on('respawn', () => {
            for (const room of gameRooms.values()) {
                const player = room.players.get(socket.id);
                if (player && !player.alive) { player.respawn(room.getPlayerSpawnPoint(player)); break; }
            }
        });

        socket.on('endGame', () => {
            for (const room of gameRooms.values()) {
                const player = room.players.get(socket.id);
                if (player) {
                    const rewardSummary = room.awardPersistentProgress(player, room.wave);
                    if (rewardSummary?.profile) socket.emit('profileUpdated', rewardSummary.profile);

                    let rank = null;
                    if (player.score > 0) {
                        rank = addToLeaderboard(player.accountUsername || player.name, player.score, room.wave, { accountUserId: player.accountUserId });
                        console.log(`Player ${player.name} ended game with score ${player.score}, wave ${room.wave}, rank ${rank}`);
                    }

                    socket.emit('gameEndedPersonal', {
                        finalScore: player.score, finalWave: room.wave, rank,
                        leaderboard: getLeaderboard(),
                        metaReward: rewardSummary?.reward || 0,
                        metaCurrency: rewardSummary?.profile?.metaCurrency ?? null
                    });

                    room.removePlayer(socket.id);
                    socket.leave(room.id);
                    socket.to(room.id).emit('playerLeft', socket.id);
                    emitRoomState(room);

                    if (room.players.size === 0) {
                        room.endGame();
                        gameRooms.delete(room.id);
                    }
                    emitRoomList();
                    break;
                }
            }
        });

        // ── Social Lobby ──────────────────────────────────────────────────────────

        socket.on('joinLobby', (playerName, skinTheme, selectedWeapon) => {
            const lobby = ensureLobbyRoom();
            // Leave any active game room first
            for (const [rid, room] of gameRooms) {
                if (rid !== LOBBY_ROOM_ID && room.players.has(socket.id)) {
                    room.removePlayer(socket.id);
                    socket.leave(rid);
                    emitRoomState(room);
                    if (room.players.size === 0 && !room.isLobbyMode()) gameRooms.delete(rid);
                    emitRoomList();
                }
            }
            if (!lobby.players.has(socket.id)) {
                if (!lobby.addPlayer(socket, playerName, skinTheme, selectedWeapon)) {
                    socket.emit('joinRoomFailed', 'Lobby is full');
                    return;
                }
            }
            socket.emit('lobbyJoined', { roomId: LOBBY_ROOM_ID, playerId: socket.id, playerCount: lobby.players.size });
            socket.emit('arenaState', lobby.getArenaState());
            // Send recent chat history
            socket.emit('lobbyChatHistory', lobby.chatLog.slice(-50));
            socket.to(LOBBY_ROOM_ID).emit('lobbyChatMessage', {
                system: true, text: `${playerName} joined the lobby`, ts: Date.now()
            });
            emitRoomState(lobby);
        });

        socket.on('leaveLobby', () => {
            const lobby = gameRooms.get(LOBBY_ROOM_ID);
            if (lobby && lobby.players.has(socket.id)) {
                const player = lobby.players.get(socket.id);
                const name = player?.name || 'A player';
                lobby.removePlayer(socket.id);
                socket.leave(LOBBY_ROOM_ID);
                io.to(LOBBY_ROOM_ID).emit('lobbyChatMessage', {
                    system: true, text: `${name} left the lobby`, ts: Date.now()
                });
                emitRoomState(lobby);
            }
            socket.emit('leftLobby');
            emitRoomList(socket);
        });

        socket.on('lobbyChat', (text) => {
            const lobby = gameRooms.get(LOBBY_ROOM_ID);
            if (!lobby || !lobby.players.has(socket.id)) return;
            const player = lobby.players.get(socket.id);
            const safe = String(text || '').trim().slice(0, 200);
            if (!safe) return;
            const msg = { playerId: socket.id, playerName: player.name, text: safe, ts: Date.now() };
            lobby.chatLog.push(msg);
            if (lobby.chatLog.length > 100) lobby.chatLog.shift();
            io.to(LOBBY_ROOM_ID).emit('lobbyChatMessage', msg);
        });

        socket.on('lobbyUpdateAppearance', (skinTheme, weaponType) => {
            const lobby = gameRooms.get(LOBBY_ROOM_ID);
            if (lobby) lobby.applyLobbyAppearance(socket.id, skinTheme, weaponType);
        });

        socket.on('getLobbyInfo', () => {
            const lobby = gameRooms.get(LOBBY_ROOM_ID);
            socket.emit('lobbyInfo', { playerCount: lobby ? lobby.players.size : 0 });
        });

        socket.on('disconnect', () => {
            console.log(`Player disconnected: ${socket.id} (Remaining clients: ${io.engine.clientsCount - 1})`);

            for (const room of gameRooms.values()) {
                if (room.spectators.has(socket.id)) {
                    room.removeSpectator(socket.id);
                    emitRoomState(room);
                    emitRoomList();
                    break;
                }
            }

            for (const [roomId, room] of gameRooms) {
                if (room.players.has(socket.id)) {
                    const player = room.players.get(socket.id);
                    if (player && room.gameStarted) room.awardPersistentProgress(player, room.wave);
                    if (player && player.score > 0 && room.gameStarted) {
                        addToLeaderboard(player.accountUsername || player.name, player.score, room.wave, { accountUserId: player.accountUserId });
                    }
                    room.removePlayer(socket.id);
                    if (room.players.size === 0 && room.gameStarted && !room.isLobbyMode()) room.endGame();
                    socket.to(roomId).emit('playerLeft', socket.id);
                    emitRoomState(room);
                    if (room.players.size === 0 && !room.isLobbyMode()) gameRooms.delete(roomId);
                    emitRoomList();
                    break;
                }
            }
        });

        socket.on('getLeaderboard', () => {
            console.log(`Player ${socket.id} requested leaderboard`);
            const leaderboard = getLeaderboard();
            console.log(`Sending leaderboard with ${leaderboard.length} entries`);
            socket.emit('leaderboard', leaderboard);
        });
    });
}

module.exports = { registerSocketHandlers };
