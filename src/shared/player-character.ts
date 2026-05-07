export const PLAYER_CHARACTER_NAME_PATTERN = /^[a-z][a-z0-9]{4,31}$/i;

export const PLAYER_CHARACTER_GENDERS = ["Male", "Female", "Neutral"] as const;

export type PlayerCharacterGender = (typeof PLAYER_CHARACTER_GENDERS)[number];

export interface PlayerCharacter {
  userEmail: string;
  name: string;
  gender: PlayerCharacterGender;
  lastUsed: string;
}

export function isValidCharacterName(name: string): boolean {
  return PLAYER_CHARACTER_NAME_PATTERN.test(name);
}

export function isPlayerCharacterGender(value: unknown): value is PlayerCharacterGender {
  return (
    typeof value === "string" && PLAYER_CHARACTER_GENDERS.includes(value as PlayerCharacterGender)
  );
}

export function normalizeCharacterName(name: string): string {
  if (name === name.toLowerCase()) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  return name;
}
