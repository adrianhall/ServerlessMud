-- 0003_create_player_characters.sql
-- Player-owned characters stored in the MAP D1 database.

CREATE TABLE IF NOT EXISTS playerCharacters (
  userEmail     TEXT NOT NULL,
  name          TEXT NOT NULL,
  gender        TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Neutral')),
  lastUsed      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_characters_name
  ON playerCharacters (name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_player_characters_user_last_used
  ON playerCharacters (userEmail, lastUsed DESC);
