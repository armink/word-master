import db from './client'

export function initSchema() {
  db.exec(`
    -- ── 学习计划 ──────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS study_plans (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      wordbook_id  INTEGER NOT NULL REFERENCES wordbooks(id) ON DELETE CASCADE,
      daily_new    INTEGER NOT NULL DEFAULT 10,
      start_date   INTEGER NOT NULL,
      status       TEXT    NOT NULL CHECK(status IN ('active','paused','completed'))
                           DEFAULT 'active',
      created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(student_id, wordbook_id)
    );

    -- ── Session 内每个词条的独立测验类型 ──────────────────────────
    CREATE TABLE IF NOT EXISTS session_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
      item_id    INTEGER NOT NULL REFERENCES items(id)         ON DELETE CASCADE,
      quiz_type  TEXT    NOT NULL CHECK(quiz_type IN ('en_to_zh','zh_to_en','spelling')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(session_id, item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_study_plans_student   ON study_plans(student_id);
    CREATE INDEX IF NOT EXISTS idx_session_items_session ON session_items(session_id);
  `)

  // ── student_mastery 扩展列（幂等：列已存在则忽略）──────────────
  const masteryNewCols: [string, string][] = [
    ['introduced_date', 'INTEGER NOT NULL DEFAULT 0'],
    ['en_to_zh_stage',  'INTEGER NOT NULL DEFAULT 0'],
    ['zh_to_en_stage',  'INTEGER NOT NULL DEFAULT 0'],
    ['spelling_stage',  'INTEGER NOT NULL DEFAULT 0'],
    ['en_to_zh_next',   'INTEGER NOT NULL DEFAULT 0'],
    ['zh_to_en_next',   'INTEGER NOT NULL DEFAULT 0'],
    ['spelling_next',   'INTEGER NOT NULL DEFAULT 0'],
    // 错误权重：答错 +1（上限5），答对 ×0.6；用于压缩复习间隔
    ['error_weight',    'REAL NOT NULL DEFAULT 0'],
  ]
  for (const [col, def] of masteryNewCols) {
    try { db.exec(`ALTER TABLE student_mastery ADD COLUMN ${col} ${def}`) } catch { /* 列已存在 */ }
  }

  // ── study_plans 扩展列（幂等）────────────────────────────────────
  // remaining_days：用户设定的剩余计划天数（每次完成打卡自动 -1）
  // daily_peak   ：每日任务上限（复习 + 新词合计，默认 50）
  // completed_days：已完成打卡的天数（用于展示）
  // last_completed_date：上次完成打卡的 YYYYMMDD（防止同天重复计入）
  const planNewCols: [string, string][] = [
    ['remaining_days',      'INTEGER NOT NULL DEFAULT 30'],
    ['daily_peak',          'INTEGER NOT NULL DEFAULT 50'],
    ['completed_days',      'INTEGER NOT NULL DEFAULT 0'],
    ['last_completed_date', 'INTEGER NOT NULL DEFAULT 0'],
    // 学习目标层级：1=英译中，2=英译中+中译英，3=全三关含拼写（默认）
    ['target_level',        'INTEGER NOT NULL DEFAULT 3'],
  ]
  for (const [col, def] of planNewCols) {
    try { db.exec(`ALTER TABLE study_plans ADD COLUMN ${col} ${def}`) } catch { /* 列已存在 */ }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS wordbooks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT    NOT NULL CHECK(type IN ('word', 'phrase')),
      english     TEXT    NOT NULL,
      chinese     TEXT    NOT NULL,
      phonetic    TEXT,
      example_en  TEXT,
      example_zh  TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS wordbook_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      wordbook_id INTEGER NOT NULL REFERENCES wordbooks(id) ON DELETE CASCADE,
      item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      UNIQUE(wordbook_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS student_mastery (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      item_id          INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      en_to_zh_level   INTEGER NOT NULL DEFAULT 0,
      zh_to_en_level   INTEGER NOT NULL DEFAULT 0,
      spelling_level   INTEGER,
      last_reviewed_at INTEGER,
      updated_at       INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(student_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS quiz_sessions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      wordbook_id      INTEGER NOT NULL REFERENCES wordbooks(id) ON DELETE CASCADE,
      quiz_type        TEXT    NOT NULL CHECK(quiz_type IN ('en_to_zh', 'zh_to_en', 'spelling')),
      status           TEXT    NOT NULL CHECK(status IN ('in_progress', 'passed', 'abandoned'))
                               DEFAULT 'in_progress',
      total_words      INTEGER NOT NULL,
      pass_accuracy    REAL    NOT NULL DEFAULT 0.8,
      final_accuracy   REAL,
      duration_seconds INTEGER,
      started_at       INTEGER NOT NULL DEFAULT (unixepoch()),
      finished_at      INTEGER
    );

    CREATE TABLE IF NOT EXISTS quiz_answers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  INTEGER NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
      item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      attempt     INTEGER NOT NULL DEFAULT 1,
      user_answer TEXT    NOT NULL,
      is_correct  INTEGER NOT NULL CHECK(is_correct IN (0, 1)),
      duration_ms INTEGER NOT NULL DEFAULT 0,
      answered_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_wordbook_items_wordbook ON wordbook_items(wordbook_id);
    CREATE INDEX IF NOT EXISTS idx_wordbook_items_item     ON wordbook_items(item_id);
    CREATE INDEX IF NOT EXISTS idx_student_mastery_student ON student_mastery(student_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student   ON quiz_sessions(student_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_answers_session    ON quiz_answers(session_id);
  `)

  // ── 宠物系统 ──────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS pet_status (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id    INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
      hunger        INTEGER NOT NULL DEFAULT 80,
      streak_days   INTEGER NOT NULL DEFAULT 0,
      last_fed_date INTEGER NOT NULL DEFAULT 0,
      shield_count  INTEGER NOT NULL DEFAULT 0,
      snack_count   INTEGER NOT NULL DEFAULT 3,
      total_fed     INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  // pet_status 扩展列（幂等）
  const petNewCols: [string, string][] = [
    ['coins',           'INTEGER NOT NULL DEFAULT 0'],
    ['mood_boost',      'INTEGER NOT NULL DEFAULT 0'],
    ['last_game_date',  'INTEGER NOT NULL DEFAULT 0'],
  ]
  for (const [col, def] of petNewCols) {
    try { db.exec(`ALTER TABLE pet_status ADD COLUMN ${col} ${def}`) } catch { /* 列已存在 */ }
  }

  console.log('数据库表结构初始化完成')

  // ── items 扩展列（幂等，必须在 CREATE TABLE items 之后）────────────
  // example_status: pending=待生成 / generating=生成中 / done=已完成 / failed=失败
  const itemsNewCols: [string, string][] = [
    ['example_status', "TEXT NOT NULL DEFAULT 'pending'"],
  ]
  for (const [col, def] of itemsNewCols) {
    try {
      db.exec(`ALTER TABLE items ADD COLUMN ${col} ${def}`)
    } catch { /* 列已存在，忽略 */ }
  }
  // 已有例句的条目直接标记为 done，避免重复生成
  db.exec(`UPDATE items SET example_status = 'done' WHERE example_en IS NOT NULL AND example_status = 'pending'`)
}
