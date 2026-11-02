import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { StatusBoard } from '../src/views/status.js';
import type { Status } from '../src/status.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night to its digest, with the counts beside it', async () => {
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('ok 10 · retry 4 · fail 1');
  });

  it('renders a night without counts as a dash', () => {
    const status: Status = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      lastBeat: null,
      nights: [{ night: '2026-10-26', counts: null }],
    };
    const html = String(StatusBoard({ status }));
    expect(html).toContain('href="/digest/2026-10-26"');
    expect(html).toContain('<span class="mute">—</span>');
    expect(html).not.toContain('ok ');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
