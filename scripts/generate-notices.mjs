#!/usr/bin/env node
// Monta THIRD-PARTY-NOTICES.txt com o texto integral de licenca de cada
// componente servido ao navegador.
//
// Fecha em falha. Se qualquer componente distribuido ficar sem texto de
// licenca, o processo termina com codigo diferente de zero e lista os
// faltantes; nunca emite um arquivo com aviso vazio.
//
// Identidade: package-lock.json, excluindo entradas marcadas `dev`. A marcacao
// e do proprio npm.
//
// Texto: o proprio pacote instalado. Quando o publicador nao o inclui, vale o
// fragmento vendorizado declarado em scripts/legal/thirdparty-policy.mjs, cujo
// sha256 e conferido aqui.
//
// Duas copias byte-identicas sao mantidas, como ja faz o gate de inventario:
// a da raiz e a que o Vite publica a partir de public/.
//
// Uso:
//   node scripts/generate-notices.mjs            grava os arquivos
//   node scripts/generate-notices.mjs --check    nao grava; falha se divergir

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { POLICY } from "./legal/thirdparty-policy.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODO_CHECK = process.argv.includes("--check");

const sha256 = (t) => createHash("sha256").update(t, "utf8").digest("hex");
const paraLf = (t) => t.split("\r\n").join("\n");

function falhar(titulo, linhas) {
  console.error(`\n${titulo}\n`);
  for (const l of linhas) console.error(`  ${l}`);
  console.error("");
  process.exit(1);
}

// ---------------------------------------------------------------- fragmentos

const fragmentos = new Map();
{
  const divergentes = [];
  for (const [chave, frag] of Object.entries(POLICY.fragments)) {
    let texto;
    try {
      texto = readFileSync(resolve(RAIZ, frag.path), "utf8");
    } catch {
      divergentes.push(`${chave}: arquivo ausente ou ilegivel em ${frag.path}`);
      continue;
    }
    const h = sha256(texto);
    if (h !== frag.sha256) {
      divergentes.push(
        `${chave}: sha256 ${h} nao confere com ${frag.sha256} declarado`,
      );
      continue;
    }
    fragmentos.set(chave, texto);
  }
  if (divergentes.length) {
    falhar("Fragmentos de licenca divergem da politica declarada:", divergentes);
  }
}

// ---------------------------------------------------------------------- npm

function nomeDaChaveDoLock(chave) {
  const marcador = "node_modules/";
  const i = chave.lastIndexOf(marcador);
  return i === -1 ? chave : chave.slice(i + marcador.length);
}

// O npm aninha um pacote sob outro quando ha conflito de versao, e nesse caso o
// caminho declarado no lockfile nao existe em disco. Em vez de adivinhar o
// aninhamento, indexa-se a arvore instalada uma unica vez por nome e versao
// lidos do package.json de cada pacote, que e a fonte autoritativa.
let indice = null;

function construirIndice() {
  const mapa = new Map();
  const pilha = [resolve(RAIZ, "node_modules")];
  while (pilha.length) {
    const dir = pilha.pop();
    let entradas;
    try {
      entradas = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entradas) {
      if (!e.isDirectory() || e.name === ".bin") continue;
      const p = join(dir, e.name);
      if (e.name.startsWith("@")) {
        pilha.push(p);
        continue;
      }
      try {
        const j = JSON.parse(readFileSync(join(p, "package.json"), "utf8"));
        if (j.name && j.version) {
          const id = `${j.name}@${j.version}`;
          if (!mapa.has(id)) mapa.set(id, p);
        }
      } catch {
        /* sem package.json legivel: nao e um pacote, segue */
      }
      pilha.push(join(p, "node_modules"));
    }
  }
  return mapa;
}

function acharDiretorio(chaveDoLock, nome, versao) {
  const direto = resolve(RAIZ, chaveDoLock);
  if (existsSync(direto)) return direto;
  if (!indice) indice = construirIndice();
  return indice.get(`${nome}@${versao}`) || null;
}

function textosDeLicenca(dir) {
  if (!dir) return null;
  let entradas;
  try {
    entradas = readdirSync(dir);
  } catch {
    return null;
  }
  const achados = entradas.filter((e) => {
    const minusculo = e.toLowerCase();
    if (!POLICY.licenseFilePrefixes.some((p) => minusculo.startsWith(p))) {
      return false;
    }
    return !POLICY.licenseFileIgnoredExtensions.some((ext) =>
      minusculo.endsWith(ext),
    );
  });
  if (!achados.length) return null;
  const partes = [];
  for (const a of achados.sort()) {
    // Le direto em vez de checar o tipo antes: consultar e depois usar deixa
    // uma janela entre as duas chamadas. Um diretorio faz readFileSync lancar
    // EISDIR, que o catch trata, com o mesmo efeito e sem a janela.
    try {
      const t = paraLf(readFileSync(join(dir, a), "utf8")).trim();
      if (t) partes.push({ arquivo: a, texto: t });
    } catch {
      /* nao e arquivo legivel: segue */
    }
  }
  return partes.length ? partes : null;
}

