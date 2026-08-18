// Gate do inventário legal (issue #215): as duas cópias de THIRDPARTY.md são a
// MESMA declaração em dois pontos de publicação e precisam ser fiéis ao
// manifesto real — não apenas iguais entre si. Três invariantes, todos
// fail-closed:
//   1. cópia raiz e public/legal/ byte-idênticas;
//   2. cada dependência de package.json (deps+devDeps) tem linha com a versão
//      EXATA, e nenhuma linha sobra;
//   3. a licença de cada linha bate com o campo license do package-lock.json.
import { readFileSync } from 'node:fs';

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

const rows = new Map();
for (const match of root.matchAll(/^\| ([^ |]+) \| ([^ |]+) \| ([^|]+) \|/gm)) {
  if (match[1] !== 'Componente') rows.set(match[1], { version: match[2], license: match[3].trim() });
}
if (rows.size === 0) fail('nenhuma linha de componente encontrada na tabela');

for (const [name, version] of Object.entries(manifest)) {
  const row = rows.get(name);
  if (!row) fail(`dependência sem linha na tabela: ${name}`);
  if (row.version !== version)
    fail(`versão divergente para ${name}: tabela=${row.version} package.json=${version}`);
  const locked = lock.packages?.[`node_modules/${name}`];
  if (locked?.license && row.license !== locked.license)
    fail(`licença divergente para ${name}: tabela=${row.license} lockfile=${locked.license}`);
}
for (const name of rows.keys()) {
  if (!(name in manifest)) fail(`linha sem dependência correspondente no package.json: ${name}`);
}

console.log(
  `THIRDPARTY válido: ${rows.size} componentes, cópias idênticas, fiéis ao package.json e ao lockfile.`,
);
