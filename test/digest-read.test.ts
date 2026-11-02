import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLine, readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('gives one row per job, sorted by job, and counts the bad line', () => {
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(1);
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('folds retries, last status, last error and times per job', () => {
    const refresh = night?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(refresh).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    const backup = night?.rows.find((r) => r.job === 'notes/backup');
    expect(backup).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a row whose owner is null', () => {
    const render = night?.rows.find((r) => r.job === 'digest/render');
    expect(render).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok', lastError: null });
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(join(dir, '2026-01-01.jsonl'), '');

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-01-02')).toBeNull();
  });

  it('returns null for a night that is not a date', () => {
    expect(readNight(dir, '../2026-01-01')).toBeNull();
  });

  it('reads an empty file as a night where nothing ran', () => {
    expect(readNight(dir, '2026-01-01')).toEqual({
      night: '2026-01-01',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });
});

describe('parseLine', () => {
  it('rejects lines that are not whole run lines', () => {
    expect(parseLine('{"at":"x","job":"a","status":"maybe","owner":"r"}')).toBeNull();
    expect(parseLine('[1,2]')).toBeNull();
    expect(parseLine('{"at":"x","job":"a","status":"ok","owner":5}')).toBeNull();
  });
});
