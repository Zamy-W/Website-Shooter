'use strict';

const { v4: uuidv4 } = require('uuid');
const { GAME_CONFIG } = require('./config');
const { normalizeRoomMode } = require('./assets');
const { v4: uuidv4Request } = require('uuid');
const { getPublicProfile, getAuthenticatedUserFromSocket, saveUserStore, getUserById, addFriendToUser, removeFriendFromUser, sendFriendRequestToUser, acceptFriendRequest, declineFriendRequest } = require('./auth');
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

function buildFriendList(user, io) {
    if (!Array.isArray(user.friends)) return [];
    const onlineUserIds = new Set();
    for (const s of io.sockets.sockets.values()) {
        if (s.data?.authUserId) onlineUserIds.add(s.data.authUserId);
    }
    return user.friends.map(f => ({ ...f, isOnline: onlineUserIds.has(f.userId) }));
}

// Push an updated friendList to every online socket that has userId in their friends list
function pushFriendListToFriendsOf(userId, io) {
    if (!userId) return;
    for (const s of io.sockets.sockets.values()) {
        if (!s.data?.authUserId) continue;
        const u = getUserById(s.data.authUserId);
        if (!u || !Array.isArray(u.friends)) continue;
        if (u.friends.some(f => f.userId === userId)) {
            s.emit('friendList', buildFriendList(u, io));
        }
    }
}

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

        // Send friend list + pending requests immediately on connect
        if (authUser) {
            socket.emit('friendList', buildFriendList(authUser, io));
            socket.emit('friendRequests', authUser.friendRequests || []);
            // Let this user's friends know they just came online
            pushFriendListToFriendsOf(authUser.id, io);
        }

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
            // Re-verify auth in case the user logged in after the socket was first established
            const freshAuth = getAuthenticatedUserFromSocket(socket);
            if (freshAuth) {
                socket.data.authUserId = freshAuth.id;
                socket.data.authUsername = freshAuth.username;
            }
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
            // Send an immediate gameState so the player appears without waiting for the next tick
            socket.emit('gameState', lobby.getGameState());
            // Send recent chat history
            socket.emit('lobbyChatHistory', lobby.chatLog.slice(-50));
            socket.to(LOBBY_ROOM_ID).emit('lobbyChatMessage', {
                system: true, text: `${playerName} joined the lobby`, ts: Date.now()
            });
            // Broadcast updated count to ALL clients so the entry-screen badge is always current
            io.emit('lobbyInfo', { playerCount: lobby.players.size });
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
                // Broadcast updated player count to ALL connected clients (badge visible even outside lobby)
                io.emit('lobbyInfo', { playerCount: lobby.players.size });
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

            // Rate-limit: max 1 message per 1.5 s, mute for 10 s after 5 rapid messages
            const now = Date.now();
            socket.data.chatLog = socket.data.chatLog || [];
            // Drop entries older than 10 s
            socket.data.chatLog = socket.data.chatLog.filter(t => now - t < 10000);

            if (socket.data.chatMutedUntil && now < socket.data.chatMutedUntil) {
                const secsLeft = Math.ceil((socket.data.chatMutedUntil - now) / 1000);
                socket.emit('lobbyChatMessage', {
                    system: true, text: `You are sending too fast. Please wait ${secsLeft}s.`, ts: now
                });
                return;
            }

            const RATE_WINDOW_MS = 5000;   // sliding window
            const MAX_IN_WINDOW  = 5;      // max messages in window before mute
            const MUTE_DURATION  = 10000;  // 10 s mute
            const MIN_GAP_MS     = 1000;   // minimum 1 s between messages

            const windowMsgs = socket.data.chatLog.filter(t => now - t < RATE_WINDOW_MS);
            const lastMsg = socket.data.chatLog[socket.data.chatLog.length - 1] || 0;

            if (now - lastMsg < MIN_GAP_MS) {
                socket.emit('lobbyChatMessage', {
                    system: true, text: 'You are sending messages too quickly!', ts: now
                });
                return;
            }

            if (windowMsgs.length >= MAX_IN_WINDOW) {
                socket.data.chatMutedUntil = now + MUTE_DURATION;
                socket.emit('lobbyChatMessage', {
                    system: true, text: `Slow down! You have been muted for ${MUTE_DURATION / 1000}s.`, ts: now
                });
                return;
            }

            socket.data.chatLog.push(now);
            const msg = { playerId: socket.id, playerName: player.name, text: safe, ts: now };
            lobby.chatLog.push(msg);
            if (lobby.chatLog.length > 100) lobby.chatLog.shift();
            io.to(LOBBY_ROOM_ID).emit('lobbyChatMessage', msg);
        });

        socket.on('lobbyUpdateAppearance', (skinTheme, weaponType) => {
            const lobby = gameRooms.get(LOBBY_ROOM_ID);
            if (!lobby) return;
            lobby.applyLobbyAppearance(socket.id, skinTheme, weaponType);
            // Push updated state immediately so all players see the change right away
            io.to(LOBBY_ROOM_ID).emit('gameState', lobby.getGameState());
        });

        socket.on('getLobbyInfo', () => {
            const lobby = gameRooms.get(LOBBY_ROOM_ID);
            socket.emit('lobbyInfo', { playerCount: lobby ? lobby.players.size : 0 });
        });

        // ── Friend list & player profile ──────────────────────────────────────

        // Get profile/stats of a specific player currently in the lobby
        socket.on('getLobbyPlayerProfile', (targetSocketId) => {
            const lobby = gameRooms.get(LOBBY_ROOM_ID);
            // Allow any connected socket to fetch a lobby player's profile (not just lobby members)
            const target = lobby?.players.get(targetSocketId);
            if (!target) { socket.emit('lobbyPlayerProfile', null); return; }

            // Get their account stats if they have an account
            const authUser = getAuthenticatedUserFromSocket(socket); // requester
            const myFriends = authUser?.friends || [];
            const isFriend = myFriends.some(f => f.userId === target.accountUserId);

            socket.emit('lobbyPlayerProfile', {
                socketId: targetSocketId,
                name: target.name,
                accountUserId: target.accountUserId || null,
                accountUsername: target.accountUsername || null,
                skinTheme: target.skinTheme,
                currentWeapon: target.currentWeapon,
                stats: target.accountUserId ? (() => {
                    const u = getUserById(target.accountUserId);
                    return u ? u.progression.stats : null;
                })() : null,
                isFriend,
                isSelf: targetSocketId === socket.id
            });
        });

        // Get profile/stats of a friend by their persistent userId (works even when offline)
        socket.on('getFriendProfile', (targetUserId) => {
            if (!targetUserId) return;
            const requester = getAuthenticatedUserFromSocket(socket);
            const myFriends = requester?.friends || [];
            const isFriend = myFriends.some(f => f.userId === targetUserId);
            const targetUser = getUserById(targetUserId);
            if (!targetUser) { socket.emit('friendProfile', null); return; }

            // Check if they're currently online
            let onlineSocketId = null;
            for (const s of io.sockets.sockets.values()) {
                if (s.data?.authUserId === targetUserId) { onlineSocketId = s.id; break; }
            }

            socket.emit('friendProfile', {
                socketId: onlineSocketId,
                name: targetUser.username,
                accountUserId: targetUser.id,
                accountUsername: targetUser.username,
                skinTheme: null,
                currentWeapon: null,
                stats: targetUser.progression?.stats || null,
                isFriend,
                isSelf: targetUser.id === requester?.id,
                isOnline: Boolean(onlineSocketId)
            });
        });

        // Send a friend request (target must be in lobby and have an account)
        socket.on('sendFriendRequest', (targetSocketId) => {
            const requester = getAuthenticatedUserFromSocket(socket);
            if (!requester) { socket.emit('friendRequestResult', { ok: false, reason: 'You must be logged in to add friends.' }); return; }
            const lobby = gameRooms.get(LOBBY_ROOM_ID);
            const target = lobby?.players.get(targetSocketId);
            if (!target?.accountUserId) { socket.emit('friendRequestResult', { ok: false, reason: 'That player does not have an account.' }); return; }
            if (target.accountUserId === requester.id) { socket.emit('friendRequestResult', { ok: false, reason: 'You cannot add yourself.' }); return; }

            // Check if already friends
            if (Array.isArray(requester.friends) && requester.friends.some(f => f.userId === target.accountUserId)) {
                socket.emit('friendRequestResult', { ok: false, reason: 'You are already friends!' }); return;
            }

            const targetUser = getUserById(target.accountUserId);
            if (!targetUser) { socket.emit('friendRequestResult', { ok: false, reason: 'User not found.' }); return; }

            const result = sendFriendRequestToUser(targetUser, requester.id, requester.username);
            if (!result.ok) {
                const msgs = { already_friends: 'Already friends!', already_sent: 'Friend request already sent!', self: 'Cannot add yourself.', invalid: 'Invalid request.' };
                socket.emit('friendRequestResult', { ok: false, reason: msgs[result.reason] || result.reason }); return;
            }
            socket.emit('friendRequestResult', { ok: true, sent: true, username: targetUser.username });

            // Notify target if online
            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                targetSocket.emit('friendRequestReceived', { requestId: result.requestId, fromUserId: requester.id, fromUsername: requester.username });
            }
        });

        // Accept or decline a friend request
        socket.on('respondFriendRequest', (requestId, accept) => {
            const user = getAuthenticatedUserFromSocket(socket);
            if (!user) return;
            if (accept) {
                const req = acceptFriendRequest(user, requestId);
                if (req) {
                    // Also add user to requester's friends list
                    const requesterUser = getUserById(req.fromUserId);
                    if (requesterUser) {
                        addFriendToUser(requesterUser, user.id, user.username);
                        // Notify requester if online
                        for (const s of io.sockets.sockets.values()) {
                            if (s.data?.authUserId === req.fromUserId) {
                                s.emit('friendRequestAccepted', { byUserId: user.id, byUsername: user.username });
                                s.emit('friendList', buildFriendList(requesterUser, io));
                            }
                        }
                    }
                    socket.emit('friendList', buildFriendList(user, io));
                    socket.emit('friendRequests', user.friendRequests || []);
                }
            } else {
                declineFriendRequest(user, requestId);
                socket.emit('friendRequests', user.friendRequests || []);
            }
        });

        // Remove a friend by their userId
        socket.on('removeFriend', (targetUserId) => {
            const requester = getAuthenticatedUserFromSocket(socket);
            if (!requester) return;
            removeFriendFromUser(requester, targetUserId);
            socket.emit('friendList', buildFriendList(requester, io));
        });

        // Get current friend list + pending requests
        socket.on('getFriends', () => {
            const user = getAuthenticatedUserFromSocket(socket);
            if (!user) { socket.emit('friendList', []); return; }
            socket.emit('friendList', buildFriendList(user, io));
            socket.emit('friendRequests', user.friendRequests || []);
        });

        // Send a game room invite to a friend (by userId)
        socket.on('sendGameInvite', (targetUserId) => {
            const sender = getAuthenticatedUserFromSocket(socket);
            if (!sender) return;

            // Find sender's current room
            let senderRoom = null;
            for (const room of gameRooms.values()) {
                if (room.players.has(socket.id)) { senderRoom = room; break; }
            }
            if (!senderRoom) { socket.emit('gameInviteResult', { ok: false, reason: 'You are not in a room.' }); return; }

            const inviteId = uuidv4Request();
            let sent = false;
            for (const s of io.sockets.sockets.values()) {
                if (s.data?.authUserId === targetUserId) {
                    s.emit('gameInviteReceived', {
                        inviteId,
                        fromUserId: sender.id,
                        fromUsername: sender.username,
                        roomId: senderRoom.id,
                        roomName: senderRoom.name,
                        isLobby: senderRoom.isLobbyMode()
                    });
                    sent = true;
                }
            }
            socket.emit('gameInviteResult', { ok: true, sent, offline: !sent });
        });

        socket.on('disconnect', () => {
            console.log(`Player disconnected: ${socket.id} (Remaining clients: ${io.engine.clientsCount - 1})`);
            // Notify this user's friends that they went offline
            if (socket.data?.authUserId) pushFriendListToFriendsOf(socket.data.authUserId, io);

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
                    if (room.isLobbyMode()) {
                        // Broadcast updated count to ALL connected clients (badge visible even outside lobby)
                        io.emit('lobbyInfo', { playerCount: room.players.size });
                    } else {
                        if (room.players.size === 0) gameRooms.delete(roomId);
                    }
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
