// Gate do inventário legal (issue #215): as duas cópias de THIRDPARTY.md são a
// MESMA declaração em dois pontos de publicação e precisam ser fiéis ao
// manifesto real — não apenas iguais entre si. Três invariantes, todos
// fail-closed:
//   1. cópia raiz e public/legal/ byte-idênticas;
//   2. cada dependência direta de package.json ou Gemfile tem linha, e nenhuma
//      linha sobra;
//   3. versão e licença batem com package-lock ou Gemfile.lock/gemspec;
//   4. a versão do Licensee coincide com a política cujas exceções ela sustenta.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { POLICY } from './legal/thirdparty-policy.mjs';

const fail = (message) => {
  console.error(`THIRDPARTY inválido: ${message}`);
  process.exit(1);
};

const root = readFileSync('THIRDPARTY.md', 'utf8');
const publicCopy = readFileSync('public/legal/THIRDPARTY.md', 'utf8');
if (root !== publicCopy) fail('as duas cópias divergem (raiz × public/legal)');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const manifest = { ...pkg.dependencies, ...pkg.devDependencies };
const componentesEsperados = new Set(Object.keys(manifest));

const rows = new Map();
for (const match of root.matchAll(/^\| ([^ |]+) \| ([^ |]+) \| ([^|]+) \|/gm)) {
  if (match[1] === 'Componente') continue;
  // Duplicata é erro, não sobrescrita: a segunda linha mascararia a primeira
  // e o gate validaria só a última ocorrência (PR #235).
  if (rows.has(match[1])) fail(`linha duplicada na tabela para ${match[1]}`);
  rows.set(match[1], { version: match[2], license: match[3].trim() });
}
if (rows.size === 0) fail('nenhuma linha de componente encontrada na tabela');

for (const [name, version] of Object.entries(manifest)) {
  const row = rows.get(name);
  if (!row) fail(`dependência sem linha na tabela: ${name}`);
  if (row.version !== version)
    fail(`versão divergente para ${name}: tabela=${row.version} package.json=${version}`);
  // Fail-closed (PR #235): dependência sem entrada ou sem campo license no
  // lockfile escapava da comparação por optional chaining — num gate de
  // inventário legal, ausência de dado é falha, não passe livre.
  const locked = lock.packages?.[`node_modules/${name}`];
  if (!locked) fail(`dependência sem entrada no lockfile: ${name}`);
  if (!locked.license) fail(`entrada do lockfile sem licença declarada: ${name}`);
  if (row.license !== locked.license)
    fail(`licença divergente para ${name}: tabela=${row.license} lockfile=${locked.license}`);
}

if (existsSync('Gemfile')) {
  // Bundler e RubyGems sao as fontes oficiais para interpretar Gemfile e lock;
  // o gate nao tenta reimplementar a gramatica Ruby nem analisar o lock como
  // texto. Somente dependencias diretas entram no inventario, como no npm.
  const programaRuby = [
    'specs=Bundler.load.specs.to_a.to_h { |s| [s.name,s] }',
    'deps=Bundler.load.dependencies.map do |d|',
    '  s=specs.fetch(d.name)',
    '  {name:d.name, requirement:d.requirement.requirements.map { |op,v| [op,v.to_s] }, version:s.version.to_s, licenses:s.licenses}',
    'end',
    'puts JSON.generate(deps)',
  ].join("\n");
  const consulta = spawnSync(
    'ruby',
    ['-S', 'bundle', 'exec', 'ruby', '-rbundler', '-rjson', '-e', programaRuby],
    {
      encoding: 'utf8',
      env: { ...process.env, BUNDLE_FROZEN: 'true' },
      windowsHide: true,
    },
  );
  if (consulta.error || consulta.status !== 0) {
    fail(
      `Bundler não pôde validar o inventário: ${consulta.error?.message || consulta.stderr.trim() || `status ${consulta.status}`}`,
    );
  }
  let gems;
  try {
    gems = JSON.parse(consulta.stdout);
  } catch {
    fail('Bundler não devolveu JSON válido para as dependências diretas');
  }
  for (const gem of gems) {
    if (
      JSON.stringify(gem.requirement) !==
      JSON.stringify([['=', gem.version]])
    ) {
      fail(
        `a gem direta ${gem.name} deve ficar fixada exatamente à versão resolvida ${gem.version}`,
      );
    }
    if (componentesEsperados.has(gem.name)) {
      fail(`nome duplicado entre npm e Bundler no inventário: ${gem.name}`);
    }
    componentesEsperados.add(gem.name);
    const row = rows.get(gem.name);
    if (!row) fail(`gem direta sem linha na tabela: ${gem.name}`);
    if (row.version !== gem.version) {
      fail(
        `versão divergente para ${gem.name}: tabela=${row.version} Gemfile.lock=${gem.version}`,
      );
    }
    const licenca = gem.licenses.join(' OR ');
    if (!licenca) fail(`gem ${gem.name} sem licença declarada no gemspec`);
    if (row.license !== licenca) {
      fail(
        `licença divergente para ${gem.name}: tabela=${row.license} gemspec=${licenca}`,
      );
    }
  }

  const matcher = POLICY.licenseTextMatcher;
  const detector = gems.find((gem) => gem.name === matcher?.gem);
  if (!detector) fail('detector Licensee da política não é dependência direta do Gemfile');
  if (detector.version !== matcher.version) {
    fail(
      `versão do detector diverge: política=${matcher.version} Gemfile.lock=${detector.version}; revalide todas as exceções de texto antes de atualizar`,
    );
  }
}
for (const name of rows.keys()) {
  if (!componentesEsperados.has(name)) {
    fail(`linha sem dependência correspondente nos manifestos: ${name}`);
  }
}

console.log(
  `THIRDPARTY válido: ${rows.size} componentes, cópias idênticas, fiéis aos manifestos e lockfiles.`,
);
