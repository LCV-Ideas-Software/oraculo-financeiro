// Politica de avisos de terceiros do artefato distribuido.
//
// Declara, de forma congelada e auditavel, os textos de licenca que precisam
// acompanhar o site publicado e nao podem ser extraidos do artefato baixado,
// porque o publicador nao os inclui. Cada entrada registra o motivo, a origem
// imutavel e a revisao exata de onde o texto veio.
//
// A forma segue o padrao ja usado na frota em astrologo-app/scripts/legal e
// maestro-app/scripts/legal.
//
// Registro tecnico de compliance; nao constitui parecer juridico.

export const POLICY = Object.freeze({
  project: Object.freeze({
    sourceRepository: "https://github.com/LCV-Ideas-Software/oraculo-financeiro",
  }),

  // O verificador cruza este contrato com Gemfile, Gemfile.lock e o inventario.
  // Um bump nativo do Dependabot nao pode trocar o detector sem obrigar a
  // revalidacao das excecoes de texto abaixo.
  licenseTextMatcher: Object.freeze({
    gem: "licensee",
    version: "10.1.0",
  }),

  // Universo coberto: o que e servido ao navegador. Dependencia de
  // desenvolvimento nao chega ao usuario e nao gera obrigacao de aviso; a
  // marcacao `dev` do proprio npm e a fonte, nao uma heuristica nossa.
  scope: Object.freeze({
    npm: Object.freeze({
      lock: "package-lock.json",
      excludeDevMarker: "dev",

      // Ferramentas de build que INJETAM codigo proprio no artefato servido.
      // A marcacao `dev` do lockfile diz de onde a dependencia foi alcancada,
      // nao se ela contribui codigo para o bundle — e o bundler contribui.
      //
      // Verificado no `dist/assets/*.js` construido em 30/08/2026: o polyfill
      // de modulepreload do Vite esta la, como IIFE que testa
      // `relList.supports("modulepreload")`, varre `link[rel="modulepreload"]`
      // e instala um MutationObserver. Isso e codigo de autoria do Vite sendo
      // distribuido, e ficava fora dos avisos enquanto o arquivo afirmava
      // cobrir tudo que e servido.
      //
      // Cada entrada aqui e incluida apesar da marcacao `dev`, com a razao
      // registrada. A lista e explicita de proposito: adivinhar qual ferramenta
      // injeta runtime seria pior do que declarar.
      runtimeInjectingBuildTools: Object.freeze({
        vite: Object.freeze({
          reason:
            "Injeta o polyfill de modulepreload no ponto de entrada do navegador. `build.modulePreload.polyfill` esta no padrao documentado, que e ativo.",
          evidence:
            "IIFE presente em dist/assets/index-*.js, verificada em 30/08/2026.",
        }),
      }),

      // Raizes de producao que rodam SO no servidor — Cloudflare Pages
      // Functions — e nunca entram no bundle do navegador. Elas e tudo o que
      // so e alcancavel a partir delas recebem escopo "servidor" nos avisos;
      // o alcance e calculado pelo npm query, nao por travessia propria.
      //
      // Verificado em 30/08/2026: `sanitize-html` e importado apenas por
      // functions/api/_shared/security.ts; nenhum arquivo em src/ o importa,
      // e src/ so importa react, react-dom e lucide-react de terceiros.
      serverOnlyRoots: Object.freeze({
        "sanitize-html": Object.freeze({
          reason:
            "Sanitiza entrada nas Pages Functions. Nenhum modulo de src/ o importa, entao ele e sua arvore nao entram no bundle do navegador.",
          evidence:
            "grep -rn sanitize-html src/ functions/ em 30/08/2026: uma unica ocorrencia, em functions/api/_shared/security.ts.",
        }),
      }),

      // Plataforma de referencia para os campos `os`, `cpu` e `libc` do npm.
      // O artefato aqui e um bundle de navegador, construido no runner Linux
      // do deploy: pacote nativo restrito a outra plataforma nao e instalado e
      // nao entra no bundle.
      targetOs: "linux",
      targetCpu: "x64",
      targetLibc: "glibc",
    }),
  }),

  // Duas copias byte-identicas, como ja faz o gate de inventario deste
  // repositorio: a da raiz e a que o Vite publica a partir de public/.
  outputs: Object.freeze({
    notices: Object.freeze([
      "THIRD-PARTY-NOTICES.txt",
      "public/legal/THIRD-PARTY-NOTICES.txt",
    ]),
  }),

  // Casar por nome exato nao funciona: os publicadores usam formas muito
  // diferentes para o mesmo arquivo. O criterio e o prefixo, sem diferenciar
  // maiusculas, aceitando qualquer sufixo e extensao.
  //
  // Arquivos que CARREGAM o texto da licenca. Pelo menos um deles, ou um
  // fallback declarado, e obrigatorio para cada componente distribuido.
  licenseFilePrefixes: Object.freeze([
    "license",
    "licence",
    "copying",
    "unlicense",
  ]),

  // Arquivos SUPLEMENTARES. Sao incluidos nos avisos quando existem, mas nunca
  // satisfazem sozinhos a exigencia acima: um NOTICE da Apache-2.0 e material
  // adicional exigido pela clausula 4(d), nao o texto da licenca. Aceitar um
  // NOTICE isolado como suficiente deixaria passar um componente sem licenca.
  supplementalFilePrefixes: Object.freeze(["notice"]),

  // Extensoes que nao carregam o texto da licenca e portanto nao contam como
  // aviso, mesmo quando o nome comeca com um dos prefixos acima.
  licenseFileIgnoredExtensions: Object.freeze([".spdx", ".json", ".xml"]),

  // Eleicao de licenca em expressoes de escolha.
  //
  // Quando um componente oferece mais de uma licenca, e preciso dizer qual foi
  // eleita: e isso que determina as obrigacoes assumidas. A ordem abaixo e a
  // preferencia declarada do projeto, aplicada do primeiro termo que casar.
  //
  // A eleicao automatica so vale para as duas formas triviais e inequivocas:
  // uma disjuncao plana (`A OR B OR C`) e a forma legada do Cargo (`A/B`).
  // Qualquer outra expressao — com parenteses, com AND, com WITH — precisa de
  // entrada em `licenseElections`, senao o gate reprova. Nao ha aqui um parser
  // de SPDX escrito a mao: formas nao triviais nao sao interpretadas, sao
  // recusadas.
  // A preferencia so escolhe uma alternativa que satisfaca a expressao. O texto
  // dessa alternativa ainda precisa ser reconhecido exatamente pelo Licensee,
  // ou estar preso a uma revisao imutavel por artefato e sha256 abaixo.
  licenseElectionPreference: Object.freeze([
    "MIT",
    "ISC",
    "BSD-3-Clause",
    "Apache-2.0",
    "Unlicense",
    "Zlib",
  ]),

  // Variantes integrais que o detector oficial do GitHub nao classifica com o
  // matcher Exact. Cada excecao e selecionada pela identidade completa do
  // artefato e fixa o conjunto e sha256 dos arquivos revisados. Similaridade,
  // titulo, URL ou marcador isolado nunca satisfazem o gate.
  licenseTextReviewOverrides: Object.freeze({
    "domelementtype@3.0.0": Object.freeze({
      ecosystem: "npm",
      source:
        "https://registry.npmjs.org/domelementtype/-/domelementtype-3.0.0.tgz",
      integrity:
        "sha512-umCQid3jKbDmVjx8jGaW7uUykm4DEUeyV21hPxNMo2nV955DhUThwqyOIDtreepP31hl84X7G5U9ZfsWvIB3Pg==",
      licenses: Object.freeze(["BSD-2-Clause"]),
      files: Object.freeze({
        LICENSE:
          "cb992345949ccd6e8394b2cd6c465f7b897c864f845937dbf64e8997f389e164",
      }),
      referenceUrls: Object.freeze([
        "https://spdx.org/licenses/BSD-2-Clause.html",
      ]),
      rationale:
        "O Licensee devolve NOASSERTION para a variante integral publicada pelo upstream, que omite a palavra SOFTWARE na abertura do disclaimer. As duas condicoes de redistribuicao e o disclaimer foram conferidos contra a referencia oficial SPDX em 30/08/2026; qualquer mudanca de bytes reprova.",
    }),
    "domhandler@6.0.1": Object.freeze({
      ecosystem: "npm",
      source: "https://registry.npmjs.org/domhandler/-/domhandler-6.0.1.tgz",
      integrity:
        "sha512-gYzvtM72ZtxQO0T048kd6HWSbbGCNOUwcnfQ01cqIJ4X2IYKFFHZ5mKvrQETcFXxsRObZulDaKmy//R7TPtsBg==",
      licenses: Object.freeze(["BSD-2-Clause"]),
      files: Object.freeze({
        LICENSE:
          "cb992345949ccd6e8394b2cd6c465f7b897c864f845937dbf64e8997f389e164",
      }),
      referenceUrls: Object.freeze([
        "https://spdx.org/licenses/BSD-2-Clause.html",
      ]),
      rationale:
        "O Licensee devolve NOASSERTION para a variante integral publicada pelo upstream, que omite a palavra SOFTWARE na abertura do disclaimer. As duas condicoes de redistribuicao e o disclaimer foram conferidos contra a referencia oficial SPDX em 30/08/2026; qualquer mudanca de bytes reprova.",
    }),
    "domutils@4.0.2": Object.freeze({
      ecosystem: "npm",
      source: "https://registry.npmjs.org/domutils/-/domutils-4.0.2.tgz",
      integrity:
        "sha512-qI4JLRKnSzqFqr7hAlS5xQDusBCjKSEG4t4+7aNrIQMHBcsC2TGEhuyABJdYkgSewL57PNLYEiibY2iPKhKpaA==",
      licenses: Object.freeze(["BSD-2-Clause"]),
      files: Object.freeze({
        LICENSE:
          "cb992345949ccd6e8394b2cd6c465f7b897c864f845937dbf64e8997f389e164",
      }),
      referenceUrls: Object.freeze([
        "https://spdx.org/licenses/BSD-2-Clause.html",
      ]),
      rationale:
        "O Licensee devolve NOASSERTION para a variante integral publicada pelo upstream, que omite a palavra SOFTWARE na abertura do disclaimer. As duas condicoes de redistribuicao e o disclaimer foram conferidos contra a referencia oficial SPDX em 30/08/2026; qualquer mudanca de bytes reprova.",
    }),
    "entities@8.0.0": Object.freeze({
      ecosystem: "npm",
      source: "https://registry.npmjs.org/entities/-/entities-8.0.0.tgz",
      integrity:
        "sha512-zwfzJecQ/Uej6tusMqwAqU/6KL2XaB2VZ2Jg54Je6ahNBGNH6Ek6g3jjNCF0fG9EWQKGZNddNjU5F1ZQn/sBnA==",
      licenses: Object.freeze(["BSD-2-Clause"]),
      files: Object.freeze({
        LICENSE:
          "cb992345949ccd6e8394b2cd6c465f7b897c864f845937dbf64e8997f389e164",
      }),
      referenceUrls: Object.freeze([
        "https://spdx.org/licenses/BSD-2-Clause.html",
      ]),
      rationale:
        "O Licensee devolve NOASSERTION para a variante integral publicada pelo upstream, que omite a palavra SOFTWARE na abertura do disclaimer. As duas condicoes de redistribuicao e o disclaimer foram conferidos contra a referencia oficial SPDX em 30/08/2026; qualquer mudanca de bytes reprova.",
    }),
    "lucide-react@1.34.0": Object.freeze({
      ecosystem: "npm",
      source:
        "https://registry.npmjs.org/lucide-react/-/lucide-react-1.34.0.tgz",
      integrity:
        "sha512-vnjGJNI7Htk5+oWW8gXGuaLgwgAb0T6/iZbBrp9JCfRFwdNWZ0YTm3eyxjOLgwN6r8iyAf3UA70zNmBRBNv7yg==",
      licenses: Object.freeze(["ISC", "MIT"]),
      files: Object.freeze({
        LICENSE:
          "b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57",
      }),
      referenceUrls: Object.freeze([
        "https://spdx.org/licenses/ISC.html",
        "https://spdx.org/licenses/MIT.html",
      ]),
      rationale:
        "O arquivo integral agrega a ISC declarada pelo pacote e a MIT dos icones derivados do Feather, portanto nao e correspondencia exata de uma unica licenca para o Licensee. As duas secoes foram conferidas contra as referencias oficiais SPDX em 30/08/2026; qualquer mudanca de bytes reprova.",
    }),
    "source-map-js@1.2.1": Object.freeze({
      ecosystem: "npm",
      source:
        "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.1.tgz",
      integrity:
        "sha512-UXWMKhLOwVKb728IUtQPXxfYU+usdybtUrK/8uGE8CQMvrhOpwvzDBwj0QhSL7MQc7vIsISBG8VQ8+IDQxpfQA==",
      licenses: Object.freeze(["BSD-3-Clause"]),
      files: Object.freeze({
        LICENSE:
          "6cb0631f71c7749763fd3dd1d5bee52dd1070ec17f2edc1710079ad070bd2fbd",
      }),
      referenceUrls: Object.freeze([
        "https://spdx.org/licenses/BSD-3-Clause.html",
      ]),
      rationale:
        "O Licensee devolve NOASSERTION para a variante integral com atribuicao Mozilla e marcadores de lista. As tres condicoes e o disclaimer foram conferidos contra a referencia oficial SPDX em 30/08/2026; qualquer mudanca de bytes reprova.",
    }),
    "vite@8.2.2": Object.freeze({
      ecosystem: "npm",
      source: "https://registry.npmjs.org/vite/-/vite-8.2.2.tgz",
      integrity:
        "sha512-cFKLV/PRgAUlIRm5WjMjJ86jrftzpqcgH+Us+DS8mI3CDNiH30Whrz8uHL3+MOLPAgqbMBAqWdAHAphOAM+z/Q==",
      licenses: Object.freeze([
        "MIT",
        "Apache-2.0",
        "BSD-2-Clause",
        "CC0-1.0",
        "ISC",
      ]),
      files: Object.freeze({
        "LICENSE.md":
          "387dd7baa307083401a27c58c362c30832f5ba1dba84f10cc22c33401523f45c",
      }),
      referenceUrls: Object.freeze([
        "https://spdx.org/licenses/MIT.html",
      ]),
      rationale:
        "O arquivo integral agrega a MIT do Vite e os avisos completos das dependencias incorporadas, portanto nao e correspondencia exata de uma unica licenca para o Licensee. A secao do Vite foi conferida contra a referencia oficial SPDX e o agregado foi preservado integralmente em 30/08/2026; qualquer mudanca de bytes reprova.",
    }),
  }),

  // Eleicoes explicitas, por `<nome>@<versao>`. Necessarias para toda
  // expressao que nao seja uma das duas formas triviais.
  //
  // Cada registro inclui `ecosystem`, `source` e `integrity` exata. `null` so
  // e permitido quando `source` e uma origem Git presa a um commit completo de
  // 40 hexadecimais. O valor pode ser objeto unico ou lista; first-wins e
  // proibido. `expression` e conferida contra o pacote atual.
  licenseElections: Object.freeze({}),

  // Excecoes de metadado nao-SPDX ou ausente, por `<nome>@<versao>`. Cada uma
  // exige inspecao manual versionada. Para metadado ausente, use
  // `declared: null`; para texto nao analisavel, copie o valor literal. A
  // entrada tambem precisa registrar `identifiedLicense` (um termo SPDX
  // concreto), `rationale`, `ecosystem`, `source` exatamente como o `resolved`
  // do lockfile e `integrity` exata (`null` apenas para Git em commit completo).
  // O valor pode ser uma lista para representar origens homonimas sem
  // first-wins. A excecao nao substitui uma declaracao SPDX valida.
  unverifiableLicenseDeclarations: Object.freeze({}),

  // Texto vendorizado. O sha256 e do arquivo inteiro, cabecalho de proveniencia
  // incluido, e e conferido em tempo de execucao: editar o fragmento sem
  // atualizar a politica reprova o gate.
  fragments: Object.freeze({
    launderMit: Object.freeze({
      path: "scripts/legal/launder-mit.txt",
      sha256: "5c444aa58073b05e4b6bb4991b7348cbaa6da00149c56572a931be93b3b87dbc",
    }),
  }),

  // Componentes cujo pacote publicado nao traz o texto. A chave e
  // `<nome>@<versao>`: fixar a versao impede que a excecao sobreviva em
  // silencio a uma atualizacao de dependencia.
  licenseFallbacks: Object.freeze({
    "launder@1.7.1": Object.freeze({
      ecosystem: "npm",
      source:
        "https://registry.npmjs.org/launder/-/launder-1.7.1.tgz",
      integrity:
        "sha512-mU6WRz5EusL9ZZuiZ5SO4Y6C0P9PAUR9iwdb6bzj4KDihm28DiHFw+/yk9DBH4f+Pv1wuzQ4e2jV3oQ7mkIqvw==",
      license: "MIT",
      fragments: Object.freeze(["launderMit"]),
      sourceRepository: "https://github.com/apostrophecms/apostrophe",
      revision: "e9b0ab0849a5dfea0f75335fbdf99b5c6bf9e4b3",
      revisionSource: "commit inspecionado em 30/08/2026",
      licensePaths: Object.freeze([]),
      copyrightHolder: "Apostrophe Technologies, Inc.",
      copyrightBasis:
        "Campo author do package.json publicado. O upstream nao declara ano, e por isso o ano nao consta.",
      rationale:
        "O pacote npm nao inclui arquivo de licenca e o README nao menciona licenca. No commit fixado o monorepo tampouco publica LICENSE, LICENSE.md ou LICENSE.txt na raiz nem em packages/launder, e a API do GitHub nao detecta licenca no repositorio. Texto canonico da MIT com a linha de copyright do titular declarado. Mesmo tratamento ja adotado na frota para este pacote e versao em astrologo-app, reverificado aqui de forma independente.",
    }),
  }),
});

export default POLICY;
