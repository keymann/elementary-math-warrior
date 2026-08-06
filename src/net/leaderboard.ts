/**
 * 명예의 전당 클라이언트.
 *
 * 랭킹은 **있으면 좋은 기능**이지 필수가 아니다. 오프라인이거나 서버가 아직
 * 준비되지 않았을 때도 게임은 그대로 돌아가야 하므로, 모든 실패를 값으로 돌려주고
 * 예외를 던지지 않는다.
 */
import type { Grade } from '../quiz/selector';

export type RankRow = {
  rank: number;
  name: string;
  classCode: string | null;
  score: number;
  surviveMs: number;
  level: number;
  accuracy: number;
  cleared: boolean;
};

export type SubmitResult =
  | { ok: true; score: number; rank: number }
  | { ok: false; reason: string };

export type ListResult = { ok: true; rows: RankRow[] } | { ok: false; reason: string };

const TIMEOUT_MS = 6000;

async function call(input: string, init?: RequestInit): Promise<Response | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: ac.signal });
  } catch {
    return null; // 오프라인·타임아웃 — 조용히 실패한다
  } finally {
    clearTimeout(timer);
  }
}

export async function submitScore(run: {
  name: string;
  classCode: string | null;
  grade: Grade;
  surviveMs: number;
  kills: number;
  level: number;
  /** 0~1 */
  accuracy: number | null;
  cleared: boolean;
}): Promise<SubmitResult> {
  const res = await call('/api/scores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...run,
      accuracy: Math.round((run.accuracy ?? 0) * 100),
    }),
  });
  if (!res) return { ok: false, reason: '오프라인이라 기록을 못 보냈어요' };
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; score?: number; rank?: number; error?: string }
    | null;
  if (!res.ok || !data?.ok) return { ok: false, reason: data?.error ?? '기록 전송에 실패했어요' };
  return { ok: true, score: data.score ?? 0, rank: data.rank ?? 0 };
}

export async function fetchRanking(grade: Grade, classCode?: string | null): Promise<ListResult> {
  const q = new URLSearchParams({ grade: String(grade), limit: '20' });
  if (classCode) q.set('classCode', classCode);
  const res = await call(`/api/scores?${q}`);
  if (!res) return { ok: false, reason: '오프라인이라 순위를 못 불러왔어요' };
  const data = (await res.json().catch(() => null)) as { rows?: RankRow[]; error?: string } | null;
  if (!res.ok || !data?.rows) return { ok: false, reason: data?.error ?? '순위를 불러오지 못했어요' };
  return { ok: true, rows: data.rows };
}
