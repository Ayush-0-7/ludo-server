// Note: Node.js uses CommonJS modules by default. We'll use a simple import/export syntax
// that works with ES Modules, which we'll enable in the server.
import { range, TOKENS_PER_PLAYER, TRACK_LEN, HOME_LEN, ENTRY_INDEX, HOME_ENTRY_INDEX, SAFE_INDICES } from "../config/constants.js";

export const initialPlayer = (color, name = "Player", id) => ({
  id,
  color,
  name,
  tokens: range(TOKENS_PER_PLAYER).map(() => ({
    state: "base",
    pos: null,
    relSteps: 0,
  })),
  finished: 0,
});

export function mod(a, n) {
  return ((a % n) + n) % n;
}

function isSafeIndex(idx) {
  return SAFE_INDICES.has(idx);
}

function absoluteTrackIndex(color, relSteps) {
  return mod(ENTRY_INDEX[color] + relSteps, TRACK_LEN);
}

export function legalMovesForPlayer(player, players, dice) {
  const moves = [];
  const { color, tokens } = player;
  const homeEntryRelSteps = mod(HOME_ENTRY_INDEX[color] - ENTRY_INDEX[color], TRACK_LEN) + 1;

  tokens.forEach((t, idx) => {
    if (t.state === "base") {
      if (dice === 6) {
        const entryAbs = ENTRY_INDEX[color];
        const isBlockedByOpponent = players.some(
          (p) => p.color !== color && p.tokens.some((otherToken) => otherToken.state === "track" && otherToken.pos === entryAbs)
        );
        if (!isBlockedByOpponent) {
          moves.push({ token: idx, type: "enter" });
        }
      }
    } else if (t.state === "track") {
      const nextRel = t.relSteps + dice;
      if (nextRel < homeEntryRelSteps) {
        const toAbs = absoluteTrackIndex(color, nextRel);
        const isBlockedBySelf = tokens.some(
            (otherToken) => otherToken.state === "track" && otherToken.pos === toAbs
        );
        if (!isBlockedBySelf) {
          moves.push({ token: idx, type: "advance", to: toAbs, nextRelSteps: nextRel });
        }
      } else {
        const homeLanePos = nextRel - homeEntryRelSteps;
        if (homeLanePos < HOME_LEN) {
          const isBlockedBySelf = tokens.some(
              (otherToken) => otherToken.state === "home" && otherToken.pos === homeLanePos
          );
          if(!isBlockedBySelf) {
            moves.push({ token: idx, type: "home-lane", laneTo: homeLanePos });
          }
        } else if (homeLanePos === HOME_LEN) {
          moves.push({ token: idx, type: "finish" });
        }
      }
    } else if (t.state === "home") {
      const to = t.pos + dice;
      if (to < HOME_LEN) {
        const isBlockedBySelf = tokens.some(
            (otherToken) => otherToken.state === "home" && otherToken.pos === to
        );
        if(!isBlockedBySelf) {
          moves.push({ token: idx, type: "home-advance", laneTo: to });
        }
      } else if (to === HOME_LEN) {
        moves.push({ token: idx, type: "finish" });
      }
    }
  });
  return moves;
}

export function applyMove(game, pIdx, move) {
  const g = JSON.parse(JSON.stringify(game)); // Deep copy
  const player = g.players[pIdx];
  const token = player.tokens[move.token];

  const captureIfAny = (absIndex) => {
    if (isSafeIndex(absIndex)) return false;
    let captured = false;
    g.players.forEach((op) => {
      if (op.color === player.color) return;
      op.tokens.forEach((ot) => {
        if (ot.state === "track" && ot.pos === absIndex) {
          ot.state = "base"; ot.pos = null; ot.relSteps = 0;
          captured = true;
        }
      });
    });
    return captured;
  };

  let capturedOnMove = false;
  if (move.type === "enter") {
    token.state = "track"; token.pos = ENTRY_INDEX[player.color]; token.relSteps = 0;
    capturedOnMove = captureIfAny(token.pos);
  } else if (move.type === "advance") {
    token.pos = move.to; token.relSteps = move.nextRelSteps;
    capturedOnMove = captureIfAny(token.pos);
  } else if (move.type === "home-lane") {
    token.state = "home"; token.pos = move.laneTo;
  } else if (move.type === "home-advance") {
    token.pos = move.laneTo;
  } else if (move.type === "finish") {
    token.state = "done"; token.pos = HOME_LEN; player.finished += 1;
  }

  const rolledSix = g.diceValue === 6;
  g.extraTurn = rolledSix || capturedOnMove;
  g.winner = getWinner(g);

  return g;
}

export function nextActivePlayerIdx(game, current) {
  if (game.extraTurn) return current;
  for (let i = 1; i <= game.players.length; i++) {
    const nextIdx = (current + i) % game.players.length;
    if (game.players[nextIdx].finished < TOKENS_PER_PLAYER) return nextIdx;
  }
  return current;
}

export function getWinner(game) {
    const finishedPlayers = game.players.filter(p => p.finished === TOKENS_PER_PLAYER);
    return finishedPlayers.length > 0 ? finishedPlayers[0] : null;
}