import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CONFIG = resolve(__dirname, '..', '.github', 'dependabot.yml');

const ecosystemBlock = (ecosystem: string) => {
  const lines = readFileSync(CONFIG, 'utf8').split(/\r?\n/u);
  const marker = `- package-ecosystem: "${ecosystem}"`;
  const start = lines.findIndex((line) => line.trim() === marker);
  if (start < 0) throw new Error(`Dependabot não contém o ecossistema ${ecosystem}`);

  const next = lines.findIndex(
    (line, index) => index > start && line.trim().startsWith('- package-ecosystem:'),
  );
  return lines.slice(start, next < 0 ? undefined : next).map((line) => line.trim());
};

describe('configuração do Dependabot', () => {
  it('preserva requisitos npm que já admitem a nova versão resolvida', () => {
    const npm = ecosystemBlock('npm');
    expect(npm.filter((line) => line.startsWith('versioning-strategy:'))).toEqual([
      'versioning-strategy: increase-if-necessary',
    ]);
  });
});
