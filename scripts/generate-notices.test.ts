import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import spdxParse from "spdx-expression-parse";

import {
  identidadeDoArtefatoEhImutavel,
  selecionarRegistroDoArtefato,
} from "./legal/artifact-policy.mjs";
import { corroborarTextosDeLicenca } from "./legal/license-text.mjs";
import {
  alcanceNoGrafoNpm,
  consultarArvoreNpm,
  criarComponenteNpm,
  descreverRaizNpm,
  derivarAlcanceNpm,
  ehEntradaInstaladaNpm,
  ehLinkDiretoDaRaizNpm,
  ehOpcionalEmProducaoNpm,
  mapaDeLinksNpm,
  mesclarOcorrenciaNpm,
  nomesDasRaizesDeProducaoNpm,
  plataformaExcluidaNpm,
  resolverEntradaNpm,
} from "./legal/npm-reachability.mjs";
import { expressaoTemDisjuncao } from "./legal/spdx-election.mjs";
import { validarInspecaoManual } from "./legal/unverifiable-license.mjs";

const dirs: string[] = [];

const escreverJson = (caminho: string, valor: unknown) => {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, `${JSON.stringify(valor, null, 2)}\n`);
};

const caminhoDoNpm = () => {
  const candidatos = [
    process.env.npm_execpath,
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    join(
      dirname(process.execPath),
      "..",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    ),
  ].filter((valor): valor is string => Boolean(valor));
  const encontrado = candidatos.find((candidato) => existsSync(candidato));
  if (!encontrado)
    throw new Error(`npm CLI não encontrado: ${candidatos.join(", ")}`);
  return encontrado;
};

