# AGENTS.md - oraculo-financeiro

Pointer for AI agents working in this repository.

## Project

- Repository: `https://github.com/LCV-Ideas-Software/oraculo-financeiro`
- App: Oraculo Financeiro — dashboard de analise de renda fixa indexada a inflacao
- Branch: `main`
- License: AGPL-3.0-or-later

## Runtime Shape

React 19 + Vite 8 single-page app on Cloudflare Pages with a D1 backing store and an
auxiliary Cron Worker for rate-cache pre-warming. Source lives in `src/`, Pages
Functions in `functions/`, and the Cron Worker in `workers/taxaipca-motor/`.
Both official Wrangler configurations select the existing D1 database. The
separate GitHub Pages site is built from `site/`.

## Mandatory Gates

```bash
npm test
npm run lint
npm run biome
npm run build
npm run format:public:check
```

## Workspace Policy

The current Enterprise/Organization reform standard supersedes earlier local
governance instructions. Follow the workspace-root `AGENTS.md` directives:
official native solutions, independent repositories, Ultrabrain for substantive
reasoning and cross-review only where complexity warrants it. Do not introduce
custom gates, controllers or mandatory human/AI reviews of Dependabot PRs.
Prepare changes locally and present the complete report for operator approval
before committing, pushing or opening a PR. GitHub configuration changes require
separate explicit approval. Never change signing configuration or use Codespaces.

This repository deploys a web application; it does not publish npm packages,
Windows packages, GitHub Releases or version tags. Maintain the internal
application version consistently in the manifest, source, README and SECURITY.

CI validates PRs to `main` and manual dispatches; Deploy repeats the application
checks and publishes `main` through the official Cloudflare Wrangler Action.
Preserve both Pages/Functions and the `taxaipca-motor` Cron Worker, their shared
D1 binding, Vertex service-account authentication, financial calculations,
model-selection fallback, sanitization and product tests. Do not import runtime
or deployment dependencies on another repository as part of governance work.

Keep the complete static `THIRD-PARTY-NOTICES.txt` and its public copy: they cover
both the browser bundle and Pages Functions. Review and update their exact
component versions, full license texts, provenance and legal-document copies
when relevant dependencies or distribution surfaces change. These are maintained
snapshots, not automatically regenerated or verified on every release. Preserve
`scripts/legal/launder-mit.txt` as static provenance evidence.

Do not restore retired `actions.lock` consumers, custom legal inventory/artifact
gates, advanced CodeQL workflows or merge queue. CodeQL uses Default Setup.
Dependabot uses GitHub native auto-merge and the approved native required checks.
The standalone Public Format workflow is retired; the official Prettier HTML
check remains part of normal CI and Deploy alongside ESLint, Biome, tests and
the build. Linear Release records successful push-triggered production Deploy
runs at the exact deployed SHA; manual Deploy runs do not create a Linear release.

## Registro de trabalho (GitHub Projects, Issues e Discussions)

Existe um unico **operador humano**, assistido por **Claude Code** e **ChatGPT-Codex**.
Os agentes nao constituem uma equipe de aprovadores humanos. O que fica so no
transcript da sessao se perde para a proxima execucao; por isso o registro abaixo
e **obrigatorio**. Mantenha GitHub e Linear vinculados, com conteudo e status
coerentes nos Issues, Projects, Discussions, Teams, Initiatives e Cycles
pertinentes. Preserve historico, prioridade e estados dos conteineres nao
relacionados; aplique o label `Codex` ao trabalho conduzido pelo Codex.

Quadro deste repositorio: `https://github.com/orgs/LCV-Ideas-Software/projects/10`
Quadro consolidado da organizacao: `https://github.com/orgs/LCV-Ideas-Software/projects/17`

### Os quatro gatilhos

**G1 — fim de bloco de trabalho.** Publique um _status update_ no quadro deste repositorio,
dizendo o que foi feito, o que ficou pendente e o que o proximo agente precisa saber:

```bash
gh api graphql -f query='
  mutation($id:ID!, $body:String!) {
    createProjectV2StatusUpdate(input:{projectId:$id, status:ON_TRACK, body:$body}) {
      statusUpdate { id }
    }
  }' -f id="$PROJECT_ID" -f body="..."
```

