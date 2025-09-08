import http from "http";
import express from "express";
import { Server } from "socket.io";
import cors from "cors";
import db from "./firebaseConfig.js"; // Import Firestore instance

import { COLORS } from "./config/constants.js";
import {
  initialPlayer,
  legalMovesForPlayer,
  applyMove,
  nextActivePlayerIdx,
  getWinner,
} from "./logic/gameLogic.js";

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const gameListeners = {}; // Store Firestore listeners

const setupGameListener = (roomId) => {
  const gameRef = db.collection("games").doc(roomId);

  // Unsubscribe from any existing listener for this room
  if (gameListeners[roomId]) {
    gameListeners[roomId]();
  }

  gameListeners[roomId] = gameRef.onSnapshot(
    (doc) => {
      if (doc.exists) {
        const gameState = doc.data();
        io.to(roomId).emit("gameStateUpdate", gameState);
      }
    },
    (err) => {
      console.log(`Encountered error: ${err}`);
    }
  );
};

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  socket.on("createGame", async ({ playerName, userId }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.join(roomId);

    const player = initialPlayer(COLORS[0], playerName, socket.id, userId);

    const newGame = {
      roomId,
      players: [player],
      hostId: userId,
      status: "lobby",
      diceValue: null,
      activeIdx: 0,
      sixChain: 0,
      extraTurn: false,
      winner: null,
      message: `${playerName} created the game. Waiting for players...`,
    };

    await db.collection("games").doc(roomId).set(newGame);
    setupGameListener(roomId);
  });

  socket.on("joinGame", async ({ roomId, playerName, userId }) => {
    const gameRef = db.collection("games").doc(roomId);
    const doc = await gameRef.get();

    if (!doc.exists) return socket.emit("error", "Room not found.");

    const room = doc.data();
    if (room.players.length >= 4) return socket.emit("error", "Room is full.");
    if (room.status !== "lobby")
      return socket.emit("error", "Game has already started.");
    if (room.players.some((p) => p.userId === userId))
      return socket.emit("error", "You are already in this game.");

    socket.join(roomId);
    const playerColor = COLORS[room.players.length];
    const newPlayer = initialPlayer(playerColor, playerName, socket.id, userId);

    await gameRef.update({
      players: [...room.players, newPlayer],
      message: `${playerName} has joined the game.`,
    });

    // Ensure listener is active for the joining player
    if (!gameListeners[roomId]) {
      setupGameListener(roomId);
    }
  });

  socket.on("startGame", async ({ roomId, userId }) => {
    const gameRef = db.collection("games").doc(roomId);
    const doc = await gameRef.get();
    const room = doc.data();

    if (room && room.hostId === userId) {
      await gameRef.update({
        status: "playing",
        message: `Game started! ${room.players[0].name}'s turn to roll.`,
      });
    }
  });

  socket.on("rollDice", async ({ roomId, userId }) => {
    const gameRef = db.collection("games").doc(roomId);
    const doc = await gameRef.get();
    if (!doc.exists) return;

    let room = doc.data();
    const player = room.players[room.activeIdx];
    if (!room || room.status !== "playing" || player.userId !== userId) return;

    const diceValue = Math.floor(Math.random() * 6) + 1;
    room.diceValue = diceValue;

    const newSixChain = diceValue === 6 ? room.sixChain + 1 : 0;
    room.sixChain = newSixChain;

    if (newSixChain === 3) {
      room.message = `${player.name} rolled three 6s. Turn forfeited!`;
      const nextIdx = nextActivePlayerIdx(room, room.activeIdx);
      room.activeIdx = nextIdx;
      room.diceValue = null;
      room.sixChain = 0;
      room.extraTurn = false;
      await gameRef.set(room);
      setTimeout(async () => {
        const updatedRoom = (await gameRef.get()).data();
        updatedRoom.message = `${updatedRoom.players[nextIdx].name}'s turn to roll.`;
        await gameRef.set(updatedRoom);
      }, 1500);
    } else {
      const possibleMoves = legalMovesForPlayer(
        player,
        room.players,
        diceValue
      );
      if (possibleMoves.length === 0) {
        room.message = `${player.name} rolled a ${diceValue} but has no moves.`;
        const extra = diceValue === 6;
        const nextIdx = extra
          ? room.activeIdx
          : nextActivePlayerIdx(room, room.activeIdx);
        await gameRef.set(room);
        setTimeout(async () => {
          const updatedRoom = (await gameRef.get()).data();
          updatedRoom.activeIdx = nextIdx;
          updatedRoom.diceValue = null;
          updatedRoom.sixChain = extra ? updatedRoom.sixChain : 0;
          updatedRoom.extraTurn = false;
          updatedRoom.message = `${updatedRoom.players[nextIdx].name}'s turn to roll.`;
          await gameRef.set(updatedRoom);
        }, 1500);
      } else {
        room.message = `${player.name} rolled a ${diceValue}. Select a token to move.`;
        await gameRef.set(room);
      }
    }
  });

  socket.on("makeMove", async ({ roomId, move, userId }) => {
    const gameRef = db.collection("games").doc(roomId);
    const doc = await gameRef.get();
    if (!doc.exists) return;

    let room = doc.data();
    const player = room.players[room.activeIdx];
    if (!room || room.status !== "playing" || player.userId !== userId) return;

    let updatedGame = applyMove(room, room.activeIdx, move);

    const winner = getWinner(updatedGame);
    if (winner) {
      updatedGame.winner = winner;
      updatedGame.status = "finished";
      updatedGame.message = `${winner.name} has won the game!`;
    } else {
      const nextIdx = nextActivePlayerIdx(updatedGame, updatedGame.activeIdx);
      updatedGame.activeIdx = nextIdx;
      updatedGame.diceValue = null;
      updatedGame.sixChain = updatedGame.extraTurn ? updatedGame.sixChain : 0;
      updatedGame.message = `${updatedGame.players[nextIdx].name}'s turn to roll.`;
    }

    await gameRef.set(updatedGame);
  });

  socket.on("reconnectGame", async ({ roomId, userId }) => {
    const gameRef = db.collection("games").doc(roomId);
    const doc = await gameRef.get();
    if (!doc.exists) return; // Game may have ended

    socket.join(roomId);
    let room = doc.data();
    const playerIndex = room.players.findIndex((p) => p.userId === userId);

    if (playerIndex !== -1) {
      room.players[playerIndex].disconnected = false;
      room.players[playerIndex].id = socket.id; // Update to new socket.id
      await gameRef.update({ players: room.players });
    }
    setupGameListener(roomId); // Ensure listener is running
  });

  socket.on("disconnect", async () => {
    console.log(`User Disconnected: ${socket.id}`);
    // Find which game the socket was in
    const gamesRef = db.collection("games");
    const snapshot = await gamesRef
      .where("players", "array-contains", { id: socket.id })
      .get();

    if (snapshot.empty) {
      // This logic needs to be improved. A better way is to query by a field that has socket.id.
      // For now, we will rely on a full scan for simplicity, but this is not scalable.
      const allGamesSnapshot = await gamesRef
        .where("status", "==", "playing")
        .get();
      allGamesSnapshot.forEach(async (doc) => {
        let room = doc.data();
        const playerIndex = room.players.findIndex((p) => p.id === socket.id);
        if (playerIndex !== -1) {
          room.players[playerIndex].disconnected = true;
          await doc.ref.update({
            players: room.players,
            message: `${room.players[playerIndex].name} has disconnected.`,
          });

          // Check if the game should end
          const winner = getWinner(room);
          if (winner) {
            room.winner = winner;
            room.status = "finished";
            room.message = `${winner.name} has won as the last player remaining!`;
            await doc.ref.update(room);
          }
        }
      });
      return;
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