const criarArvoreNpm = () => {
  const raiz = mkdtempSync(join(tmpdir(), "notices-npm-tree-"));
  dirs.push(raiz);
  escreverJson(join(raiz, "package.json"), {
    name: "fixture-notices",
    version: "1.0.0",
    dependencies: {
      "alias-root": "npm:real-alias@1.0.0",
      "linked-root": "file:packages/linked-root",
      "platform-root": "1.0.0",
    },
  });
  const packages = {
    "": {
      name: "fixture-notices",
      version: "1.0.0",
      dependencies: {
        "alias-root": "npm:real-alias@1.0.0",
        "linked-root": "file:packages/linked-root",
        "platform-root": "1.0.0",
      },
    },
    "node_modules/alias-root": {
      name: "real-alias",
      version: "1.0.0",
      resolved: "https://registry.npmjs.org/real-alias/-/real-alias-1.0.0.tgz",
      dependencies: { "alias-child": "1.0.0" },
    },
    "node_modules/alias-root/node_modules/alias-child": {
      name: "alias-child",
      version: "1.0.0",
      resolved:
        "https://registry.npmjs.org/alias-child/-/alias-child-1.0.0.tgz",
    },
    "node_modules/linked-root": {
      resolved: "packages/linked-root",
      link: true,
    },
    "packages/linked-root": {
      name: "real-linked-package",
      version: "1.0.0",
      dependencies: { "linked-child": "file:../linked-child" },
    },
    "packages/linked-root/node_modules/linked-child": {
      resolved: "packages/linked-child",
      link: true,
    },
    "packages/linked-child": {
      name: "linked-child",
      version: "1.0.0",
    },
    "node_modules/platform-root": {
      name: "platform-root",
      version: "1.0.0",
      resolved:
        "https://registry.npmjs.org/platform-root/-/platform-root-1.0.0.tgz",
      optionalDependencies: {
        "linux-child": "1.0.0",
        "windows-child": "1.0.0",
      },
    },
    "node_modules/linux-child": {
      name: "linux-child",
      version: "1.0.0",
      resolved:
        "https://registry.npmjs.org/linux-child/-/linux-child-1.0.0.tgz",
      optional: true,
      os: ["linux"],
    },
    "node_modules/windows-child": {
      name: "windows-child",
      version: "1.0.0",
      resolved:
        "https://registry.npmjs.org/windows-child/-/windows-child-1.0.0.tgz",
      optional: true,
      os: ["win32"],
    },
  };
  escreverJson(join(raiz, "package-lock.json"), {
    name: "fixture-notices",
    version: "1.0.0",
    lockfileVersion: 3,
    packages,
  });

  escreverJson(join(raiz, "node_modules", "alias-root", "package.json"), {
    name: "real-alias",
    version: "1.0.0",
    dependencies: { "alias-child": "1.0.0" },
  });
  escreverJson(
    join(
      raiz,
      "node_modules",
      "alias-root",
      "node_modules",
      "alias-child",
      "package.json",
    ),
    { name: "alias-child", version: "1.0.0" },
  );

  const alvoDoLink = join(raiz, "packages", "linked-root");
  escreverJson(join(alvoDoLink, "package.json"), {
    name: "real-linked-package",
    version: "1.0.0",
    dependencies: { "linked-child": "file:../linked-child" },
  });
  const alvoDoFilho = join(raiz, "packages", "linked-child");
  escreverJson(join(alvoDoFilho, "package.json"), {
    name: "linked-child",
    version: "1.0.0",
  });
  mkdirSync(join(alvoDoLink, "node_modules"), { recursive: true });
  symlinkSync(
    alvoDoFilho,
    join(alvoDoLink, "node_modules", "linked-child"),
    process.platform === "win32" ? "junction" : "dir",
  );
  mkdirSync(join(raiz, "node_modules"), { recursive: true });
  symlinkSync(
    alvoDoLink,
    join(raiz, "node_modules", "linked-root"),
    process.platform === "win32" ? "junction" : "dir",
  );
  return { raiz, packages };
};

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("alcance oficial do npm para avisos", () => {
  it("consulta o grafo virtual do lock e filtra pela plataforma do artefato, não pelo host", () => {
    const { raiz, packages } = criarArvoreNpm();
    const arvore = consultarArvoreNpm({ raiz, caminhoDoNpm: caminhoDoNpm() });
    const localizacoes = new Set(arvore.map((no) => no.location));
    expect(localizacoes).toContain("node_modules/linux-child");
    expect(localizacoes).toContain("node_modules/windows-child");

    const alcanceLinux = derivarAlcanceNpm({
      arvore,
      raizes: [descreverRaizNpm(packages, "platform-root")],
      comDescendentes: true,
      packages,
      alvo: { targetOs: "linux", targetCpu: "x64", targetLibc: "glibc" },
    });
    expect(alcanceLinux).toContain("node_modules/platform-root");
    expect(alcanceLinux).toContain("node_modules/linux-child");
    expect(alcanceLinux).not.toContain("node_modules/windows-child");
  });

  it("preserva uma raiz alias e seus descendentes por localização instalada", () => {
    const { raiz, packages } = criarArvoreNpm();
    const alcance = alcanceNoGrafoNpm({
      raiz,
      caminhoDoNpm: caminhoDoNpm(),
      raizes: [descreverRaizNpm(packages, "alias-root")],
      comDescendentes: true,
    });
    expect(alcance).toContain("node_modules/alias-root");
    expect(alcance).toContain(
      "node_modules/alias-root/node_modules/alias-child",
    );
  });

  it("preserva uma raiz file: ligada e seus descendentes pelo alvo real", () => {
    const { raiz, packages } = criarArvoreNpm();
    const entrada = packages["node_modules/linked-root"];
    const resolvida = resolverEntradaNpm(
      packages,
      "node_modules/linked-root",
      entrada,
    );
    expect(resolvida.localizacoes).toEqual([
      "node_modules/linked-root",
      "packages/linked-root",
    ]);
    expect(resolvida.origem).toBe("packages/linked-root");
    const componente = criarComponenteNpm({
      nome: resolvida.meta.name,
      versao: resolvida.meta.version,
      meta: resolvida.meta,
      origem: resolvida.origem,
      localizacoes: resolvida.localizacoes,
      injetaRuntime: false,
      diretorio: join(raiz, "packages", "linked-root"),
    });
    expect(componente.origemPacote).toBe("packages/linked-root");
    const alcance = alcanceNoGrafoNpm({
      raiz,
      caminhoDoNpm: caminhoDoNpm(),
      raizes: [descreverRaizNpm(packages, "linked-root")],
      comDescendentes: true,
      links: mapaDeLinksNpm(packages),
    });
    expect(alcance).toContain("packages/linked-root");
    expect(alcance).toContain("packages/linked-root/node_modules/linked-child");
    expect(alcance).toContain("packages/linked-child");
  });

  it("falha fechado em ciclo de links do package-lock", () => {
    expect(() =>
      derivarAlcanceNpm({
        arvore: [],
        raizes: [{ nome: "a", localizacao: "node_modules/a" }],
        comDescendentes: true,
        links: new Map([
          ["node_modules/a", "packages/a"],
          ["packages/a", "node_modules/a"],
        ]),
      }),
    ).toThrow(/ciclo de links/u);
  });

  it("enumera link transitivo instalado sob uma raiz file: de produção", () => {
    const chave = "packages/prod-parent/node_modules/shared";
    const packages = {
      [chave]: {
        link: true,
        resolved: "packages/prod-shared",
      },
      "packages/prod-shared": {
        name: "shared",
        version: "2.0.0",
        license: "MIT",
      },
    };

    expect(ehEntradaInstaladaNpm(chave)).toBe(true);
    expect(ehEntradaInstaladaNpm("packages/prod-shared")).toBe(false);
    // Um homonimo direto pode existir apenas em devDependencies; isso nao
    // transforma o filho transitivo de producao em link dev da raiz.
    expect(ehLinkDiretoDaRaizNpm(chave, "shared")).toBe(false);
    expect(ehLinkDiretoDaRaizNpm("node_modules/shared", "shared")).toBe(true);
    const resolvida = resolverEntradaNpm(packages, chave, packages[chave]);
    expect(resolvida.localizacoes).toEqual([
      chave,
      "packages/prod-shared",
    ]);
    expect(
      criarComponenteNpm({
        nome: resolvida.meta.name,
        versao: resolvida.meta.version,
        meta: resolvida.meta,
        origem: resolvida.origem,
        localizacoes: resolvida.localizacoes,
        injetaRuntime: false,
        diretorio: "packages/prod-shared",
      }),
    ).toMatchObject({
      id: "shared@2.0.0",
      origemPacote: "packages/prod-shared",
      localizacoes: [chave, "packages/prod-shared"],
    });
  });

  it("mantém versões homônimas em alcances separados por localização", () => {
    const arvore = [
      {
        location: "node_modules/browser-root",
        to: ["node_modules/browser-root/node_modules/shared"],
      },
      {
        location: "node_modules/browser-root/node_modules/shared",
        to: [],
      },
      {
        location: "node_modules/server-root",
        to: ["node_modules/server-root/node_modules/shared"],
      },
      {
        location: "node_modules/server-root/node_modules/shared",
        to: [],
      },
    ];
    const navegador = derivarAlcanceNpm({
      arvore,
      raizes: [
        { nome: "browser-root", localizacao: "node_modules/browser-root" },
      ],
      comDescendentes: true,
    });
    const servidor = derivarAlcanceNpm({
      arvore,
      raizes: [
        { nome: "server-root", localizacao: "node_modules/server-root" },
      ],
      comDescendentes: true,
    });
    expect(navegador).toContain(
      "node_modules/browser-root/node_modules/shared",
    );
    expect(navegador).not.toContain(
      "node_modules/server-root/node_modules/shared",
    );
    expect(servidor).toContain("node_modules/server-root/node_modules/shared");
  });

  it("delega wildcard any e restrições ao npm-install-checks oficial", () => {
    const alvo = { targetOs: "linux", targetCpu: "x64", targetLibc: "glibc" };
    expect(
      plataformaExcluidaNpm({ os: ["any"], cpu: ["any"], libc: ["any"] }, alvo),
    ).toBe(false);
    expect(plataformaExcluidaNpm({ os: ["darwin"] }, alvo)).toBe(true);
  });

  it("falha fechado quando o alvo npm omite os, cpu ou libc", () => {
    expect(() =>
      plataformaExcluidaNpm({}, { targetCpu: "x64", targetLibc: "glibc" }),
    ).toThrow(/targetOs/u);
    expect(() =>
      plataformaExcluidaNpm({}, { targetOs: "linux", targetLibc: "glibc" }),
    ).toThrow(/targetCpu/u);
    expect(() =>
      plataformaExcluidaNpm({}, { targetOs: "linux", targetCpu: "x64" }),
    ).toThrow(/targetLibc/u);
  });

  it("resolve metadados do alvo antes de aplicar a plataforma ao link", () => {
    const packages = {
      "node_modules/optional-link": {
        link: true,
        optional: true,
        resolved: "packages/optional-link",
      },
      "packages/optional-link": {
        name: "optional-link",
        version: "1.0.0",
        os: ["darwin"],
      },
    };
    const resolvida = resolverEntradaNpm(
      packages,
      "node_modules/optional-link",
      packages["node_modules/optional-link"],
    );
    expect(resolvida.meta.optional).toBe(true);
    expect(
      plataformaExcluidaNpm(resolvida.meta, {
        targetOs: "linux",
        targetCpu: "x64",
        targetLibc: "glibc",
      }),
    ).toBe(true);
  });

  it("inclui optionalDependencies compatíveis entre as raízes de produção", () => {
    expect(
      nomesDasRaizesDeProducaoNpm({
        dependencies: { navegador: "1.0.0" },
        optionalDependencies: {
          "opcional-compativel": "1.0.0",
          navegador: "2.0.0",
        },
      }),
    ).toEqual(["navegador", "opcional-compativel"]);
  });

  it("poda raiz file: devOptional incompatível com todos os descendentes", () => {
    const packages = {
      "node_modules/opcional": {
        link: true,
        devOptional: true,
        resolved: "packages/opcional",
      },
      "packages/opcional": {
        name: "opcional",
        version: "1.0.0",
        os: ["darwin"],
      },
      "packages/opcional/node_modules/filho": {
        name: "filho",
        version: "1.0.0",
        devOptional: true,
      },
    };
    const excluidosPorPlataforma = new Set<string>();
    const alcance = derivarAlcanceNpm({
      arvore: [
        {
          location: "packages/opcional",
          to: ["packages/opcional/node_modules/filho"],
        },
        { location: "packages/opcional/node_modules/filho", to: [] },
      ],
      raizes: [descreverRaizNpm(packages, "opcional")],
      comDescendentes: true,
      links: mapaDeLinksNpm(packages),
      packages,
      alvo: { targetOs: "linux", targetCpu: "x64", targetLibc: "glibc" },
      excluidosPorPlataforma,
    });
    expect(alcance.size).toBe(0);
    expect(ehOpcionalEmProducaoNpm({ devOptional: true })).toBe(true);
    expect(ehOpcionalEmProducaoNpm({})).toBe(false);
    expect(excluidosPorPlataforma).toEqual(
      new Set([
        "node_modules/opcional",
        "packages/opcional",
        "packages/opcional/node_modules/filho",
      ]),
    );
  });

  it("poda os descendentes de um ramo opcional incompatível, mas preserva outro caminho", () => {
    const alvo = { targetOs: "linux", targetCpu: "x64", targetLibc: "glibc" };
    const packages = {
      "node_modules/app": { name: "app", version: "1.0.0" },
      "node_modules/optional-parent": {
        name: "optional-parent",
        version: "1.0.0",
        optional: true,
        os: ["win32"],
      },
      "node_modules/neutral-child": {
        name: "neutral-child",
        version: "1.0.0",
        optional: true,
      },
    };
    const arvore = [
      {
        location: "node_modules/app",
        to: ["node_modules/optional-parent"],
      },
      {
        location: "node_modules/optional-parent",
        to: ["node_modules/neutral-child"],
      },
      { location: "node_modules/neutral-child", to: [] },
    ];
    const excluidosPorPlataforma = new Set<string>();
    const parametros = {
      arvore,
      raizes: [{ nome: "app", localizacao: "node_modules/app" }],
      comDescendentes: true,
      packages,
      alvo,
      excluidosPorPlataforma,
    };

    const somentePeloRamoIncompativel = derivarAlcanceNpm(parametros);
    expect(somentePeloRamoIncompativel).toContain("node_modules/app");
    expect(somentePeloRamoIncompativel).not.toContain(
      "node_modules/optional-parent",
    );
    expect(somentePeloRamoIncompativel).not.toContain(
      "node_modules/neutral-child",
    );
    expect(excluidosPorPlataforma).toContain("node_modules/optional-parent");
    expect(excluidosPorPlataforma).toContain("node_modules/neutral-child");

    const excluidosComCaminhoCompartilhado = new Set<string>();
    const compartilhado = derivarAlcanceNpm({
      ...parametros,
      arvore: [
        { ...arvore[0], to: [...arvore[0].to, "node_modules/neutral-child"] },
        ...arvore.slice(1),
      ],
      excluidosPorPlataforma: excluidosComCaminhoCompartilhado,
    });
    expect(compartilhado).not.toContain("node_modules/optional-parent");
    expect(compartilhado).toContain("node_modules/neutral-child");
    expect(excluidosComCaminhoCompartilhado).toContain(
      "node_modules/neutral-child",
    );
  });

  it("falha fechado para dependência obrigatória incompatível no grafo", () => {
    expect(() =>
      derivarAlcanceNpm({
        arvore: [
          {
            location: "node_modules/app",
            to: ["node_modules/required-child"],
          },
          { location: "node_modules/required-child", to: [] },
        ],
        raizes: [{ nome: "app", localizacao: "node_modules/app" }],
        comDescendentes: true,
        packages: {
          "node_modules/app": { name: "app", version: "1.0.0" },
          "node_modules/required-child": {
            name: "required-child",
            version: "1.0.0",
            os: ["win32"],
          },
        },
        alvo: { targetOs: "linux", targetCpu: "x64", targetLibc: "glibc" },
      }),
    ).toThrow(/obrigatoria e incompativel/u);
  });

  it("não promove integridade de outra ocorrência para a primeira localização", () => {
    const base = criarComponenteNpm({
      nome: "duplicado",
      versao: "1.0.0",
      meta: { license: "MIT" },
      origem: "https://registry.npmjs.org/duplicado/-/duplicado-1.0.0.tgz",
      localizacoes: ["node_modules/a/node_modules/duplicado"],
      injetaRuntime: false,
      diretorio: "node_modules/a/node_modules/duplicado",
    });
    const comHash = criarComponenteNpm({
      nome: "duplicado",
      versao: "1.0.0",
      meta: { license: "MIT", integrity: "sha512-YWJjZA==" },
      origem: base.origemPacote,
      localizacoes: ["node_modules/b/node_modules/duplicado"],
      injetaRuntime: false,
      diretorio: "node_modules/b/node_modules/duplicado",
    });
    expect(mesclarOcorrenciaNpm(base, comHash)).toEqual({
      ok: false,
      tipo: "integridade-divergente",
    });
    expect(base.integridadePacote).toBeNull();
    expect(base.localizacoes).toEqual([
      "node_modules/a/node_modules/duplicado",
    ]);
  });
});

