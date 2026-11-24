// Online soak test against a running server: several headless players on one quick match must
// end on the same state hash.
//   yarn workspace @kingmap-rts/kingsmap-tools net:soak ws://localhost:8787/ws [players=6] [turns=900]
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [url = 'ws://localhost:8787/ws', nS = '6', turnsS = '900'] =
  process.argv.slice(2);
const N = +nS;
const client = fileURLToPath(new URL('./client.ts', import.meta.url));
const langs = ['uk', 'en'];
const res = await Promise.all(
  Array.from(
    { length: N },
    (_, i) =>
      new Promise<any>(done => {
        const c = spawn(
          process.execPath,
          [
            '--import',
            'tsx',
            client,
            url,
            `P${i}`,
            langs[i % 2],
            turnsS,
            String(1000 + i),
          ],
          { stdio: ['ignore', 'pipe', 'inherit'] },
        );
        let buf = '';
        c.stdout.on('data', d => (buf += d));
        c.on('exit', () => {
          try {
            done(JSON.parse(buf.trim().split('\n').pop()!));
          } catch {
            done({ nick: `P${i}`, crashed: buf.slice(-400) });
          }
        });
      }),
  ),
);
for (const r of res) console.log(JSON.stringify(r));
const hashes = new Set(res.map(r => r.hash));
const ok = hashes.size === 1 && res.every(r => !r.desyncs && !r.errors);
console.log(
  ok
    ? 'IN SYNC: every client ended on the same state'
    : 'PROBLEM: clients diverged or errored',
);
process.exit(ok ? 0 : 1);
