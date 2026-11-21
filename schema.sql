-- Turncoat: multi-day hidden-role game for group chats. No accounts; a player is a nickname + secret token.
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tz TEXT NOT NULL DEFAULT 'UTC',
  pace TEXT NOT NULL DEFAULT 'daily',
  vote_hour INTEGER NOT NULL DEFAULT 20,
  morning_hour INTEGER NOT NULL DEFAULT 8,
  state TEXT NOT NULL DEFAULT 'lobby',      -- lobby | night | day | over
  day INTEGER NOT NULL DEFAULT 0,
  phase_ends_at INTEGER,
  host_id INTEGER,
  winner TEXT,
  next_id TEXT,                              -- set by "Play again"
  created_at INTEGER NOT NULL,
  active_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  role TEXT,                                 -- turncoat | loyal, set at start, never sent to other players before the end
  alive INTEGER NOT NULL DEFAULT 1,
  out_day INTEGER,
  out_how TEXT,                              -- murder | banish
  joined_at INTEGER NOT NULL,
  UNIQUE (game_id, token_hash)
);
CREATE INDEX IF NOT EXISTS players_game ON players(game_id);
CREATE TABLE IF NOT EXISTS votes (
  game_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  phase TEXT NOT NULL,                       -- night | day
  voter_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (game_id, day, phase, voter_id)
);
-- Public timeline: what everyone in the game may see.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_game ON events(game_id);
-- Turncoats-only chat.
CREATE TABLE IF NOT EXISTS chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_game ON chat(game_id);
CREATE TABLE IF NOT EXISTS rate (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
