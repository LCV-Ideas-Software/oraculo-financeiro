import { execFileSync } from "node:child_process";

import npmInstallChecks from "npm-install-checks";

// O package-lock tambem registra pacotes instalados dentro de uma dependencia
// `file:` em caminhos como `packages/app/node_modules/dep`. Limitar a busca a
// chaves que COMECAM por node_modules/ omite esses artefatos de producao. O
// formato abaixo reconhece um pacote completo depois de qualquer segmento
// node_modules, inclusive nomes com escopo, sem aceitar subdiretorios internos.
export function ehEntradaInstaladaNpm(chave) {
  return /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+$/u.test(chave);
}

export function ehLinkDiretoDaRaizNpm(chave, nomeDeclarado) {
  return chave === `node_modules/${nomeDeclarado}`;
}

// O JSON do `npm query` serializa o alvo real como no, mas as arestas `to` do
// pai ainda apontam para a localizacao do Link. O objeto Arborist `link.target`
// nao sobrevive no JSON da CLI; o `resolved` do package-lock oficial preserva
// exatamente essa ponte. Resolucao em cadeia e ciclo sao tratados abaixo.
export function mapaDeLinksNpm(packages) {
  const links = new Map();
  for (const [chave, entrada] of Object.entries(packages || {})) {
    if (entrada?.link !== true) continue;
    if (typeof entrada.resolved !== "string" || !entrada.resolved.trim()) {
      throw new Error(`${chave}: link do package-lock sem resolved utilizavel`);
    }
    links.set(chave, entrada.resolved);
  }
  return links;
}

function resolverLocalizacaoDeLink(localizacao, links) {
  let atual = localizacao;
  const vistos = new Set();
  while (links.has(atual)) {
    if (vistos.has(atual)) {
      throw new Error(
        `ciclo de links no package-lock ao resolver ${localizacao}: ${[
          ...vistos,
          atual,
        ].join(" -> ")}`,
      );
    }
    vistos.add(atual);
    atual = links.get(atual);
  }
  return atual;
}