describe("inspeção manual de declaração de licença", () => {
  const componente = {
    ecossistema: "npm",
    id: "pacote-sem-metadado@1.0.0",
    licencaDeclarada: null,
    origemPacote:
      "https://registry.npmjs.org/pacote-sem-metadado/-/pacote-sem-metadado-1.0.0.tgz",
    integridadePacote:
      "sha512-mU6WRz5EusL9ZZuiZ5SO4Y6C0P9PAUR9iwdb6bzj4KDihm28DiHFw+/yk9DBH4f+Pv1wuzQ4e2jV3oQ7mkIqvw==",
  };
  const inspecionada = {
    ecosystem: "npm",
    declared: null,
    identifiedLicense: "MIT",
    source: componente.origemPacote,
    integrity: componente.integridadePacote,
    rationale: "LICENSE inspecionado manualmente e identificado como MIT.",
  };

  it("aceita identificação completa ligada ao artefato exato", () => {
    expect(validarInspecaoManual(componente, inspecionada)).toEqual([]);
  });

  it("rejeita a mesma exceção para nome e versão iguais vindos de outra origem", () => {
    const fork = {
      ...componente,
      origemPacote:
        "git+https://github.com/exemplo/fork.git#0123456789abcdef0123456789abcdef01234567",
      integridadePacote: null,
    };
    expect(validarInspecaoManual(fork, inspecionada).join("\n")).toMatch(
      /origem/u,
    );
  });

  it("não permite que inspeção manual substitua uma declaração SPDX válida", () => {
    const declarado = {
      ...componente,
      licencaDeclarada: "AGPL-3.0-only",
    };
    const politica = {
      ...inspecionada,
      declared: "AGPL-3.0-only",
      identifiedLicense: "MIT",
    };
    expect(validarInspecaoManual(declarado, politica).join("\n")).toMatch(
      /so e permitida.*SPDX valida/u,
    );
  });

  it("rejeita SRI com algoritmo válido e digest curto", () => {
    const curto = {
      ...componente,
      integridadePacote: "sha512-YWJjZA==",
    };
    const politica = {
      ...inspecionada,
      integrity: "sha512-YWJjZA==",
    };
    expect(validarInspecaoManual(curto, politica).join("\n")).toMatch(
      /SRI estrita e completa/u,
    );
  });

  it("não confunde fragmento sha40 de URL HTTP com revisão Git", () => {
    const origem =
      "https://downloads.example.invalid/pacote.tgz#0123456789abcdef0123456789abcdef01234567";
    const remoto = {
      ...componente,
      origemPacote: origem,
      integridadePacote: null,
    };
    const politica = {
      ...inspecionada,
      source: origem,
      integrity: null,
    };
    expect(validarInspecaoManual(remoto, politica).join("\n")).toMatch(
      /nao e uma revisao Git imutavel/u,
    );
  });

  it("aceita revisão Git fixada por sha40", () => {
    const origem =
      "git+https://github.com/exemplo/fork.git#0123456789abcdef0123456789abcdef01234567";
    const git = {
      ...componente,
      origemPacote: origem,
      integridadePacote: null,
    };
    const politica = {
      ...inspecionada,
      source: origem,
      integrity: null,
    };
    expect(validarInspecaoManual(git, politica)).toEqual([]);
  });

  it.each([
    [{ ...inspecionada, rationale: "   " }, /justificativa/u],
    [{ ...inspecionada, identifiedLicense: "" }, /licen.*identificada/u],
    [{ ...inspecionada, integrity: "sha512-ZGlmZXJlbnRl" }, /integridade/u],
  ])(
    "rejeita política incompleta ou sem identidade imutável",
    (politica, erro) => {
      expect(validarInspecaoManual(componente, politica).join("\n")).toMatch(
        erro,
      );
    },
  );

  it("seleciona por origem e integridade exatas sem first-wins", () => {
    const outraOrigem = {
      ...inspecionada,
      source: "https://registry.npmjs.org/outro/-/outro-1.0.0.tgz",
      integrity: componente.integridadePacote,
    };
    const selecao = selecionarRegistroDoArtefato(
      [outraOrigem, inspecionada],
      componente,
    );
    expect(selecao.ok).toBe(true);
    expect(selecao.registro).toBe(inspecionada);
  });

  it("rejeita políticas duplicadas para o mesmo artefato", () => {
    const selecao = selecionarRegistroDoArtefato(
      [inspecionada, { ...inspecionada }],
      componente,
    );
    expect(selecao).toMatchObject({
      ok: false,
      tipo: "politica-duplicada",
      quantidade: 2,
    });
  });

  it("rejeita componente sem identidade de integridade explícita", () => {
    const semIntegridade = { ...componente };
    Reflect.deleteProperty(semIntegridade, "integridadePacote");
    expect(
      selecionarRegistroDoArtefato(inspecionada, semIntegridade),
    ).toMatchObject({ ok: false, tipo: "politica-incompleta" });
  });

  it.each([
    ["packages/foo", null, false],
    ["file:../foo", null, false],
    ["git+https://github.com/exemplo/foo.git#main", null, false],
    [
      "https://registry.npmjs.org/foo/-/foo-1.0.0.tgz",
      null,
      false,
    ],
    [
      "git+https://github.com/exemplo/foo.git#0123456789abcdef0123456789abcdef01234567",
      null,
      true,
    ],
    ["packages/foo", "sha512-YWJjZA==", false],
    ["packages/foo", componente.integridadePacote, true],
  ])(
    "aceita somente digest ou revisão Git imutável (%s)",
    (source, integrity, esperado) => {
      expect(identidadeDoArtefatoEhImutavel({ source, integrity })).toBe(
        esperado,
      );
    },
  );

  it("rejeita uma política para diretório local que pode mudar mantendo a origem", () => {
    const mutavel = {
      ...componente,
      id: "foo@1.0.0",
      origemPacote: "packages/foo",
      integridadePacote: null,
    };
    const selecao = selecionarRegistroDoArtefato(
      {
        ...inspecionada,
        source: "packages/foo",
        integrity: null,
      },
      mutavel,
    );
    expect(selecao).toMatchObject({
      ok: false,
      tipo: "origem-mutavel-sem-integridade",
      encontrada: "packages/foo",
    });
  });
});