Use `AT_RISK` ou `OFF_TRACK` quando for o caso. O `PROJECT_ID` sai de
`gh api graphql -f query='query{organization(login:"LCV-Ideas-Software"){projectV2(number:10){id}}}'`.

**G2 — achado nao corrigido.** Todo bug, falha, limitacao de plataforma ou comportamento
inesperado que voce encontrar e **nao** resolver na hora vira issue imediatamente, com
reproducao, ambiente, evidencia, o que ja foi tentado e a hipotese de causa. Use o
formulario adequado em `.github/ISSUE_TEMPLATE/`. **Excecao de seguranca**: nenhum caso coberto
pelo reporte privado de `SECURITY.md` — nem a suspeita de um deles — vira issue
publica; siga o canal privado de la.

**G3 — decisao ou aprendizado duravel.** Criterio objetivo: _"isto seria util para quem
enfrentar este problema daqui a tres meses?"_ Se sim, vira Discussion.

- Conhecimento especifico deste repo -> Discussions **deste repositorio** (Q&A ou Ideas).
- Conhecimento transversal a varios repos (politica de release, regra de ruleset, restricao
  de plataforma) -> Discussions **da organizacao**.


**Excecao de seguranca** (tambem no G3): causa raiz, caminho de exploracao ou licao de
remediacao ligada a **qualquer caso coberto pelo reporte privado de `SECURITY.md`** nao
vira Discussion publica antes da divulgacao coordenada. Registre no canal privado de
`SECURITY.md`/advisory correspondente; apos a divulgacao, publique a versao saneada como
Discussion, sem detalhes de exploracao.
**G4 — trabalho nao-trivial.** Abra a issue **antes** do PR e referencie com `Closes #N`.
Isso ativa o fechamento automatico, o campo _Linked pull requests_ e a progressao de Status.
**Excecao de seguranca** (tambem no G4): trabalho que remedia **qualquer caso coberto
pelo reporte privado de `SECURITY.md`** — a lista de la, nao uma mais estreita: suspeita
de vulnerabilidade, vazamento de credencial, exposicao de dado privado, bypass de
autenticacao, problema em fluxo de pagamento, questao de cadeia de suprimentos ou
configuracao incorreta de deploy — nao abre issue publica nem carrega `Closes #N` de
superficie publica. O rastreio segue o canal privado do `SECURITY.md` e o advisory
correspondente; o PR referencia o advisory, sem detalhes de exploracao. Se `SECURITY.md`
mudar de escopo, vale o texto de la.

### Valvula de escape

Bump de dependencia, correcao de typo, lockfile e ajuste de formatacao **dispensam issue**.
O PR basta: os workflows Auto-add nativos dos Projects #10 e #17 inserem PRs novos ou
atualizados que correspondam aos filtros configurados. Se um item antigo nao tiver sido
capturado, regularize-o diretamente no Project sem criar automacao paralela no repositorio.

### Campos

Classifique toda issue com **Type** (Task, Bug, Feature, Incident, Security, Maintenance,
Documentation, Spike) e preencha os campos de issue da organizacao **Agent** (quem esta
tocando) e **Origin** (de onde surgiu). Em Bug e Incident preencha tambem **Environment**.
Esses campos sao `ORG_ONLY`: nao aparecem para o publico, mesmo neste repositorio publico.

### Fluxo de Status no quadro

`Triagem` -> `Backlog` -> `Em andamento` -> `Em cross-review` -> `Em PR` -> `Concluido`,
com desvios `Bloqueado` e `Descartado`.

> **Invariante**: as opcoes `Triagem` e `Concluido` estao vinculadas **por ID** a workflows
> internos do GitHub que nao sao editaveis por API. Podem ser renomeadas; **nunca apagadas**.

> **Atualizacao por quadro**: `Status`, `Area` e `Ciclo` sao campos de projeto com IDs
> proprios em cada quadro. Atualize os DOIS quadros — o deste repositorio e o portfolio
> #17 — a cada transicao; ID de opcao de um quadro nunca vale no outro (Discussion org#176).

### Configuration metadata and secrets

Nonsecret identifiers needed by official configuration may be versioned under
the current operator directive. This includes the existing D1 `database_name`
and `database_id` in both Wrangler configurations; they identify a resource,
not a credential. Credentials, tokens, secret values and sensitive operational
evidence must remain private. Do not rename resources, replace domain metadata,
move bindings or modify GitHub settings as incidental cleanup.