// Consulta toda a arvore uma unica vez pela interface oficial do npm. A saida
// ja traz `location` e as arestas `to` calculadas pelo Arborist; o gate apenas
// percorre essas relacoes, sem interpretar package.json ou reimplementar a
// resolucao do npm.
export function consultarArvoreNpm({ raiz, caminhoDoNpm }) {
  const bruto = execFileSync(
    process.execPath,
    [caminhoDoNpm, "query", "*", "--json"],
    {
      cwd: raiz,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  const arvore = JSON.parse(bruto);
  if (!Array.isArray(arvore)) {
    throw new TypeError("npm query nao devolveu uma lista de componentes");
  }
  for (const no of arvore) {
    if (typeof no?.location !== "string" || !Array.isArray(no.to)) {
      throw new TypeError(
        "npm query devolveu componente sem location/to utilizavel",
      );
    }
  }
  return arvore;
}

export function descreverRaizNpm(packages, nome) {
  const chave = `node_modules/${nome}`;
  const entrada = packages?.[chave];
  if (!entrada) {
    throw new Error(
      `${nome}: raiz declarada no package.json nao existe em ${chave} do lockfile`,
    );
  }
  return {
    nome,
    localizacao:
      entrada?.link === true && entrada.resolved ? entrada.resolved : chave,
  };
}

export function nomesDasRaizesDeProducaoNpm(manifesto) {
  return [
    ...new Set([
      ...Object.keys(manifesto?.dependencies || {}),
      ...Object.keys(manifesto?.optionalDependencies || {}),
    ]),
  ];
}

export function filtrarRaizesCompativeisNpm({ packages, nomes, alvo }) {
  const compativeis = [];
  for (const nome of nomes) {
    const chave = `node_modules/${nome}`;
    const entrada = packages?.[chave];
    if (!entrada) {
      throw new Error(
        `${nome}: raiz declarada no package.json nao existe em ${chave} do lockfile`,
      );
    }
    const resolvida = resolverEntradaNpm(packages, chave, entrada);
    if (resolvida.erro) throw new Error(resolvida.erro);
    if (!plataformaExcluidaNpm(resolvida.meta, alvo)) {
      compativeis.push(nome);
      continue;
    }
    if (resolvida.meta.optional !== true) {
      throw new Error(
        `${nome}: raiz obrigatoria e incompativel com a plataforma-alvo`,
      );
    }
  }
  return compativeis;
}

export function resolverEntradaNpm(packages, chave, entrada) {
  if (entrada?.link !== true) {
    return {
      meta: entrada,
      origem: entrada?.resolved || null,
      localizacoes: [chave],
    };
  }

  const alvo = entrada.resolved ? packages?.[entrada.resolved] : null;
  if (!alvo) {
    return {
      erro: `${chave}: entrada com link nao resolvida (resolved=${entrada.resolved ?? "ausente"})`,
    };
  }
  return {
    meta: {
      ...alvo,
      name: alvo.name || entrada.name,
      optional: entrada.optional === true || alvo.optional === true,
    },
    origem: entrada.resolved,
    localizacoes: [chave, entrada.resolved],
  };
}

export function criarComponenteNpm({
  nome,
  versao,
  meta,
  origem,
  localizacoes,
  injetaRuntime,
  diretorio,
}) {
  return {
    ecossistema: "npm",
    nome,
    versao,
    id: `${nome}@${versao}`,
    licencaDeclarada: meta.license || null,
    origemPacote: origem || null,
    integridadePacote: meta.integrity || null,
    injetaRuntime,
    localizacoes: [...localizacoes],
    diretorio,
  };
}

export function mesclarOcorrenciaNpm(existente, ocorrencia) {
  if (existente.integridadePacote !== ocorrencia.integridadePacote) {
    return { ok: false, tipo: "integridade-divergente" };
  }
  existente.localizacoes.push(
    ...ocorrencia.localizacoes.filter(
      (localizacao) => !existente.localizacoes.includes(localizacao),
    ),
  );
  existente.injetaRuntime ||= ocorrencia.injetaRuntime;
  return { ok: true };
}

export function plataformaExcluidaNpm(meta, alvo) {
  const camposObrigatorios = ["targetOs", "targetCpu", "targetLibc"];
  const ausentes = camposObrigatorios.filter(
    (campo) =>
      typeof alvo?.[campo] !== "string" || alvo[campo].trim().length === 0,
  );
  if (ausentes.length) {
    throw new TypeError(
      `alvo npm incompleto; informe ${ausentes.join(", ")} explicitamente`,
    );
  }
  try {
    npmInstallChecks.checkPlatform(meta, false, {
      os: alvo.targetOs,
      cpu: alvo.targetCpu,
      libc: alvo.targetLibc,
    });
    return false;
  } catch (erro) {
    if (erro?.code === "EBADPLATFORM") return true;
    throw erro;
  }
}

export function derivarAlcanceNpm({
  arvore,
  raizes,
  comDescendentes,
  links = new Map(),
}) {
  if (!raizes.length) return new Set();
  const porLocalizacao = new Map(arvore.map((no) => [no.location, no]));
  const ausentes = raizes.filter(
    ({ localizacao }) =>
      !porLocalizacao.has(resolverLocalizacaoDeLink(localizacao, links)),
  );
  if (ausentes.length) {
    throw new Error(
      `npm query nao devolveu as raizes instaladas: ${ausentes
        .map(({ nome, localizacao }) => `${nome} (${localizacao})`)
        .join(", ")}`,
    );
  }
  const pendentes = raizes.map(({ localizacao }) => localizacao);
  const alcance = new Set();
  const visitados = new Set();
  while (pendentes.length) {
    const localizacao = pendentes.pop();
    if (visitados.has(localizacao)) continue;
    visitados.add(localizacao);
    const alvo = resolverLocalizacaoDeLink(localizacao, links);
    const no = porLocalizacao.get(alvo);
    if (!no) {
      throw new Error(
        `npm query devolveu relacao para localizacao sem no utilizavel: ${localizacao}` +
          (alvo !== localizacao ? ` -> ${alvo}` : ""),
      );
    }
    alcance.add(localizacao);
    alcance.add(alvo);
    alcance.add(no.location);
    if (comDescendentes) pendentes.push(...no.to);
  }
  return alcance;
}

export function alcanceNoGrafoNpm({
  raiz,
  caminhoDoNpm,
  raizes,
  comDescendentes,
  links,
}) {
  return derivarAlcanceNpm({
    arvore: consultarArvoreNpm({ raiz, caminhoDoNpm }),
    raizes,
    comDescendentes,
    links,
  });
}