describe("corroboração oficial do texto de licença", () => {
  const relatorioExato = (licenca: string, texto: string) => ({
    status: 0,
    stdout: JSON.stringify({
      licenses: [{ spdx_id: licenca }],
      matched_files: [
        {
          content: `${texto}\n`,
          matched_license: licenca,
          matcher: { name: "exact", confidence: 100 },
        },
      ],
    }),
    stderr: "",
    erro: null,
  });
  const semCorrespondencia = {
    status: 0,
    stdout: JSON.stringify({
      licenses: [{ spdx_id: "NOASSERTION" }],
      matched_files: [{ matched_license: "NOASSERTION", matcher: null }],
    }),
    stderr: "",
    erro: null,
  };

  it("aceita somente o matcher Exact do Licensee com confiança 100", () => {
    const texto = "texto integral validado";
    const resultado = corroborarTextosDeLicenca({
      licencas: ["MIT"],
      textos: [
        {
          arquivo: "LICENSE",
          caminho: "C:/fixture/LICENSE",
          portador: true,
          texto,
          sha256: "a".repeat(64),
        },
      ],
      executar: () => relatorioExato("MIT", texto),
    });
    expect(resultado).toMatchObject({ ok: true, metodo: "Licensee Exact 100" });
  });

  it("rejeita similaridade, mesmo quando a confiança declarada é 100", () => {
    const texto = "texto quase igual";
    const similar = relatorioExato("MIT", texto);
    const relatorio = JSON.parse(similar.stdout);
    relatorio.matched_files[0].matcher.name = "similarity";
    similar.stdout = JSON.stringify(relatorio);
    expect(
      corroborarTextosDeLicenca({
        licencas: ["MIT"],
        textos: [
          {
            arquivo: "LICENSE",
            caminho: "C:/fixture/LICENSE",
            portador: true,
            texto,
            sha256: "a".repeat(64),
          },
        ],
        executar: () => similar,
      }).ok,
    ).toBe(false);
  });

  it("rejeita título, ponteiro ou marcador isolado não reconhecido", () => {
    expect(
      corroborarTextosDeLicenca({
        licencas: ["Apache-2.0"],
        textos: [
          {
            arquivo: "LICENSE",
            caminho: "C:/fixture/LICENSE",
            portador: true,
            texto: "Apache License 2.0",
            sha256: "a".repeat(64),
          },
        ],
        executar: () => semCorrespondencia,
      }).ok,
    ).toBe(false);
  });

  it("aceita licenças conjuntivas comprovadas por arquivos separados", () => {
    const textos = [
      {
        arquivo: "LICENSE-BSD-2",
        caminho: "C:/fixture/LICENSE-BSD-2",
        portador: true,
        texto: "BSD 2 integral",
        sha256: "a".repeat(64),
      },
      {
        arquivo: "LICENSE-BSD-3",
        caminho: "C:/fixture/LICENSE-BSD-3",
        portador: true,
        texto: "BSD 3 integral",
        sha256: "b".repeat(64),
      },
    ];
    const resultado = corroborarTextosDeLicenca({
      licencas: ["BSD-2-Clause", "BSD-3-Clause"],
      textos,
      executar: ({ caminho, licenca }) =>
        caminho.endsWith(licenca === "BSD-2-Clause" ? "BSD-2" : "BSD-3")
          ? relatorioExato(
              licenca,
              licenca === "BSD-2-Clause" ? "BSD 2 integral" : "BSD 3 integral",
            )
          : semCorrespondencia,
    });
    expect(resultado.ok).toBe(true);
  });

  it("prende a exceção revisada ao conjunto e sha256 exatos", () => {
    const base = {
      licencas: ["BSD-2-Clause"],
      textos: [
        {
          arquivo: "LICENSE",
          caminho: "C:/fixture/LICENSE",
          portador: true,
          texto: "variante revisada",
          sha256: "a".repeat(64),
        },
      ],
      revisao: {
        licenses: ["BSD-2-Clause"],
        rationale: "Variante integral revisada contra a licença oficial.",
        files: { LICENSE: "a".repeat(64) },
      },
    };
    expect(corroborarTextosDeLicenca(base).ok).toBe(true);
    expect(
      corroborarTextosDeLicenca({
        ...base,
        textos: [{ ...base.textos[0], sha256: "b".repeat(64) }],
      }).ok,
    ).toBe(false);
  });
});

describe("semântica da eleição SPDX", () => {
  it("rejeita uma eleição que ainda contém OR", () => {
    expect(expressaoTemDisjuncao(spdxParse("MIT OR Apache-2.0"))).toBe(true);
    expect(expressaoTemDisjuncao(spdxParse("MIT AND Apache-2.0"))).toBe(false);
  });
});
