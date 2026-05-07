export const DIRECTIONS = [
  "NORTH",
  "EAST",
  "SOUTH",
  "WEST",
  "UP",
  "DOWN",
  "NORTHWEST",
  "NORTHEAST",
  "SOUTHEAST",
  "SOUTHWEST"
] as const;

export type Direction = (typeof DIRECTIONS)[number];

const DIRECTION_ALIASES = new Map<string, Direction>([
  ["n", "NORTH"],
  ["north", "NORTH"],
  ["e", "EAST"],
  ["east", "EAST"],
  ["s", "SOUTH"],
  ["south", "SOUTH"],
  ["w", "WEST"],
  ["west", "WEST"],
  ["u", "UP"],
  ["up", "UP"],
  ["d", "DOWN"],
  ["down", "DOWN"],
  ["nw", "NORTHWEST"],
  ["northwest", "NORTHWEST"],
  ["ne", "NORTHEAST"],
  ["northeast", "NORTHEAST"],
  ["se", "SOUTHEAST"],
  ["southeast", "SOUTHEAST"],
  ["sw", "SOUTHWEST"],
  ["southwest", "SOUTHWEST"]
]);

const OPPOSITE_DIRECTIONS: Record<Direction, Direction> = {
  NORTH: "SOUTH",
  EAST: "WEST",
  SOUTH: "NORTH",
  WEST: "EAST",
  UP: "DOWN",
  DOWN: "UP",
  NORTHWEST: "SOUTHEAST",
  NORTHEAST: "SOUTHWEST",
  SOUTHEAST: "NORTHWEST",
  SOUTHWEST: "NORTHEAST"
};

export function parseDirection(value: string): Direction | null {
  return DIRECTION_ALIASES.get(value.trim().toLowerCase()) ?? null;
}

export function parseMovementCommand(text: string): Direction | null {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    return parseDirection(words[0]);
  }

  if (words.length === 2 && words[0] === "go") {
    return parseDirection(words[1]);
  }

  return null;
}

export function oppositeDirection(direction: Direction): Direction {
  return OPPOSITE_DIRECTIONS[direction];
}
