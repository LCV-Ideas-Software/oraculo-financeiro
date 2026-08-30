import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// Threads do PR #235: (a) uma linha duplicada na tabela sobrescrevia a
// anterior em silêncio — a segunda ocorrência "corrigia" a primeira e o gate
// passava; (b) dependência sem entrada (ou sem campo license) no lockfile
// escapava da comparação de licença por optional chaining — fail-open num
// gate de inventário legal. Ambos agora falham.

const SCRIPT = resolve(__dirname, 'verify-thirdparty.mjs');

interface Fixture {
  tableRows: string[];
  packages: Record<string, { license?: string; version?: string }>;
  manifest?: Record<string, string>;
}

const dirs: string[] = [];

const runFixture = ({ tableRows, packages, manifest }: Fixture) => {
  const dir = mkdtempSync(join(tmpdir(), 'thirdparty-fixture-'));
  dirs.push(dir);
  const table = [
    '| Componente | Versão | Licença |',
    '|------------|--------|---------|',
    ...tableRows,
    '',
  ].join('\n');
  writeFileSync(join(dir, 'THIRDPARTY.md'), table);
  mkdirSync(join(dir, 'public', 'legal'), { recursive: true });
  writeFileSync(join(dir, 'public', 'legal', 'THIRDPARTY.md'), table);
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ dependencies: manifest ?? { 'pacote-a': '1.0.0' } }),
  );
  const lockPackages = Object.fromEntries(
    Object.entries(packages).map(([name, entry]) => [`node_modules/${name}`, entry]),
  );
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ packages: lockPackages }));
  return spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
};

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('verify-thirdparty', () => {
  it('aceita uma tabela fiel ao manifesto e ao lockfile', () => {
    const result = runFixture({
      tableRows: ['| pacote-a | 1.0.0 | MIT |'],
      packages: { 'pacote-a': { license: 'MIT' } },
    });
    expect(result.status).toBe(0);
  });

  it('aceita uma versão resolvida nova quando o requisito do manifesto não muda', () => {
    const result = runFixture({
      tableRows: ['| pacote-a | ^1.0.0 | MIT |'],
      packages: { 'pacote-a': { version: '1.2.3', license: 'MIT' } },
      manifest: { 'pacote-a': '^1.0.0' },
    });
    expect(result.status).toBe(0);
  });

  it('continua falhando se a licença mudar dentro do mesmo requisito', () => {
    const result = runFixture({
      tableRows: ['| pacote-a | ^1.0.0 | MIT |'],
      packages: { 'pacote-a': { version: '1.2.3', license: 'Apache-2.0' } },
      manifest: { 'pacote-a': '^1.0.0' },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/licen.*divergente/u);
  });

  it('falha quando a tabela tem linha duplicada para o mesmo componente', () => {
    const result = runFixture({
      tableRows: ['| pacote-a | 9.9.9 | MIT |', '| pacote-a | 1.0.0 | MIT |'],
      packages: { 'pacote-a': { license: 'MIT' } },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/duplicada/u);
  });

  it('falha quando a dependência não tem entrada no lockfile', () => {
    const result = runFixture({
      tableRows: ['| pacote-a | 1.0.0 | MIT |'],
      packages: {},
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/lockfile/u);
  });

  it('falha quando a entrada do lockfile não declara licença', () => {
    const result = runFixture({
      tableRows: ['| pacote-a | 1.0.0 | MIT |'],
      packages: { 'pacote-a': {} },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/licen/u);
  });
});

// Thread do PR #275: a conferência da eleição só andava num sentido — garantia
// que a licença eleita é oferecida pela expressão, nunca que a eleição cobre
// tudo o que a expressão exige. Numa conjuntiva `MIT AND Apache-2.0`, eleger só
// MIT passava. `mandatory` declara os termos não-opcionais, e a política é
// conferida aqui para que uma entrada futura não nasça sem eles.
describe('política de eleição de licença', () => {
  it('declara ordem de preferência e nenhuma licença cujo texto é subconjunto de outra', async () => {
    const { POLICY } = await import('./legal/thirdparty-policy.mjs');
    expect(POLICY.licenseElectionPreference.length).toBeGreaterThan(0);
    // BSD-2-Clause é o BSD-3-Clause sem a cláusula de não-endosso, e MIT-0 e
    // 0BSD são MIT e ISC sem a condição de atribuição: todo trecho que
    // identifica o menor aparece também no maior, então corroborar por busca de
    // trecho não os distingue. Só entram por eleição explícita.
    for (const subconjunto of ['MIT-0', '0BSD', 'BSD-2-Clause']) {
      expect(POLICY.licenseElectionPreference).not.toContain(subconjunto);
    }
  });

  it('exige expressão, eleita, motivo e termos obrigatórios em toda eleição explícita', async () => {
    const { POLICY } = await import('./legal/thirdparty-policy.mjs');
    for (const [id, eleicao] of Object.entries(POLICY.licenseElections)) {
      expect(id).toMatch(/^.+@\d+\.\d+\.\d+/u);
      expect(eleicao.expression).toBeTruthy();
      expect(eleicao.elected).toBeTruthy();
      expect(eleicao.rationale).toBeTruthy();
      expect(Array.isArray(eleicao.mandatory)).toBe(true);
      for (const termo of eleicao.mandatory) {
        expect(eleicao.expression).toContain(termo);
        expect(eleicao.elected).toContain(termo);
      }
    }
  });
});
