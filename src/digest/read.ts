import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

// Parse one log line at the edge. Anything that is not a whole, well-formed run line is null.
export function parseLine(text: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string' || o.job === '') return null;
  if (!STATUSES.includes(o.status as RunStatus)) return null;
  if (o.owner !== undefined && o.owner !== null && typeof o.owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  return {
    at: o.at,
    job: o.job,
    status: o.status as RunStatus,
    owner: typeof o.owner === 'string' ? o.owner : null,
    ...(typeof o.error === 'string' ? { error: o.error } : {}),
  };
}

function addLine(row: DigestRow | undefined, line: RunLine): DigestRow {
  if (!row) {
    return {
      job: line.job,
      owner: line.owner,
      runs: 1,
      retries: line.status === 'retry' ? 1 : 0,
      lastStatus: line.status,
      lastError: line.error ?? null,
      firstAt: line.at,
      lastAt: line.at,
    };
  }
  return {
    ...row,
    owner: row.owner ?? line.owner,
    runs: row.runs + 1,
    retries: row.retries + (line.status === 'retry' ? 1 : 0),
    lastStatus: line.status,
    lastError: line.error ?? row.lastError,
    lastAt: line.at,
  };
}

// Lines are taken in file order, which is the order they were written.
export function digestLines(night: string, lines: readonly string[]): Night {
  const rows = new Map<string, DigestRow>();
  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const text of lines) {
    if (text.trim() === '') continue;
    const line = parseLine(text);
    if (!line) {
      badLines += 1;
      continue;
    }
    counts[line.status] += 1;
    rows.set(line.job, addLine(rows.get(line.job), line));
  }

  const sorted = [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows: sorted, counts, badLines };
}

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

// A night that is not YYYY-MM-DD has no file, by definition: it never reaches the file system.
export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  return digestLines(night, text.split('\n'));
};
