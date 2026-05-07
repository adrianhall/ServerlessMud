-- 0001_create_tables.sql
-- Idempotent schema for the MAP (world/zone) D1 database.

CREATE TABLE IF NOT EXISTS zones (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  builder       TEXT    NOT NULL DEFAULT '',
  min_vnum      INTEGER NOT NULL,
  max_vnum      INTEGER NOT NULL,
  lifespan      INTEGER NOT NULL,
  reset_mode    INTEGER NOT NULL,
  flags         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rooms (
  vnum          INTEGER PRIMARY KEY,
  zone_id       INTEGER NOT NULL REFERENCES zones(id),
  name          TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  flags         INTEGER NOT NULL DEFAULT 0,
  sector_type   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS exits (
  room_vnum     INTEGER NOT NULL REFERENCES rooms(vnum),
  direction     TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  keywords      TEXT    NOT NULL DEFAULT '[]',
  door_type     INTEGER NOT NULL DEFAULT 0,
  key_vnum      INTEGER NOT NULL DEFAULT -1,
  target_room   INTEGER NOT NULL DEFAULT -1,
  PRIMARY KEY (room_vnum, direction)
);

CREATE TABLE IF NOT EXISTS room_extra_descriptions (
  room_vnum     INTEGER NOT NULL REFERENCES rooms(vnum),
  keyword       TEXT    NOT NULL,
  description   TEXT    NOT NULL,
  PRIMARY KEY (room_vnum, keyword)
);

CREATE TABLE IF NOT EXISTS zone_commands (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id       INTEGER NOT NULL REFERENCES zones(id),
  sort_order    INTEGER NOT NULL,
  command       TEXT    NOT NULL,
  if_flag       INTEGER NOT NULL DEFAULT 0,
  arg1          INTEGER NOT NULL DEFAULT 0,
  arg2          INTEGER NOT NULL DEFAULT 0,
  arg3          INTEGER NOT NULL DEFAULT 0,
  arg4          INTEGER,
  sarg1         TEXT,
  sarg2         TEXT,
  comment       TEXT
);

CREATE TABLE IF NOT EXISTS room_triggers (
  room_vnum     INTEGER NOT NULL REFERENCES rooms(vnum),
  trigger_vnum  INTEGER NOT NULL,
  PRIMARY KEY (room_vnum, trigger_vnum)
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_rooms_zone   ON rooms(zone_id);
CREATE INDEX IF NOT EXISTS idx_exits_target ON exits(target_room);
CREATE INDEX IF NOT EXISTS idx_zcmd_zone    ON zone_commands(zone_id, sort_order);
