import { beforeEach, describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { signDevJwt, JWT_HEADER } from "@adrianhall/cloudflare-auth";

async function authHeaders(email: string) {
  const token = await signDevJwt(email);
  return { [JWT_HEADER]: token };
}

async function createCharacter(email: string, name: string, gender = "Male") {
  return await SELF.fetch("https://example.com/api/player-characters", {
    method: "POST",
    headers: {
      ...(await authHeaders(email)),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name, gender })
  });
}

async function connectCharacter(email: string, characterName: string) {
  const response = await SELF.fetch(
    `https://example.com/api/game/connect?characterName=${encodeURIComponent(characterName)}`,
    {
      headers: {
        ...(await authHeaders(email)),
        Upgrade: "websocket"
      }
    }
  );

  expect(response.status).toBe(101);
  const ws = response.webSocket!;
  ws.accept();
  return ws;
}

async function ensurePlayerCharactersTable() {
  await env.MAP.batch([
    env.MAP.prepare(
      `CREATE TABLE IF NOT EXISTS playerCharacters (
        userEmail TEXT NOT NULL,
        name TEXT NOT NULL,
        gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Neutral')),
        lastUsed TEXT NOT NULL
      )`
    ),
    env.MAP.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_player_characters_name
       ON playerCharacters (name COLLATE NOCASE)`
    ),
    env.MAP.prepare(
      `CREATE INDEX IF NOT EXISTS idx_player_characters_user_last_used
       ON playerCharacters (userEmail, lastUsed DESC)`
    )
  ]);
}

async function ensureZone30WorldData() {
  await env.MAP.batch([
    env.MAP.prepare(
      `CREATE TABLE IF NOT EXISTS zones (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        builder TEXT NOT NULL DEFAULT '',
        min_vnum INTEGER NOT NULL,
        max_vnum INTEGER NOT NULL,
        lifespan INTEGER NOT NULL,
        reset_mode INTEGER NOT NULL,
        flags INTEGER NOT NULL DEFAULT 0
      )`
    ),
    env.MAP.prepare(
      `CREATE TABLE IF NOT EXISTS rooms (
        vnum INTEGER PRIMARY KEY,
        zone_id INTEGER NOT NULL REFERENCES zones(id),
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        flags INTEGER NOT NULL DEFAULT 0,
        sector_type INTEGER NOT NULL DEFAULT 0
      )`
    ),
    env.MAP.prepare(
      `CREATE TABLE IF NOT EXISTS exits (
        room_vnum INTEGER NOT NULL REFERENCES rooms(vnum),
        direction TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        keywords TEXT NOT NULL DEFAULT '[]',
        door_type INTEGER NOT NULL DEFAULT 0,
        key_vnum INTEGER NOT NULL DEFAULT -1,
        target_room INTEGER NOT NULL DEFAULT -1,
        PRIMARY KEY (room_vnum, direction)
      )`
    )
  ]);

  await env.MAP.batch([
    env.MAP.prepare(
      `INSERT OR IGNORE INTO zones (id, name, builder, min_vnum, max_vnum, lifespan, reset_mode, flags)
       VALUES (30, 'Northern Midgaard', 'Test', 3000, 3099, 15, 2, 8)`
    ),
    env.MAP.prepare(
      `INSERT OR IGNORE INTO zones (id, name, builder, min_vnum, max_vnum, lifespan, reset_mode, flags)
       VALUES (31, 'Southern Midgaard', 'Test', 3100, 3199, 30, 2, 8)`
    ),
    env.MAP.prepare(
      `INSERT OR IGNORE INTO rooms (vnum, zone_id, name, description, flags, sector_type)
       VALUES (3001, 30, 'The Temple Of Midgaard', 'The starting room.', 0, 0)`
    ),
    env.MAP.prepare(
      `INSERT OR IGNORE INTO rooms (vnum, zone_id, name, description, flags, sector_type)
       VALUES (3054, 30, 'The Altar', 'The northern room.', 0, 0)`
    ),
    env.MAP.prepare(
      `INSERT OR IGNORE INTO rooms (vnum, zone_id, name, description, flags, sector_type)
       VALUES (3100, 31, 'The Other Zone', 'A different zone.', 0, 0)`
    ),
    env.MAP.prepare(
      `INSERT OR IGNORE INTO exits (room_vnum, direction, description, keywords, door_type, key_vnum, target_room)
       VALUES (3001, 'NORTH', 'A northern exit.', '[]', 0, -1, 3054)`
    )
  ]);
}

describe("API routes", () => {
  beforeEach(async () => {
    await ensurePlayerCharactersTable();
    await ensureZone30WorldData();
    await env.MAP.prepare("DELETE FROM playerCharacters").run();
  });

  it("GET /api/version returns name and version (public)", async () => {
    const response = await SELF.fetch("https://example.com/api/version");
    expect(response.status).toBe(200);

    const data = (await response.json()) as { name: string; version: string };
    expect(data).toEqual({ name: "ServerlessMud", version: "0.0.1" });
  });

  it("GET /api/health is rejected without authentication", async () => {
    const response = await SELF.fetch("https://example.com/api/health", { redirect: "manual" });
    // Dev middleware redirects unauthenticated requests to login.
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/_auth/login");
  });

  it("GET /api/me returns user email and id when authenticated", async () => {
    const response = await SELF.fetch("https://example.com/api/me", {
      headers: await authHeaders("test@example.com")
    });
    expect(response.status).toBe(200);

    const data = (await response.json()) as { email: string; id: string };
    expect(data.email).toBe("test@example.com");
    expect(data.id).toBe("dev-test@example.com");
  });

  it("GET /api/health returns health status when authenticated", async () => {
    const response = await SELF.fetch("https://example.com/api/health", {
      headers: await authHeaders("test@example.com")
    });
    expect(response.status).toBe(200);

    const data = (await response.json()) as { status: string; timestamp: string };
    expect(data.status).toBe("ok");
    expect(data.timestamp).toBeTruthy();
  });

  it("POST /api/game/input returns 200 with valid input", async () => {
    const response = await SELF.fetch("https://example.com/api/game/input", {
      method: "POST",
      headers: {
        ...(await authHeaders("test@example.com")),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: "hello" })
    });
    expect(response.status).toBe(200);

    const data = (await response.json()) as { ok: boolean };
    expect(data).toEqual({ ok: true });
  });

  it("POST /api/game/input accepts movement commands", async () => {
    const response = await SELF.fetch("https://example.com/api/game/input", {
      method: "POST",
      headers: {
        ...(await authHeaders("test@example.com")),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: "go north" })
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok: boolean };
    expect(data).toEqual({ ok: true });
  });

  it("POST /api/game/input accepts an explicit zone id", async () => {
    const response = await SELF.fetch("https://example.com/api/game/input", {
      method: "POST",
      headers: {
        ...(await authHeaders("test@example.com")),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: "look", zoneId: 31 })
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok: boolean };
    expect(data).toEqual({ ok: true });
  });

  it("POST /api/game/input validates explicit zone ids", async () => {
    const response = await SELF.fetch("https://example.com/api/game/input", {
      method: "POST",
      headers: {
        ...(await authHeaders("test@example.com")),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: "look", zoneId: "31" })
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("zoneId must be a positive integer");
  });

  it("GET /api/game/rooms/:roomId returns room details", async () => {
    await createCharacter("test@example.com", "roomie");
    const ws = await connectCharacter("test@example.com", "Roomie");

    const response = await SELF.fetch("https://example.com/api/game/rooms/3001", {
      headers: await authHeaders("test@example.com")
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      vnum: number;
      name: string;
      exits: Array<{ direction: string; targetRoom: number }>;
      players: string[];
    };
    expect(data.vnum).toBe(3001);
    expect(data.name).toEqual(expect.any(String));
    expect(data.exits.some((exit) => exit.direction === "NORTH" && exit.targetRoom === 3054)).toBe(
      true
    );
    expect(data.players).toEqual([]);

    ws.close(1000, "done");
  });

  it("GET /api/game/rooms/:roomId validates the room id", async () => {
    const response = await SELF.fetch("https://example.com/api/game/rooms/not-a-number", {
      headers: await authHeaders("test@example.com")
    });

    expect(response.status).toBe(400);
  });

  it("GET /api/game/rooms/:roomId returns 404 for missing rooms", async () => {
    await createCharacter("test@example.com", "roomie");
    const ws = await connectCharacter("test@example.com", "Roomie");

    const response = await SELF.fetch("https://example.com/api/game/rooms/999999", {
      headers: await authHeaders("test@example.com")
    });

    expect(response.status).toBe(404);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Room not found");

    ws.close(1000, "done");
  });

  it("POST /api/game/input returns 400 with missing text", async () => {
    const response = await SELF.fetch("https://example.com/api/game/input", {
      method: "POST",
      headers: {
        ...(await authHeaders("test@example.com")),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });
    expect(response.status).toBe(400);
  });

  it("POST /api/game/input returns 400 with empty text", async () => {
    const response = await SELF.fetch("https://example.com/api/game/input", {
      method: "POST",
      headers: {
        ...(await authHeaders("test@example.com")),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: "" })
    });
    expect(response.status).toBe(400);
  });

  it("GET /api/game/connect returns 400 without upgrade header", async () => {
    const response = await SELF.fetch("https://example.com/api/game/connect", {
      headers: await authHeaders("test@example.com")
    });
    expect(response.status).toBe(400);

    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Expected WebSocket upgrade");
  });

  it("GET /api/game/connect requires a character name", async () => {
    const response = await SELF.fetch("https://example.com/api/game/connect", {
      headers: {
        ...(await authHeaders("test@example.com")),
        Upgrade: "websocket"
      }
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("characterName is required");
  });

  it("GET /api/game/connect rejects characters owned by another user", async () => {
    await createCharacter("owner@example.com", "owned1");

    const response = await SELF.fetch("https://example.com/api/game/connect?characterName=Owned1", {
      headers: {
        ...(await authHeaders("other@example.com")),
        Upgrade: "websocket"
      }
    });

    expect(response.status).toBe(404);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Character not found");
  });

  it("GET /api/game/connect upgrades to WebSocket when authenticated", async () => {
    await env.MAP.prepare(
      `INSERT INTO playerCharacters (userEmail, name, gender, lastUsed)
       VALUES (?, ?, ?, ?)`
    )
      .bind("alice@example.com", "Alice1", "Female", "2026-01-01T00:00:00.000Z")
      .run();

    const response = await SELF.fetch("https://example.com/api/game/connect?characterName=alice1", {
      headers: {
        ...(await authHeaders("alice@example.com")),
        Upgrade: "websocket"
      }
    });

    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();

    const character = await env.MAP.prepare(
      "SELECT lastUsed FROM playerCharacters WHERE name = ? COLLATE NOCASE"
    )
      .bind("Alice1")
      .first<{ lastUsed: string }>();
    expect(character?.lastUsed).not.toBe("2026-01-01T00:00:00.000Z");

    // Clean up the upgraded socket so the test does not leak.
    response.webSocket!.accept();
    response.webSocket!.close(1000, "test done");
  });

  it("GET /api/game/connect can target another zone room", async () => {
    await env.MAP.prepare(
      `INSERT INTO playerCharacters (userEmail, name, gender, lastUsed)
       VALUES (?, ?, ?, ?)`
    )
      .bind("alice@example.com", "Alice2", "Female", "2026-01-01T00:00:00.000Z")
      .run();

    const response = await SELF.fetch(
      "https://example.com/api/game/connect?characterName=alice2&zoneId=31&roomId=3100&fromRoomId=3001&direction=UP&mode=teleport",
      {
        headers: {
          ...(await authHeaders("alice@example.com")),
          Upgrade: "websocket"
        }
      }
    );

    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();

    response.webSocket!.accept();
    response.webSocket!.close(1000, "test done");
  });

  it("GET /api/game/connect validates transfer query values", async () => {
    await createCharacter("alice@example.com", "alice3");

    const response = await SELF.fetch(
      "https://example.com/api/game/connect?characterName=alice3&zoneId=31&roomId=3100&direction=sideways",
      {
        headers: {
          ...(await authHeaders("alice@example.com")),
          Upgrade: "websocket"
        }
      }
    );

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("direction is invalid");
  });

  it("GET /api/game/connect validates transfer modes", async () => {
    await createCharacter("alice@example.com", "alice5");

    const response = await SELF.fetch(
      "https://example.com/api/game/connect?characterName=alice5&zoneId=31&roomId=3100&mode=blink",
      {
        headers: {
          ...(await authHeaders("alice@example.com")),
          Upgrade: "websocket"
        }
      }
    );

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("mode is invalid");
  });

  it("GET /api/game/connect rejects mismatched zone and room targets", async () => {
    await createCharacter("alice@example.com", "alice4");

    const response = await SELF.fetch(
      "https://example.com/api/game/connect?characterName=alice4&zoneId=31&roomId=3001",
      {
        headers: {
          ...(await authHeaders("alice@example.com")),
          Upgrade: "websocket"
        }
      }
    );

    expect(response.status).toBe(404);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Room not found");
  });

  it("GET /api/player-characters lists characters by most recent use", async () => {
    await env.MAP.batch([
      env.MAP.prepare(
        `INSERT INTO playerCharacters (userEmail, name, gender, lastUsed)
         VALUES (?, ?, ?, ?)`
      ).bind("list@example.com", "Older1", "Male", "2026-01-01T00:00:00.000Z"),
      env.MAP.prepare(
        `INSERT INTO playerCharacters (userEmail, name, gender, lastUsed)
         VALUES (?, ?, ?, ?)`
      ).bind("list@example.com", "Newer1", "Neutral", "2026-01-02T00:00:00.000Z"),
      env.MAP.prepare(
        `INSERT INTO playerCharacters (userEmail, name, gender, lastUsed)
         VALUES (?, ?, ?, ?)`
      ).bind("other@example.com", "Other1", "Female", "2026-01-03T00:00:00.000Z")
    ]);

    const response = await SELF.fetch("https://example.com/api/player-characters", {
      headers: await authHeaders("list@example.com")
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { characters: Array<{ name: string }> };
    expect(data.characters.map((character) => character.name)).toEqual(["Newer1", "Older1"]);
  });

  it("GET /api/player-characters/availability validates name format", async () => {
    const response = await SELF.fetch(
      "https://example.com/api/player-characters/availability?name=ab",
      { headers: await authHeaders("test@example.com") }
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as { available: boolean; valid: boolean; reason: string };
    expect(data).toMatchObject({ available: false, valid: false, reason: "invalid_format" });
  });

  it("GET /api/player-characters/availability validates missing names", async () => {
    const response = await SELF.fetch("https://example.com/api/player-characters/availability", {
      headers: await authHeaders("test@example.com")
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { available: boolean; valid: boolean; reason: string };
    expect(data).toMatchObject({ available: false, valid: false, reason: "invalid_format" });
  });

  it("GET /api/player-characters/availability detects case-insensitive duplicates", async () => {
    await createCharacter("test@example.com", "dorian");

    const response = await SELF.fetch(
      "https://example.com/api/player-characters/availability?name=DORIAN",
      { headers: await authHeaders("other@example.com") }
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as { available: boolean; valid: boolean; reason: string };
    expect(data).toMatchObject({ available: false, valid: true, reason: "duplicate" });
  });

  it("GET /api/player-characters/availability returns normalized lowercase names", async () => {
    const response = await SELF.fetch(
      "https://example.com/api/player-characters/availability?name=dorian",
      { headers: await authHeaders("test@example.com") }
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as { available: boolean; normalizedName: string };
    expect(data).toMatchObject({ available: true, normalizedName: "Dorian" });
  });

  it("POST /api/player-characters creates and normalizes lowercase character names", async () => {
    const response = await createCharacter("test@example.com", "dorian", "Neutral");

    expect(response.status).toBe(201);
    const data = (await response.json()) as { character: { name: string; gender: string } };
    expect(data.character).toMatchObject({ name: "Dorian", gender: "Neutral" });
  });

  it("POST /api/player-characters preserves typed casing", async () => {
    const response = await createCharacter("test@example.com", "DoRiAn", "Female");

    expect(response.status).toBe(201);
    const data = (await response.json()) as { character: { name: string } };
    expect(data.character.name).toBe("DoRiAn");
  });

  it("POST /api/player-characters rejects missing name or gender", async () => {
    const response = await SELF.fetch("https://example.com/api/player-characters", {
      method: "POST",
      headers: {
        ...(await authHeaders("test@example.com")),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: "dorian" })
    });

    expect(response.status).toBe(400);
  });

  it("POST /api/player-characters rejects invalid JSON", async () => {
    const response = await SELF.fetch("https://example.com/api/player-characters", {
      method: "POST",
      headers: {
        ...(await authHeaders("test@example.com")),
        "Content-Type": "application/json"
      },
      body: "{"
    });

    expect(response.status).toBe(400);
  });

  it("POST /api/player-characters rejects invalid character names", async () => {
    const response = await createCharacter("test@example.com", "1dorian", "Male");

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("character name is invalid");
  });

  it("POST /api/player-characters rejects duplicate names globally", async () => {
    await createCharacter("owner@example.com", "dorian", "Male");

    const response = await createCharacter("other@example.com", "DORIAN", "Female");

    expect(response.status).toBe(409);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("character name is already taken");
  });

  it("POST /api/player-characters enforces the eight character limit per user", async () => {
    for (let i = 0; i < 8; i++) {
      const response = await createCharacter("max@example.com", `maxch${i}`, "Neutral");
      expect(response.status).toBe(201);
    }

    const response = await createCharacter("max@example.com", "maxch8", "Neutral");

    expect(response.status).toBe(409);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("maximum character count reached");
  });
});
