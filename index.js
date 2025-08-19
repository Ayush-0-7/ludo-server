import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';

import { COLORS } from './config/constants.js';
import { initialPlayer, legalMovesForPlayer, applyMove, nextActivePlayerIdx, getWinner } from './logic/gameLogic.js';

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity
        methods: ["GET", "POST"]
    }
});

const gameRooms = {};

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on('createGame', ({ playerName }) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        socket.join(roomId);

        const player = initialPlayer(COLORS[0], playerName, socket.id);
        
        gameRooms[roomId] = {
            roomId,
            players: [player],
            hostId: socket.id,
            status: 'lobby', // lobby, playing, finished
            diceValue: null,
            activeIdx: 0,
            sixChain: 0,
            extraTurn: false,
            winner: null,
            message: `${playerName} created the game. Waiting for players...`,
        };
        
        io.to(roomId).emit('gameStateUpdate', gameRooms[roomId]);
    });

    socket.on('joinGame', ({ roomId, playerName }) => {
        const room = gameRooms[roomId];
        if (!room) {
            return socket.emit('error', 'Room not found.');
        }
        if (room.players.length >= 4) {
            return socket.emit('error', 'Room is full.');
        }
        if (room.status !== 'lobby') {
            return socket.emit('error', 'Game has already started.');
        }

        socket.join(roomId);
        const playerColor = COLORS[room.players.length];
        const newPlayer = initialPlayer(playerColor, playerName, socket.id);
        room.players.push(newPlayer);
        room.message = `${playerName} has joined the game.`;
        
        io.to(roomId).emit('gameStateUpdate', room);
    });

    socket.on('startGame', ({ roomId }) => {
        const room = gameRooms[roomId];
        if (room && room.hostId === socket.id) {
            room.status = 'playing';
            room.message = `Game started! ${room.players[0].name}'s turn to roll.`;
            io.to(roomId).emit('gameStateUpdate', room);
        }
    });

    socket.on('rollDice', ({ roomId }) => {
        const room = gameRooms[roomId];
        const player = room.players[room.activeIdx];
        if (!room || room.status !== 'playing' || player.id !== socket.id) return;

        const diceValue = Math.floor(Math.random() * 6) + 1;
        room.diceValue = diceValue;
        
        const newSixChain = diceValue === 6 ? room.sixChain + 1 : 0;
        room.sixChain = newSixChain;
        
        const possibleMoves = legalMovesForPlayer(player, room.players, diceValue);

        if (newSixChain === 3) {
            room.message = `${player.name} rolled three 6s. Turn forfeited!`;
            const nextIdx = nextActivePlayerIdx(room, room.activeIdx);
            room.activeIdx = nextIdx;
            room.diceValue = null;
            room.sixChain = 0;
            room.extraTurn = false;
            setTimeout(() => {
                room.message = `${room.players[nextIdx].name}'s turn to roll.`;
                io.to(roomId).emit('gameStateUpdate', room);
            }, 1500);
        } else if (possibleMoves.length === 0) {
            room.message = `${player.name} rolled a ${diceValue} but has no moves.`;
            const extra = diceValue === 6;
            const nextIdx = extra ? room.activeIdx : nextActivePlayerIdx(room, room.activeIdx);
            setTimeout(() => {
                room.activeIdx = nextIdx;
                room.diceValue = null;
                room.sixChain = extra ? room.sixChain : 0;
                room.extraTurn = false;
                room.message = `${room.players[nextIdx].name}'s turn to roll.`;
                io.to(roomId).emit('gameStateUpdate', room);
            }, 1500);
        } else {
             room.message = `${player.name} rolled a ${diceValue}. Select a token to move.`;
        }
        
        io.to(roomId).emit('gameStateUpdate', room);
    });

    socket.on('makeMove', ({ roomId, move }) => {
        const room = gameRooms[roomId];
        const player = room.players[room.activeIdx];
        if (!room || room.status !== 'playing' || player.id !== socket.id) return;

        let updatedGame = applyMove(room, room.activeIdx, move);
        
        if (updatedGame.winner) {
            updatedGame.status = 'finished';
            updatedGame.message = `${updatedGame.winner.name} has won the game!`;
        } else {
            const nextIdx = nextActivePlayerIdx(updatedGame, updatedGame.activeIdx);
            updatedGame.activeIdx = nextIdx;
            updatedGame.diceValue = null;
            updatedGame.sixChain = updatedGame.extraTurn ? updatedGame.sixChain : 0;
            updatedGame.message = `${updatedGame.players[nextIdx].name}'s turn to roll.`;
        }
        
        gameRooms[roomId] = updatedGame;
        io.to(roomId).emit('gameStateUpdate', updatedGame);
    });

    socket.on('disconnect', () => {
        console.log(`User Disconnected: ${socket.id}`);
        // Find which room the player was in
        for (const roomId in gameRooms) {
            const room = gameRooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                if (room.players.length === 0) {
                    delete gameRooms[roomId]; // Close room if empty
                } else {
                    room.message = `A player has disconnected.`;
                    // Add logic to handle game over if too few players, or re-assign host
                    if (room.hostId === socket.id) {
                        room.hostId = room.players[0].id;
                    }
                    io.to(roomId).emit('gameStateUpdate', room);
                }
                break;
            }
        }
    });
});

const PORT = 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));