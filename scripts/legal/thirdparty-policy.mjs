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
  // So entram aqui identificadores cujo texto e distinguivel dos demais por um
  // marcador proprio. MIT-0 e 0BSD ficaram DE FORA de proposito: diferem de MIT
  // e de ISC por uma clausula que o outro tem e eles nao, e ausencia nao se
  // detecta com busca de trecho. Expressao que so ofereca esses exige eleicao
  // explicita. BSD-2-Clause ficou de fora pelo mesmo motivo: o BSD-3-Clause e o
  // texto do BSD-2 mais a clausula de nao-endosso, entao todo marcador do BSD-2
  // aparece tambem no BSD-3, e um pacote que oferecesse os dois e empacotasse
  // so o BSD-3 corroboraria BSD-2 falsamente.
  licenseElectionPreference: Object.freeze([
    "MIT",
    "ISC",
    "BSD-3-Clause",
    "Apache-2.0",
    "Unlicense",
    "Zlib",
  ]),

  // Corroboracao da eleicao pelo texto efetivamente reproduzido.
  //
  // Eleger uma licenca cujo texto nao acompanha o artefato produz uma afirmacao
  // falsa. Cada identificador elegivel declara aqui um trecho caracteristico do
  // CORPO da sua propria licenca, e a eleicao so vale se ao menos um deles
  // aparecer no que foi reproduzido.
  //
  // Os trechos precisam existir so no corpo. Frases como "Apache License"
  // aparecem tambem em arquivos que apenas APONTAM para a licenca sem
  // reproduzi-la, e aceitar isso faria o gate corroborar um ponteiro.
  //
  // Isto nao e deteccao de licenca: e uma tabela declarada e auditavel. Um
  // identificador sem marcador nao pode ser eleito, e o gate diz isso em vez de
  // aceitar em silencio.
  licenseTextMarkers: Object.freeze({
    // A clausula de atribuicao e o que separa MIT de MIT-0, e ISC de 0BSD: as
    // primeiras exigem que o aviso acompanhe as copias, as segundas nao. Usar
    // a frase de abertura, comum as duas, faria uma corroborar a outra.
    MIT: Object.freeze([
      "The above copyright notice and this permission notice shall be included",
    ]),
    "Apache-2.0": Object.freeze([
      "TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION",
    ]),
    "BSD-2-Clause": Object.freeze([
      "Redistributions of source code must retain the above copyright notice",
    ]),
    "BSD-3-Clause": Object.freeze(["Neither the name of"]),
    ISC: Object.freeze([
      "provided that the above copyright notice and this permission notice appear in all copies",
    ]),
    "CC0-1.0": Object.freeze(["CC0 1.0 Universal", "Creative Commons Legal Code"]),
    Unlicense: Object.freeze([
      "This is free and unencumbered software released into the public domain",
    ]),
    Zlib: Object.freeze([
      "altered source versions must be plainly marked",
    ]),
    "MPL-2.0": Object.freeze(["Mozilla Public License"]),
    "BSL-1.0": Object.freeze(["Boost Software License"]),
  }),

  // Eleicoes explicitas, por `<nome>@<versao>`. Necessarias para toda
  // expressao que nao seja uma das duas formas triviais.
  //
  // `expression` e conferida contra o que o pacote declara: entrada obsoleta ou
  // com erro de digitacao reprova em vez de aplicar uma escolha que o pacote
  // nunca ofereceu.
  licenseElections: Object.freeze({}),

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