function componentes() {
  const lock = JSON.parse(
    readFileSync(resolve(RAIZ, POLICY.scope.npm.lock), "utf8"),
  );
  const marcador = POLICY.scope.npm.excludeDevMarker;
  const saida = [];
  const vistos = new Set();
  for (const [chave, meta] of Object.entries(lock.packages || {})) {
    if (!chave.startsWith("node_modules/")) continue;
    if (meta[marcador] === true) continue;
    const nome = meta.name || nomeDaChaveDoLock(chave);
    const versao = meta.version;
    if (!versao) continue;
    const id = `${nome}@${versao}`;
    if (vistos.has(id)) continue;
    vistos.add(id);
    saida.push({
      nome,
      versao,
      id,
      licencaDeclarada: meta.license || null,
      diretorio: acharDiretorio(chave, nome, versao),
    });
  }
  return saida.sort((a, b) => a.id.localeCompare(b.id));
}

// ------------------------------------------------------------------ montagem

const lista = componentes();

const semTexto = [];
for (const c of lista) {
  const fallback = POLICY.licenseFallbacks[c.id];
  if (fallback) {
    c.origemDoTexto = "fragmento vendorizado";
    c.fallback = fallback;
    c.textos = fallback.fragments.map((f) => ({
      arquivo: POLICY.fragments[f].path,
      texto: fragmentos.get(f).trim(),
    }));
    continue;
  }
  const achados = textosDeLicenca(c.diretorio);
  if (achados) {
    c.origemDoTexto = "pacote instalado";
    c.textos = achados;
    continue;
  }
  semTexto.push(
    c.diretorio
      ? `${c.id}: sem texto de licenca em ${c.diretorio}`
      : `${c.id}: pacote nao encontrado em disco`,
  );
}

if (semTexto.length) {
  falhar(
    "Componentes distribuidos sem texto de licenca. Registre cada um em scripts/legal/thirdparty-policy.mjs com origem imutavel e motivo, ou remova a dependencia:",
    semTexto,
  );
}

const barra = "=".repeat(78);
const linhas = [
  "AVISOS DE TERCEIROS - Oraculo Financeiro",
  "",
  "Este arquivo reproduz o texto de licenca de cada componente de terceiro",
  "servido ao navegador. Ele acompanha o LICENSE, o NOTICE e o THIRDPARTY.md na",
  "superficie legal publicada.",
  "",
  `Componentes cobertos: ${lista.length}`,
  `  texto do pacote instalado: ${lista.filter((c) => c.origemDoTexto === "pacote instalado").length}`,
  `  texto vendorizado ........: ${lista.filter((c) => c.origemDoTexto === "fragmento vendorizado").length}`,
  "",
  "Dependencias de desenvolvimento nao constam: nao sao servidas ao usuario.",
  "Gerado por scripts/generate-notices.mjs a partir de package-lock.json,",
  "excluindo as entradas que o npm marca como dev.",
  `Codigo-fonte do produto: ${POLICY.project.sourceRepository}`,
  "",
];

for (const c of lista) {
  linhas.push(barra, "");
  linhas.push(`${c.nome} ${c.versao}`);
  if (c.licencaDeclarada) linhas.push(`Licenca declarada: ${c.licencaDeclarada}`);
  if (c.fallback) {
    linhas.push(
      `Origem do texto: ${c.fallback.sourceRepository} @ ${c.fallback.revision}`,
    );
    linhas.push(`Motivo do texto vendorizado: ${c.fallback.rationale}`);
  }
  linhas.push("");
  for (const t of c.textos) {
    linhas.push(`--- ${t.arquivo} ---`, "", t.texto, "");
  }
}
linhas.push(barra, "");

const conteudo = `${linhas.join("\n").trimEnd()}\n`;
const digest = sha256(conteudo);

if (MODO_CHECK) {
  const problemas = [];
  for (const destino of POLICY.outputs.notices) {
    let atual;
    try {
      atual = paraLf(readFileSync(resolve(RAIZ, destino), "utf8"));
    } catch {
      problemas.push(`${destino}: ausente`);
      continue;
    }
    if (atual !== conteudo) {
      problemas.push(
        `${destino}: desatualizado (commitado ${sha256(atual)}, esperado ${digest})`,
      );
    }
  }
  if (problemas.length) {
    falhar("Avisos de terceiros divergem das dependencias:", [
      ...problemas,
      "Rode: npm run notices",
    ]);
  }
  console.log(
    `Avisos conferem em ${POLICY.outputs.notices.length} copias: ${lista.length} componentes, sha256 ${digest}`,
  );
} else {
  for (const destino of POLICY.outputs.notices) {
    writeFileSync(resolve(RAIZ, destino), conteudo, "utf8");
  }
  console.log(
    `Avisos gravados em ${POLICY.outputs.notices.length} copias: ${lista.length} componentes, ${conteudo.length} chars, sha256 ${digest}`,
  );
}
