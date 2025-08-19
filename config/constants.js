// --- Utility helpers ---
export const range = (n) => [...Array(n).keys()];
export const COLORS = ["red", "green", "yellow", "blue"]; // Player order
export const COLOR_CLASSES = {
  red: { bg: "bg-red-500", text: "text-red-500", fill: "fill-red-500", stroke: "stroke-red-700" },
  green: { bg: "bg-green-500", text: "text-green-500", fill: "fill-green-500", stroke: "stroke-green-700" },
  yellow: { bg: "bg-yellow-400", text: "text-yellow-400", fill: "fill-yellow-400", stroke: "stroke-yellow-600" },
  blue: { bg: "bg-blue-500", text: "text-blue-500", fill: "fill-blue-500", stroke: "stroke-blue-700" },
};

// --- Ludo Constants ---
export const CELL_SIZE = 40;
export const BOARD_SIZE = 15 * CELL_SIZE;
export const TOKENS_PER_PLAYER = 4;
export const TRACK_LEN = 52;
export const HOME_LEN = 6;

// --- Board Geometry & Path Definitions ---
export const TRACK_PATH = [
  { r: 6, c: 0 } ,{ r: 6, c: 1 }, { r: 6, c: 2 }, { r: 6, c: 3 }, { r: 6, c: 4 }, { r: 6, c: 5 },
  { r: 5, c: 6 }, { r: 4, c: 6 }, { r: 3, c: 6 }, { r: 2, c: 6 }, { r: 1, c: 6 }, { r: 0, c: 6 },
  { r: 0, c: 7 },
  { r: 0, c: 8 }, { r: 1, c: 8 }, { r: 2, c: 8 }, { r: 3, c: 8 }, { r: 4, c: 8 }, { r: 5, c: 8 },
  { r: 6, c: 9 }, { r: 6, c: 10 }, { r: 6, c: 11 }, { r: 6, c: 12 }, { r: 6, c: 13 }, { r: 6, c: 14 },
  { r: 7, c: 14 },
  { r: 8, c: 14 }, { r: 8, c: 13 }, { r: 8, c: 12 }, { r: 8, c: 11 }, { r: 8, c: 10 }, { r: 8, c: 9 },
  { r: 9, c: 8 }, { r: 10, c: 8 }, { r: 11, c: 8 }, { r: 12, c: 8 }, { r: 13, c: 8 }, { r: 14, c: 8 },
  { r: 14, c: 7 },
  { r: 14, c: 6 }, { r: 13, c: 6 }, { r: 12, c: 6 }, { r: 11, c: 6 }, { r: 10, c: 6 }, { r: 9, c: 6 },
  { r: 8, c: 5 }, { r: 8, c: 4 }, { r: 8, c: 3 }, { r: 8, c: 2 }, { r: 8, c: 1 }, { r: 8, c: 0 },
  { r: 7, c: 0 },
];

export const ENTRY_INDEX = { red: 1, green: 14, yellow: 27, blue: 40 };
export const HOME_ENTRY_INDEX = { red: 51, green: 12, yellow: 25, blue: 38 };
export const SAFE_INDICES = new Set([1, 9, 14, 22, 27, 35, 40, 48]);

export const HOME_LANE_PATHS = {
  red: range(HOME_LEN + 1).map(i => ({ r: 7, c: 1 + i })),
  green: range(HOME_LEN + 1).map(i => ({ r: 1 + i, c: 7 })),
  yellow: range(HOME_LEN + 1).map(i => ({ r: 7, c: 13 - i })),
  blue: range(HOME_LEN + 1).map(i => ({ r: 13 - i, c: 7 })),
};

export const BASE_PADS = {
  red: [{ r: 2, c: 2 }, { r: 2, c: 3 }, { r: 3, c: 2 }, { r: 3, c: 3 }],
  green: [{ r: 2, c: 11 }, { r: 2, c: 12 }, { r: 3, c: 11 }, { r: 3, c: 12 }],
  yellow: [{ r: 11, c: 11 }, { r: 11, c: 12 }, { r: 12, c: 11 }, { r: 12, c: 12 }],
  blue: [{ r: 11, c: 2 }, { r: 11, c: 3 }, { r: 12, c: 2 }, { r: 12, c: 3 }],
};