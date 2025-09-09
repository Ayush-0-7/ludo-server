import http from "http";
import express from "express";
import { Server } from "socket.io";
import cors from "cors";
import db from "./firebaseConfig.js";

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
app.get("/", (req, res) => {
  res.send(
    "<h1>Hello World!</h1><p>This is content from your Express app.</p>"
  );
});
const gameListeners = {};

const setupGameListener = (roomId) => {
  // ... (This function remains the same)
  const gameRef = db.collection("games").doc(roomId);
  if (gameListeners[roomId]) {
    gameListeners[roomId]();
  }
  gameListeners[roomId] = gameRef.onSnapshot(
    (doc) => {
      if (doc.exists) {
        const gameState = doc.data();
        io.to(roomId).emit("gameStateUpdate", gameState);
      } else {
        // If the document is deleted, stop the listener
        if (gameListeners[roomId]) {
          gameListeners[roomId]();
          delete gameListeners[roomId];
        }
      }
    },
    (err) => {
      console.log(`Encountered error: ${err}`);
    }
  );
};

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // createGame, joinGame, startGame, rollDice, makeMove, reconnectGame events remain the same...

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
    if (room.players.some((p) => p.userId === userId)) {
      // This is a soft reconnect for someone already in the lobby
      socket.join(roomId);
      if (!gameListeners[roomId]) setupGameListener(roomId);
      return;
    }
    socket.join(roomId);
    const playerColor = COLORS[room.players.length];
    const newPlayer = initialPlayer(playerColor, playerName, socket.id, userId);
    await gameRef.update({
      players: [...room.players, newPlayer],
      message: `${playerName} has joined the game.`,
    });
    if (!gameListeners[roomId]) setupGameListener(roomId);
  });

  socket.on("startGame", async ({ roomId, userId }) => {
    const gameRef = db.collection("games").doc(roomId);
    const doc = await gameRef.get();
    if (!doc.exists) return;
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
    const player = room.players.find((p) => p.userId === userId);
    if (
      !room ||
      room.status !== "playing" ||
      room.players[room.activeIdx].userId !== userId
    )
      return;

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
        const updatedDoc = await gameRef.get();
        if (!updatedDoc.exists) return;
        const updatedRoom = updatedDoc.data();
        updatedRoom.message = `${updatedRoom.players[nextIdx].name}'s turn to roll.`;
        await gameRef.set(updatedRoom);
      }, 1500);
    } else {
      const possibleMoves = legalMovesForPlayer(
        room.players[room.activeIdx],
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
          const updatedDoc = await gameRef.get();
          if (!updatedDoc.exists) return;
          const updatedRoom = updatedDoc.data();
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
    if (
      !room ||
      room.status !== "playing" ||
      room.players[room.activeIdx].userId !== userId
    )
      return;
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
      updatedGame.extraTurn = false; // Reset extraTurn flag
      updatedGame.message = `${updatedGame.players[nextIdx].name}'s turn to roll.`;
    }
    await gameRef.set(updatedGame);
  });

  socket.on("reconnectGame", async ({ roomId, userId }) => {
    const gameRef = db.collection("games").doc(roomId);
    const doc = await gameRef.get();
    if (!doc.exists) {
      return socket.emit("error", "The game you were in has ended.");
    }
    socket.join(roomId);
    let room = doc.data();
    const playerIndex = room.players.findIndex((p) => p.userId === userId);
    if (playerIndex !== -1) {
      room.players[playerIndex].disconnected = false;
      room.players[playerIndex].id = socket.id;
      await gameRef.update({
        players: room.players,
        message: `${room.players[playerIndex].name} reconnected.`,
      });
    }
    setupGameListener(roomId);
  });

  // --- NEW: Handle a user explicitly leaving a game ---
  socket.on("leaveGame", async ({ roomId, userId }) => {
    const gameRef = db.collection("games").doc(roomId);
    const doc = await gameRef.get();
    if (!doc.exists) return;

    let room = doc.data();
    const playerIndex = room.players.findIndex((p) => p.userId === userId);

    if (playerIndex !== -1) {
      // Mark the player as disconnected
      room.players[playerIndex].disconnected = true;

      // If the host leaves, assign a new host
      if (room.hostId === userId) {
        const newHost = room.players.find((p) => !p.disconnected);
        room.hostId = newHost ? newHost.userId : null;
      }

      room.message = `${room.players[playerIndex].name} has left the game.`;

      const winner = getWinner(room);
      if (winner) {
        room.winner = winner;
        room.status = "finished";
        room.message = `${winner.name} wins as the last player remaining!`;
      } else if (!room.hostId) {
        // If no new host could be found (everyone left), delete the game.
        await gameRef.delete();
        return;
      }

      await gameRef.set(room);
    }
  });

  socket.on("disconnect", async () => {
    // ... (disconnect logic can remain the same)
    // It's good to have both `leaveGame` and `disconnect` for robustness.
    // `leaveGame` is for explicit actions, `disconnect` is for unexpected closures.
  });
});

const PORT =4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
