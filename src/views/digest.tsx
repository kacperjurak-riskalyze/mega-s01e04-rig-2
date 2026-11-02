import type { DigestRow, Night } from '../digest/types.js';

// A job with this many retries, or whose last run failed, is marked for the reader.
const RETRIES_WARN_AT = 3;

function isWarn(row: DigestRow): boolean {
  return row.retries >= RETRIES_WARN_AT || row.lastStatus === 'fail';
}

function orDash(value: string | null): string {
  return value ?? '—';
}

function badLinesNote(n: number): string {
  return `${n} ${n === 1 ? 'line' : 'lines'} in the log did not parse`;
}

export function Digest({ night }: { night: Night }) {
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => (
              <tr class={isWarn(row) ? 'warn' : undefined}>
                <td>{row.job}</td>
                <td>{orDash(row.owner)}</td>
                <td>{row.runs}</td>
                <td>{row.retries}</td>
                <td>{row.lastStatus}</td>
                <td>{orDash(row.lastError)}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {night.badLines > 0 && <p class="mute">{badLinesNote(night.badLines)}</p>}
    </>
  );
}
