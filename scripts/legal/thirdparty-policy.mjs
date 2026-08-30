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
  licenseFilePrefixes: Object.freeze([
    "license",
    "licence",
    "copying",
    "notice",
    "unlicense",
  ]),

  // Extensoes que nao carregam o texto da licenca e portanto nao contam como
  // aviso, mesmo quando o nome comeca com um dos prefixos acima.
  licenseFileIgnoredExtensions: Object.freeze([".spdx", ".json", ".xml"]),

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
