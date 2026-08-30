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
  const util = (nome) =>
    !POLICY.licenseFileIgnoredExtensions.some((ext) =>
      nome.toLowerCase().endsWith(ext),
    );
  const comecaCom = (nome, lista) =>
    lista.some((p) => nome.toLowerCase().startsWith(p));

  const portadores = entradas.filter(
    (e) => util(e) && comecaCom(e, POLICY.licenseFilePrefixes),
  );
  // Um NOTICE isolado nao satisfaz a exigencia: e material suplementar, nao o
  // texto da licenca. Sem arquivo portador, o componente cai em `semTexto` e o
  // gate reprova, em vez de emitir um pacote de avisos incompleto.
  if (!portadores.length) return null;

  const suplementares = entradas.filter(
    (e) => util(e) && comecaCom(e, POLICY.supplementalFilePrefixes),
  );
  const achados = [...portadores, ...suplementares];

  const nomesPortadores = new Set(portadores);
  const partes = [];
  let portadorLido = false;
  for (const a of achados.sort()) {
    // Le direto em vez de checar o tipo antes: consultar e depois usar deixa
    // uma janela entre as duas chamadas. Um diretorio faz readFileSync lancar
    // EISDIR, que o catch trata, com o mesmo efeito e sem a janela.
    try {
      const t = paraLf(readFileSync(join(dir, a), "utf8")).trim();
      if (!t) continue;
      partes.push({ arquivo: a, texto: t });
      if (nomesPortadores.has(a)) portadorLido = true;
    } catch {
      /* nao e arquivo legivel: segue */
    }
  }
  // Existir um nome portador nao basta: ele pode ser um diretorio `LICENSES/`
  // ou um arquivo vazio, e nesse caso so sobraria material suplementar. So
  // conta como coberto quando ao menos um portador rendeu texto de verdade.
  return portadorLido ? partes : null;
}

// Componentes deixados de fora por restricao de plataforma, preenchido por
// `componentes()` e reportado no cabecalho do arquivo gerado.
let plataformaExcluidos = [];

// npm documenta `os` e `cpu` como restricoes de plataforma. Um pacote opcional
// restrito a outra plataforma nao e instalado e nao pode estar no artefato, e
// exigi-lo faria o gate reprovar por uma ausencia legitima.
function plataformaExcluida(meta) {
  const casa = (lista, atual) => {
    if (!Array.isArray(lista) || !lista.length) return true;
    const negados = lista.filter((v) => v.startsWith("!")).map((v) => v.slice(1));
    const permitidos = lista.filter((v) => !v.startsWith("!"));
    if (negados.includes(atual)) return false;
    return permitidos.length === 0 || permitidos.includes(atual);
  };
  return !casa(meta.os, process.platform) || !casa(meta.cpu, process.arch);
}

