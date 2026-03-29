# 数据库表结构设计

## 表关系

```
students (学生)
  └── quiz_sessions (测验会话)
        └── quiz_answers (答题明细)

wordbooks (单词本)
  └── wordbook_items (映射) ──── items (词条：单词/短语)
                                    └── student_mastery (学生掌握度)
```

## 掌握度更新规则

- 答对 +10，答错 -5，范围 0-100，初始值 0
- 三个测验阶段（英译中 / 中译英 / 拼写）分别独立记录
- 达到 80 分视为"已掌握"

---

## SQL 建表语句

```sql
-- 学生表
CREATE TABLE IF NOT EXISTS students (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 单词本表
CREATE TABLE IF NOT EXISTS wordbooks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 词条表（单词 + 短语统一）
CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT    NOT NULL CHECK(type IN ('word', 'phrase')),
  english     TEXT    NOT NULL,
  chinese     TEXT    NOT NULL,
  phonetic    TEXT,                  -- 仅单词有音标，短语为 NULL
  example_en  TEXT,                  -- AI 导入时生成
  example_zh  TEXT,                  -- AI 导入时生成
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 单词本与词条的多对多映射
CREATE TABLE IF NOT EXISTS wordbook_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wordbook_id INTEGER NOT NULL REFERENCES wordbooks(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(wordbook_id, item_id)
);

-- 学生词条掌握度
CREATE TABLE IF NOT EXISTS student_mastery (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  item_id          INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  en_to_zh_level   INTEGER NOT NULL DEFAULT 0,  -- 英译中熟练度 0-100
  zh_to_en_level   INTEGER NOT NULL DEFAULT 0,  -- 中译英熟练度 0-100
  spelling_level   INTEGER NOT NULL DEFAULT 0,  -- 拼写熟练度 0-100
  last_reviewed_at INTEGER,                      -- 最近复习时间（为艾宾浩斯预留）
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(student_id, item_id)
);

-- 测验会话
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  wordbook_id      INTEGER NOT NULL REFERENCES wordbooks(id) ON DELETE CASCADE,
  quiz_type        TEXT    NOT NULL CHECK(quiz_type IN ('en_to_zh', 'zh_to_en', 'spelling')),
  status           TEXT    NOT NULL CHECK(status IN ('in_progress', 'passed', 'abandoned'))
                           DEFAULT 'in_progress',
  total_words      INTEGER NOT NULL,
  pass_accuracy    REAL    NOT NULL DEFAULT 0.8,
  final_accuracy   REAL,            -- 完成后写入
  duration_seconds INTEGER,         -- 本次测验总用时（秒），完成后写入
  started_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at      INTEGER          -- 完成时间
);

-- 答题明细
CREATE TABLE IF NOT EXISTS quiz_answers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  attempt     INTEGER NOT NULL DEFAULT 1,   -- 第几次尝试，答错重入后递增
  user_answer TEXT    NOT NULL,
  is_correct  INTEGER NOT NULL CHECK(is_correct IN (0, 1)),
  duration_ms INTEGER NOT NULL DEFAULT 0,   -- 本题用时（毫秒）
  answered_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_wordbook_items_wordbook ON wordbook_items(wordbook_id);
CREATE INDEX IF NOT EXISTS idx_wordbook_items_item     ON wordbook_items(item_id);
CREATE INDEX IF NOT EXISTS idx_student_mastery_student ON student_mastery(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student   ON quiz_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_session    ON quiz_answers(session_id);
```

---

## TypeScript 类型定义

```typescript
// ---- 枚举 ----

export type ItemType = 'word' | 'phrase';

export type QuizType = 'en_to_zh' | 'zh_to_en' | 'spelling';

export type QuizStatus = 'in_progress' | 'passed' | 'abandoned';

// ---- 数据库行类型（与 SQLite 字段一一对应） ----

export interface StudentRow {
  id: number;
  name: string;
  created_at: number; // Unix 时间戳（秒）
}

export interface WordbookRow {
  id: number;
  name: string;
  description: string | null;
  created_at: number;
}

export interface ItemRow {
  id: number;
  type: ItemType;
  english: string;
  chinese: string;
  phonetic: string | null;
  example_en: string | null;
  example_zh: string | null;
  created_at: number;
}

export interface WordbookItemRow {
  id: number;
  wordbook_id: number;
  item_id: number;
  sort_order: number;
}

export interface StudentMasteryRow {
  id: number;
  student_id: number;
  item_id: number;
  en_to_zh_level: number;  // 0-100
  zh_to_en_level: number;  // 0-100
  spelling_level: number;  // 0-100
  last_reviewed_at: number | null;
  updated_at: number;
}

export interface QuizSessionRow {
  id: number;
  student_id: number;
  wordbook_id: number;
  quiz_type: QuizType;
  status: QuizStatus;
  total_words: number;
  pass_accuracy: number;   // 0-1，默认 0.8
  final_accuracy: number | null;
  duration_seconds: number | null;
  started_at: number;
  finished_at: number | null;
}

export interface QuizAnswerRow {
  id: number;
  session_id: number;
  item_id: number;
  attempt: number;         // 从 1 开始，答错重入后递增
  user_answer: string;
  is_correct: 0 | 1;
  duration_ms: number;
  answered_at: number;
}

// ---- 业务层类型（供前端展示使用） ----

/** 词条（含所属单词本顺序） */
export interface Item extends ItemRow {
  sort_order?: number;
}

/** 词条附带掌握度（用于学习记录页） */
export interface ItemWithMastery extends ItemRow {
  mastery: Pick<StudentMasteryRow,
    'en_to_zh_level' | 'zh_to_en_level' | 'spelling_level' | 'last_reviewed_at'
  >;
}

/** 单词本附带词条数量（用于单词本列表） */
export interface WordbookWithCount extends WordbookRow {
  item_count: number;
}

/** 测验会话附带词条列表（用于开始测验） */
export interface QuizSessionDetail extends QuizSessionRow {
  items: Item[];
}

/** 正确率计算：取每个词条在本 session 最后一次 attempt 的结果 */
export interface QuizResult {
  session_id: number;
  quiz_type: QuizType;
  total_words: number;
  correct_count: number;
  final_accuracy: number;
  duration_seconds: number;
  passed: boolean;
}
```

---

## 正确率计算 SQL

```sql
-- 统计某 session 的最终正确率
-- 取每个 item_id 最大 attempt 那条记录，统计其中 is_correct=1 的比例
SELECT
  COUNT(*) AS total,
  SUM(is_correct) AS correct_count,
  ROUND(CAST(SUM(is_correct) AS REAL) / COUNT(*), 2) AS accuracy
FROM quiz_answers qa
WHERE session_id = ?
  AND attempt = (
    SELECT MAX(attempt) FROM quiz_answers
    WHERE session_id = qa.session_id AND item_id = qa.item_id
  );
```
