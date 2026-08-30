import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { identidadeDoArtefatoEhImutavel } from './legal/artifact-policy.mjs';

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
  it(
    'valida o inventário real inclusive o contrato oficial do Bundler',
    () => {
      const result = spawnSync(process.execPath, [SCRIPT], {
        cwd: resolve(__dirname, '..'),
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
    },
    15_000,
  );

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
// MIT passava. As obrigações passaram a ser DERIVADAS da árvore sintática pela
// implementação de referência do SPDX, e a asserção abaixo usa o mesmo
// predicado do gerador.
describe('política de eleição de licença', () => {
  it('declara uma ordem de preferência sem identificadores duplicados', async () => {
    const { POLICY } = await import('./legal/thirdparty-policy.mjs');
    expect(POLICY.licenseElectionPreference.length).toBeGreaterThan(0);
    expect(new Set(POLICY.licenseElectionPreference).size).toBe(
      POLICY.licenseElectionPreference.length,
    );
  });

  it('valida a identidade e o conteúdo de toda eleição explícita registrada', async () => {
    const { POLICY } = await import('./legal/thirdparty-policy.mjs');
    for (const [id, entrada] of Object.entries(POLICY.licenseElections)) {
      expect(id).toMatch(/^.+@\d+\.\d+\.\d+/u);
      const eleicoes = Array.isArray(entrada) ? entrada : [entrada];
      expect(eleicoes.length).toBeGreaterThan(0);
      for (const eleicao of eleicoes) {
        expect(eleicao.ecosystem).toBe('npm');
        expect(eleicao.source).toBeTruthy();
        expect(Object.hasOwn(eleicao, 'integrity')).toBe(true);
        expect(identidadeDoArtefatoEhImutavel(eleicao)).toBe(true);
        expect(eleicao.expression).toBeTruthy();
        expect(eleicao.elected).toBeTruthy();
        expect(eleicao.rationale).toBeTruthy();
      }
    }
  });

  it('prende toda exceção do Licensee à identidade e aos hashes exatos', async () => {
    const { POLICY } = await import('./legal/thirdparty-policy.mjs');
    for (const [id, entrada] of Object.entries(
      POLICY.licenseTextReviewOverrides,
    )) {
      expect(id).toMatch(/^.+@\d+\.\d+\.\d+/u);
      const registros = Array.isArray(entrada) ? entrada : [entrada];
      expect(registros.length).toBeGreaterThan(0);
      for (const registro of registros) {
        expect(registro.ecosystem).toBe('npm');
        expect(registro.source).toBeTruthy();
        expect(Object.hasOwn(registro, 'integrity')).toBe(true);
        expect(identidadeDoArtefatoEhImutavel(registro)).toBe(true);
        expect(registro.licenses.length).toBeGreaterThan(0);
        expect(registro.rationale).toBeTruthy();
        expect(Object.keys(registro.files).length).toBeGreaterThan(0);
        for (const hash of Object.values(registro.files)) {
          expect(hash).toMatch(/^[a-f0-9]{64}$/u);
        }
      }
    }
  });

  it('fixa revisão imutável em todo texto vendorizado, complemento inclusive', async () => {
    const { POLICY } = await import('./legal/thirdparty-policy.mjs');
    const vendorizados = [
      ...Object.entries(POLICY.licenseFallbacks ?? {}),
      ...Object.entries(POLICY.licenseSupplements ?? {}),
    ];
    expect(vendorizados.length).toBeGreaterThan(0);
    for (const [id, entrada] of vendorizados) {
      expect(id).toMatch(/^.+@\d+\.\d+\.\d+/u);
      const registros = Array.isArray(entrada) ? entrada : [entrada];
      for (const registro of registros) {
        expect(registro.ecosystem).toBe('npm');
        expect(registro.source).toBeTruthy();
        expect(Object.hasOwn(registro, 'integrity')).toBe(true);
        expect(identidadeDoArtefatoEhImutavel(registro)).toBe(true);
        expect(registro.rationale).toBeTruthy();
        expect(registro.sourceRepository).toBeTruthy();
        // Nome de branch ou tag não é proveniência: os dois se movem. Só commit
        // completo prova de que bytes de upstream o texto local saiu.
        expect(registro.revision ?? '').toMatch(/^[0-9a-f]{40}$/u);
        for (const chave of registro.fragments) {
          expect(POLICY.fragments[chave]).toBeTruthy();
        }
      }
    }
  });
});
