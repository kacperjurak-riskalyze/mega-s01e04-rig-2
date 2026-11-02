import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';
import type { Night } from '../src/digest/types.js';

const NORMAL = '2026-10-28';
const EMPTY = '2026-10-27';
const MISSING = '2026-01-01';

const dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));

const normalRuns = [
  { at: '2026-10-28T01:00:04+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' },
  { at: '2026-10-28T01:30:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' },
  { at: '2026-10-28T01:31:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' },
  { at: '2026-10-28T01:32:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' },
  { at: '2026-10-28T01:33:00+01:00', job: 'fixtures/refresh', status: 'ok', owner: 'rook' },
  { at: '2026-10-28T03:00:00+01:00', job: 'notes/backup', status: 'fail', owner: 'lane-07', error: 'quota exceeded' },
  { at: '2026-10-28T04:00:00+01:00', job: 'digest/render', status: 'ok', owner: null },
];
// The last line is cut off mid-object, so it does not parse.
const normalLines = [
  ...normalRuns.map((run) => JSON.stringify(run)),
  '{"at":"2026-10-28T05:00:00+01:00","job":"rig/rotate-logs","sta',
];

writeFileSync(join(dir, `${NORMAL}.jsonl`), `${normalLines.join('\n')}\n`);
writeFileSync(join(dir, `${EMPTY}.jsonl`), '');

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const app = createApp({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: dir,
});

// The <tr> that holds one job's cells, from its opening tag to its closing tag.
function rowOf(html: string, job: string): string {
  const cell = html.indexOf(`>${job}<`);
  if (cell === -1) throw new Error(`no row for ${job} in the page`);
  const start = html.lastIndexOf('<tr', cell);
  return html.slice(start, html.indexOf('</tr>', cell) + '</tr>'.length);
}

describe('GET /digest/:night', () => {
  it('answers 200 and names the night in the heading', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`digest · ${NORMAL}`);
  });

  it('renders one table with one row per job, sorted by job', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    expect(html.match(/<table/g)).toHaveLength(1);
    for (const job of ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup']) {
      expect(html).toContain(job);
    }
    const positions = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup'].map((job) =>
      html.indexOf(`>${job}<`),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('marks a row warn when it has 3 or more retries or ends in fail', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    expect(rowOf(html, 'fixtures/refresh')).toContain('<tr class="warn"');
    expect(rowOf(html, 'notes/backup')).toContain('<tr class="warn"');
  });

  it('leaves a clean row unmarked', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    expect(rowOf(html, 'lane/sync')).not.toContain('class="warn"');
    expect(rowOf(html, 'digest/render')).not.toContain('class="warn"');
  });

  it('shows a dash for a null owner and for a missing last error', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const row = rowOf(html, 'digest/render');
    expect(row.match(/—/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('says how many lines did not parse', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    expect(html).toContain('1 line in the log did not parse');
  });

  it('answers 200 and says nothing ran for an empty file', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the readNight result as JSON', async () => {
    const res = await app.request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(readNight(dir, NORMAL));
  });

  it('returns the empty night with no rows', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      night: EMPTY,
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('answers 404 with the error body for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: MISSING });
  });
});

describe('page and JSON agree', () => {
  it('lists the same jobs, in the same order, on the page as in the JSON', async () => {
    const json = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as Night;
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const positions = json.rows.map((row) => html.indexOf(`>${row.job}<`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
