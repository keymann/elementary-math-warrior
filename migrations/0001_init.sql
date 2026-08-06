-- 명예의 전당 (Cloudflare D1)
--
-- 개인정보를 최소로 담는다. 별명과 학급 코드만 받고 계정·이메일·연령은 받지 않는다.
-- 학교 태블릿을 여러 학생이 돌려 쓰는 환경을 전제로 한다.

CREATE TABLE IF NOT EXISTS scores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  class_code   TEXT,
  grade        INTEGER NOT NULL,
  score        INTEGER NOT NULL,
  survive_ms   INTEGER NOT NULL,
  kills        INTEGER NOT NULL,
  level        INTEGER NOT NULL,
  accuracy     INTEGER NOT NULL,   -- 0~100
  cleared      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL    -- epoch ms
);

-- 학급별 조회 / 전체 조회 각각의 인덱스
CREATE INDEX IF NOT EXISTS idx_scores_class ON scores (class_code, grade, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_grade ON scores (grade, score DESC);
-- 레이트 리밋 조회용
CREATE INDEX IF NOT EXISTS idx_scores_recent ON scores (name, created_at DESC);