function componentes() {
  const lock = JSON.parse(
    readFileSync(resolve(RAIZ, POLICY.scope.npm.lock), "utf8"),
  );

  // Um lockfile v1 guarda a arvore em `dependencies`, nao em `packages`. Tratar
  // o indice ausente como conjunto vazio aprovaria um arquivo de avisos com
  // zero componentes, que e o pior resultado possivel para um gate que existe
  // para fechar em falha.
  if (!lock.packages || Object.keys(lock.packages).length === 0) {
    falhar("Formato de lockfile nao suportado:", [
      `${POLICY.scope.npm.lock}: lockfileVersion=${lock.lockfileVersion ?? "ausente"} sem indice \`packages\``,
      "Este gate exige lockfileVersion 2 ou superior. Rode: npm install",
    ]);
  }

  const raizLock = lock.packages[""] || {};
  const producaoNaRaiz = new Set([
    ...Object.keys(raizLock.dependencies || {}),
    ...Object.keys(raizLock.optionalDependencies || {}),
  ]);
  const devNaRaiz = new Set(Object.keys(raizLock.devDependencies || {}));

  const marcador = POLICY.scope.npm.excludeDevMarker;
  const saida = [];
  const vistos = new Set();
  const naoResolvidos = [];
  const excluidosPorPlataforma = [];
  for (const [chave, metaOriginal] of Object.entries(lock.packages)) {
    if (!chave.startsWith("node_modules/")) continue;
    if (metaOriginal[marcador] === true) continue;

    // Um link de workspace nao recebe a marcacao `dev` mesmo quando a raiz so o
    // declara em devDependencies, e o alvo resolvido tampouco recupera essa
    // informacao. O alcance vem, entao, das secoes da raiz.
    if (metaOriginal.link === true) {
      const nomeLink = nomeDaChaveDoLock(chave);
      if (devNaRaiz.has(nomeLink) && !producaoNaRaiz.has(nomeLink)) continue;
    }

    if (plataformaExcluida(metaOriginal)) {
      excluidosPorPlataforma.push(nomeDaChaveDoLock(chave));
      continue;
    }

    // Uma entrada com `link: true` (dependencia `file:` ou de workspace) nao
    // carrega versao nem licenca: esses metadados vivem na entrada alvo. Pular
    // por ausencia de versao faria o componente sumir dos avisos sem que o
    // gate reclamasse, que e exatamente o oposto de fechar em falha.
    let meta = metaOriginal;
    if (metaOriginal.link === true) {
      const alvo = metaOriginal.resolved
        ? lock.packages[metaOriginal.resolved]
        : null;
      if (!alvo) {
        naoResolvidos.push(
          `${chave}: entrada com link nao resolvida (resolved=${metaOriginal.resolved ?? "ausente"})`,
        );
        continue;
      }
      meta = { ...alvo, name: alvo.name || metaOriginal.name };
    }

    const nome = meta.name || nomeDaChaveDoLock(chave);
    const versao = meta.version;
    if (!versao) {
      naoResolvidos.push(`${chave}: sem versao no lockfile`);
      continue;
    }
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
  if (naoResolvidos.length) {
    falhar(
      "Entradas do lockfile que nao puderam ser resolvidas. Um componente distribuido nao pode ficar fora dos avisos em silencio:",
      naoResolvidos,
    );
  }
  // Registrado, nao silenciado: quem auditar o arquivo precisa saber que houve
  // exclusao por plataforma e quantas foram.
  plataformaExcluidos = [...new Set(excluidosPorPlataforma)].sort();
  return saida.sort((a, b) => a.id.localeCompare(b.id));
}

// ------------------------------------------------------------------ eleicao

// Quando um componente oferece mais de uma licenca, e a eleicao que determina
// as obrigacoes assumidas. Sem registro, o inventario pode afirmar que nao ha
// escolha a fazer enquanto uma dependencia nova ja oferece duas.
//
// Somente duas formas sao eleitas automaticamente, ambas inequivocas: uma
// disjuncao plana e a forma legada do Cargo. Qualquer outra e recusada e exige
// entrada explicita. Nao se interpreta aqui a gramatica do SPDX.
// Um identificador SPDX e um token curto de letras, digitos, ponto, mais e
// hifen. Nunca contem dois-pontos nem barra. Exigir essa forma impede que uma
// URL de licenca — que o campo `license` de pacotes antigos as vezes traz —
// seja lida como se fosse uma escolha entre alternativas.
const IDENTIFICADOR_SPDX = /^[A-Za-z0-9][A-Za-z0-9.+-]*$/u;

function pareceUrl(expressao) {
  return expressao.includes(":");
}

function termosDeEscolha(expressao) {
  const e = expressao.trim();
  if (pareceUrl(e)) return null;
  if (e.includes("(") || e.includes(")")) return null;
  if (/\bAND\b/u.test(e) || /\bWITH\b/u.test(e)) return null;
  if (/\bOR\b/u.test(e)) {
    const termos = e
      .split(/\bOR\b/u)
      .map((t) => t.trim())
      .filter(Boolean);
    if (termos.length >= 2 && termos.every((t) => IDENTIFICADOR_SPDX.test(t))) {
      return termos;
    }
    return null;
  }
  // Forma legada do Cargo. Aparece com e sem espacos ao redor da barra
  // (`MIT/Apache-2.0` e `Apache-2.0 / MIT`), e ambas sao a mesma disjuncao.
  if (e.includes("/")) {
    const termos = e
      .split("/")
      .map((t) => t.trim())
      .filter(Boolean);
    if (termos.length >= 2 && termos.every((t) => IDENTIFICADOR_SPDX.test(t))) {
      return termos;
    }
  }
  return null;
}

function ofereceEscolha(expressao) {
  if (!expressao) return false;
  // Uma URL nao oferece escolha nenhuma: a barra ali e caminho, nao disjuncao.
  // Sem esta guarda, `https://opensource.org/licenses/MIT` seria dividido e
  // renderia a afirmacao falsa de que MIT foi eleita entre alternativas.
  if (pareceUrl(expressao)) return false;
  return /\bOR\b/u.test(expressao) || expressao.includes("/");
}

// A licenca eleita precisa estar efetivamente reproduzida no artefato. Sem
// isso, o arquivo pode afirmar Apache-2.0 enquanto reproduz o texto da CC0.
function corroborada(licenca, textos) {
  const corpo = textos.map((t) => t.texto).join("\n");
  const conjuntos = licenca
    .split(/\bAND\b/u)
    .map((t) => t.trim())
    .filter(Boolean);
  for (const termo of conjuntos) {
    const marcadores = POLICY.licenseTextMarkers[termo];
    if (!marcadores) {
      return { ok: false, motivo: `sem marcador declarado para ${termo}` };
    }
    if (!marcadores.some((m) => corpo.includes(m))) {
      return {
        ok: false,
        motivo: `nenhum marcador de ${termo} aparece no texto reproduzido`,
      };
    }
  }
  return { ok: true };
}

function elegerLicencas(componentes) {
  const pendentes = [];
  for (const c of componentes) {
    const expressao = c.licencaDeclarada;
    if (!ofereceEscolha(expressao)) continue;

    const explicita = POLICY.licenseElections[c.id];
    if (explicita) {
      // Entrada obsoleta ou com erro de digitacao nao pode aplicar uma escolha
      // que o pacote nunca ofereceu.
      if (explicita.expression !== expressao) {
        pendentes.push(
          `${c.id}: a politica registra a expressao "${explicita.expression}" mas o pacote declara "${expressao}"`,
        );
        continue;
      }
      const corr = corroborada(explicita.elected, c.textos || []);
      if (!corr.ok) {
        pendentes.push(
          `${c.id}: eleicao registrada de ${explicita.elected} nao se sustenta — ${corr.motivo}`,
        );
        continue;
      }
      c.eleicao = { licenca: explicita.elected, origem: "registrada na politica" };
      continue;
    }

    const termos = termosDeEscolha(expressao);
    if (!termos) {
      pendentes.push(
        `${c.id}: expressao "${expressao}" nao e uma escolha trivial e precisa de entrada em licenseElections`,
      );
      continue;
    }
    // Elege-se o primeiro termo que a preferencia indique E cujo texto esteja
    // de fato reproduzido. Preferir um termo sem texto produziria afirmacao
    // falsa; se nenhum se sustentar, o gate reprova e pede decisao explicita.
    const candidatos = POLICY.licenseElectionPreference.filter((p) =>
      termos.includes(p),
    );
    if (!candidatos.length) {
      pendentes.push(
        `${c.id}: nenhum termo de "${expressao}" consta da ordem de preferencia; registre a eleicao em licenseElections`,
      );
      continue;
    }
    const eleita = candidatos.find((p) => corroborada(p, c.textos || []).ok);
    if (!eleita) {
      pendentes.push(
        `${c.id}: nenhum termo de "${expressao}" tem o texto reproduzido no artefato; registre a eleicao em licenseElections`,
      );
      continue;
    }
    c.eleicao = { licenca: eleita, origem: "ordem de preferencia da politica" };
  }
  if (pendentes.length) {
    falhar(
      "Componentes distribuidos que oferecem escolha de licenca sem eleicao registrada:",
      pendentes,
    );
  }
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

// A eleicao roda depois da coleta porque precisa do texto efetivamente
// reproduzido: so se elege licenca que acompanha o artefato.
elegerLicencas(lista);

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
  ...(plataformaExcluidos.length
    ? [
        `Excluidos por restricao de plataforma (${process.platform}/${process.arch}): ${plataformaExcluidos.length}`,
        `  ${plataformaExcluidos.join(", ")}`,
        "  Nao sao instalados nesta plataforma e portanto nao entram no artefato.",
        "",
      ]
    : []),
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
  if (c.eleicao) {
    linhas.push(
      `Licenca eleita: ${c.eleicao.licenca} (${c.eleicao.origem})`,
    );
  }
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
