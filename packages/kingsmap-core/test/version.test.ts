import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from '../src';

describe('CORE_VERSION', () => {
  it('equals the version in package.json', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(CORE_VERSION).toBe(pkg.version);
  });
});
