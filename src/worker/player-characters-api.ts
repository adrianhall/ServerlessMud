import { Hono } from "hono";
import type { AuthVariables } from "@lib/cloudflare-auth";
import {
  isPlayerCharacterGender,
  isValidCharacterName,
  normalizeCharacterName,
  type PlayerCharacter
} from "../shared/player-character";

const MAX_CHARACTERS_PER_USER = 8;

const playerCharactersApi = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

interface CharacterAvailability {
  available: boolean;
  valid: boolean;
  normalizedName: string | null;
  reason: string | null;
}

interface CreateCharacterPayload {
  name?: unknown;
  gender?: unknown;
}

async function findCharacterByName(map: D1Database, name: string): Promise<PlayerCharacter | null> {
  return await map
    .prepare(
      `SELECT userEmail, name, gender, lastUsed
       FROM playerCharacters
       WHERE name = ? COLLATE NOCASE`
    )
    .bind(name)
    .first<PlayerCharacter>();
}

export async function findCharacterForUser(
  map: D1Database,
  userEmail: string,
  name: string
): Promise<PlayerCharacter | null> {
  return await map
    .prepare(
      `SELECT userEmail, name, gender, lastUsed
       FROM playerCharacters
       WHERE userEmail = ? AND name = ? COLLATE NOCASE`
    )
    .bind(userEmail, name)
    .first<PlayerCharacter>();
}

export async function updateCharacterLastUsed(
  map: D1Database,
  userEmail: string,
  name: string,
  lastUsed: string
): Promise<void> {
  await map
    .prepare(
      `UPDATE playerCharacters
       SET lastUsed = ?
       WHERE userEmail = ? AND name = ? COLLATE NOCASE`
    )
    .bind(lastUsed, userEmail, name)
    .run();
}

async function getCharacterCountForUser(map: D1Database, userEmail: string): Promise<number> {
  const result = await map
    .prepare("SELECT COUNT(*) AS count FROM playerCharacters WHERE userEmail = ?")
    .bind(userEmail)
    .first<{ count: number }>();
  /* istanbul ignore next -- @preserve SELECT COUNT(*) always returns one row; fallback protects mocked D1 behavior. */
  return result?.count ?? 0;
}

async function getAvailability(
  map: D1Database,
  rawName: string | null
): Promise<CharacterAvailability> {
  const name = rawName?.trim() ?? "";

  if (!isValidCharacterName(name)) {
    return { available: false, valid: false, normalizedName: null, reason: "invalid_format" };
  }

  const normalizedName = normalizeCharacterName(name);
  const existing = await findCharacterByName(map, normalizedName);
  if (existing) {
    return { available: false, valid: true, normalizedName, reason: "duplicate" };
  }

  return { available: true, valid: true, normalizedName, reason: null };
}

playerCharactersApi.get("/", async (c) => {
  const userEmail = c.get("userEmail");
  const { results } = await c.env.MAP.prepare(
    `SELECT userEmail, name, gender, lastUsed
     FROM playerCharacters
     WHERE userEmail = ?
     ORDER BY lastUsed DESC, name COLLATE NOCASE ASC`
  )
    .bind(userEmail)
    .all<PlayerCharacter>();

  return c.json({ characters: results });
});

playerCharactersApi.get("/availability", async (c) => {
  const availability = await getAvailability(c.env.MAP, c.req.query("name") ?? null);
  return c.json(availability);
});

playerCharactersApi.post("/", async (c) => {
  const userEmail = c.get("userEmail");
  const body = await c.req.json<CreateCharacterPayload>().catch(() => null);

  if (!body || typeof body.name !== "string" || !isPlayerCharacterGender(body.gender)) {
    return c.json({ error: "name and gender are required" }, 400);
  }

  const availability = await getAvailability(c.env.MAP, body.name);
  if (!availability.valid) {
    return c.json({ error: "character name is invalid" }, 400);
  }
  if (!availability.available || !availability.normalizedName) {
    return c.json({ error: "character name is already taken" }, 409);
  }

  const characterCount = await getCharacterCountForUser(c.env.MAP, userEmail);
  if (characterCount >= MAX_CHARACTERS_PER_USER) {
    return c.json({ error: "maximum character count reached" }, 409);
  }

  const character: PlayerCharacter = {
    userEmail,
    name: availability.normalizedName,
    gender: body.gender,
    lastUsed: new Date().toISOString()
  };

  try {
    await c.env.MAP.prepare(
      `INSERT INTO playerCharacters (userEmail, name, gender, lastUsed)
       VALUES (?, ?, ?, ?)`
    )
      .bind(character.userEmail, character.name, character.gender, character.lastUsed)
      .run();
  } catch {
    return c.json({ error: "character name is already taken" }, 409);
  }

  return c.json({ character }, 201);
});

export { playerCharactersApi, MAX_CHARACTERS_PER_USER };
