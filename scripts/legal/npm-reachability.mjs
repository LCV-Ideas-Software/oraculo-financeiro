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

// Consulta a arvore virtual do lockfile uma unica vez pela interface oficial
// do npm. `--package-lock-only` impede que a plataforma do host elimine do
// grafo os opcionais da plataforma-alvo. A saida ja traz `location` e as
// arestas `to` calculadas pelo Arborist; o gate apenas percorre essas relacoes.
export function consultarArvoreNpm({ raiz, caminhoDoNpm }) {
  const bruto = execFileSync(
    process.execPath,
    [caminhoDoNpm, "query", "*", "--package-lock-only", "--json"],
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
    // Preserve o lado instalado do link. A travessia resolve a ponte para o
    // alvo do Arborist, mas a entrada do link carrega flags como optional e
    // devOptional que podem nao se repetir no alvo.
    localizacao: chave,
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

// No package-lock, `devOptional` identifica um pacote que esta na arvore de
// desenvolvimento e tambem sob uma optionalDependency de producao. Para o
// artefato de producao ele continua sendo opcional e pode ser podado por
// plataforma, assim como `optional`.
export function ehOpcionalEmProducaoNpm(meta) {
  return meta?.optional === true || meta?.devOptional === true;
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
      devOptional:
        entrada.devOptional === true || alvo.devOptional === true,
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
  packages,
  alvo,
  excluidosPorPlataforma,
}) {
  if (!raizes.length) return new Set();
  const filtrarPlataforma = packages !== undefined || alvo !== undefined;
  if (filtrarPlataforma && (!packages || !alvo)) {
    throw new TypeError(
      "packages e alvo precisam ser informados juntos para filtrar a plataforma",
    );
  }
  if (
    excluidosPorPlataforma !== undefined &&
    !(excluidosPorPlataforma instanceof Set)
  ) {
    throw new TypeError("excluidosPorPlataforma precisa ser um Set");
  }
  const porLocalizacao = new Map(arvore.map((no) => [no.location, no]));

  const registrarRamoExcluido = (raizDoRamo) => {
    if (!excluidosPorPlataforma) return;
    const pendentesDoRamo = [raizDoRamo];
    const vistosNoRamo = new Set();
    while (pendentesDoRamo.length) {
      const localizacao = pendentesDoRamo.pop();
      if (vistosNoRamo.has(localizacao)) continue;
      vistosNoRamo.add(localizacao);
      const localizacaoAlvo = resolverLocalizacaoDeLink(localizacao, links);
      const no = porLocalizacao.get(localizacaoAlvo);
      if (!no) {
        throw new Error(
          `npm query devolveu relacao para localizacao sem no utilizavel: ${localizacao}` +
            (localizacaoAlvo !== localizacao
              ? ` -> ${localizacaoAlvo}`
              : ""),
        );
      }
      excluidosPorPlataforma.add(localizacao);
      excluidosPorPlataforma.add(localizacaoAlvo);
      excluidosPorPlataforma.add(no.location);
      pendentesDoRamo.push(...no.to);
    }
  };
  const ausentes = raizes.filter(
    ({ localizacao }) =>
      !porLocalizacao.has(resolverLocalizacaoDeLink(localizacao, links)),
  );
  if (ausentes.length) {
    throw new Error(
      `npm query nao devolveu as raizes do grafo virtual do lockfile: ${ausentes
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
    const localizacaoAlvo = resolverLocalizacaoDeLink(localizacao, links);
    const no = porLocalizacao.get(localizacaoAlvo);
    if (!no) {
      throw new Error(
        `npm query devolveu relacao para localizacao sem no utilizavel: ${localizacao}` +
          (localizacaoAlvo !== localizacao ? ` -> ${localizacaoAlvo}` : ""),
      );
    }

    // O npm marca como optional tanto a dependencia opcional quanto os filhos
    // alcancados exclusivamente por ela. A compatibilidade, porem, pertence ao
    // caminho: se o ancestral opcional nao e instalavel no alvo, nenhuma aresta
    // abaixo dele existe no artefato. O Arborist fornece as arestas e o
    // npm-install-checks decide a plataforma; o gate apenas poda esse ramo.
    if (filtrarPlataforma) {
      const chaveDaEntrada = Object.hasOwn(packages, localizacao)
        ? localizacao
        : localizacaoAlvo;
      const entrada = packages[chaveDaEntrada];
      if (!entrada) {
        throw new Error(
          `npm query devolveu ${localizacao}, mas o package-lock nao possui metadados para ${chaveDaEntrada}`,
        );
      }
      const resolvida = resolverEntradaNpm(packages, chaveDaEntrada, entrada);
      if (resolvida.erro) throw new Error(resolvida.erro);
      if (plataformaExcluidaNpm(resolvida.meta, alvo)) {
        if (!ehOpcionalEmProducaoNpm(resolvida.meta)) {
          throw new Error(
            `${localizacao}: dependencia obrigatoria e incompativel com a plataforma-alvo`,
          );
        }
        registrarRamoExcluido(localizacao);
        continue;
      }
    }
    alcance.add(localizacao);
    alcance.add(localizacaoAlvo);
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
  packages,
  alvo,
  excluidosPorPlataforma,
}) {
  return derivarAlcanceNpm({
    arvore: consultarArvoreNpm({ raiz, caminhoDoNpm }),
    raizes,
    comDescendentes,
    links,
    packages,
    alvo,
    excluidosPorPlataforma,
  });
}
