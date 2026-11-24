// Publishes every public workspace package whose current version is not in GitHub Packages yet.
// Order: dependencies first. Used by .github/workflows/release.yml; locally: GITHUB_TOKEN=… node scripts/publish-new.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ORDER = ['kingsmap-types', 'kingsmap-protocol', 'kingsmap-core'];
const yarn = (args, opts = {}) =>
  execFileSync('yarn', args, { encoding: 'utf8', ...opts });

let count = 0;
for (const dir of ORDER) {
  const pkg = JSON.parse(readFileSync(`packages/${dir}/package.json`, 'utf8'));
  if (pkg.private) continue;
  const spec = `${pkg.name}@${pkg.version}`;
  // `yarn npm info name@version` answers with the latest version when that one does not
  // exist, so compare against the full list of published versions instead
  let published = [];
  try {
    const info = yarn(
      ['npm', 'info', pkg.name, '--fields', 'versions', '--json'],
      { stdio: 'pipe' },
    );
    published = JSON.parse(info).versions ?? [];
  } catch {
    published = []; // 404: the package was never published
  }
  const exists = published.includes(pkg.version);
  if (exists) {
    console.log(`= ${spec} already published`);
    continue;
  }
  console.log(`↑ publishing ${spec}`);
  yarn(['workspace', pkg.name, 'npm', 'publish'], { stdio: 'inherit' });
  count++;
}
console.log(count ? `${count} package(s) published` : 'nothing new to publish');
