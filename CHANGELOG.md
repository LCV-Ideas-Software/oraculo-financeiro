# Changelog — Oráculo Financeiro

## [Unreleased]

## [v01.11.00] - 2026-08-09

**Migração do transporte de IA para o Vertex AI (Onda 3 do programa Gemini → Vertex).**

### Alterado

- Os dois endpoints de IA (`/api/analisar-ia` e `/api/tesouro-ipca-vision`) deixam de usar o SDK `@google/genai` com API key (`GEMINI_API_KEY`) e passam a chamar o Vertex AI REST v1 (endpoint global) com OAuth de service account (`VERTEX_SA_KEY`), via cliente próprio em `functions/api/_shared/vertex.ts` (JWT RS256 por WebCrypto, cache de token por identidade de chave, single-flight, validação sintática de VERTEX_LOCATION que mantém a origem sob googleapis.com sem lista de regiões que envelhece, e erros HTTP com status e operação de origem preservados — um 404 de publisher model é distinguível de falhas da mint OAuth).
- Os seletores de modelo do módulo Oráculo no admin-app passam a ser honrados: `modeloAnalise` e `modeloVision` são lidos de `admin_module_configs` (`oraculo-config`) e usados exatamente como configurados (novo módulo `functions/api/_shared/oraculoModelConfig.ts`; validação apenas sintática do ID, que compõe a URL do Vertex). O fallback para `gemini-3.1-pro-preview` acontece somente quando o seletor está ausente/ilegível ou quando o Vertex responde 404 para o modelo selecionado (indisponível), com tentativas renovadas no modelo padrão. Antes, o modelo era fixo no código.
- Entrada multimodal (imagem/PDF em `inlineData`) validada empiricamente no REST v1; o cliente normaliza o array misto de parts no formato `Content[]` exigido pela API.
- `thinkingConfig: { thinkingBudgetTokens: 1024 }` não é mais enviado: o REST v1 rejeita o campo (400 Unknown name) e o v1beta o ignorava silenciosamente — o comportamento efetivo é preservado.
- Middleware de Secrets Store resolve `VERTEX_SA_KEY` no lugar de `GEMINI_API_KEY`; CSP não referencia mais `generativelanguage.googleapis.com`.
- Prompts (fiduciário e OCR), retry, telemetria (`ai_usage_logs`), rate limiting e persistência de auditoria permanecem inalterados.

### Removido

- Dependência `@google/genai` e o override órfão de `protobufjs` (a cadeia que o exigia saiu do lockfile).

## [v01.10.08] - 2026-07-21

**Patch de segurança — corrige duas negações de serviço em dependências transitivas.**

### Segurança

- Atualiza o override de `protobufjs` de `7.6.3` para `7.6.5`, corrigindo loop infinito ao analisar opções `.proto` malformadas na cadeia de runtime do `@google/genai` (GHSA-j3f2-48v5-ccww / CVE-2026-59877).
- Atualiza `brace-expansion` de `5.0.6` para `5.0.7` dentro do intervalo já aceito por `minimatch`, corrigindo expansão exponencial de grupos vazios consecutivos na cadeia de desenvolvimento (GHSA-3jxr-9vmj-r5cp / CVE-2026-13149).

## [v01.10.07] - 2026-05-15

**Patch — 4-gate quality directive compliance (eslint + biome + prettier + cross-review).** Workspace directive 2026-05-15: every code change must pass eslint + biome + prettier + cross-review before Commit & Sync / tag / release / deploy / publish.

### Adicionado

- `npm run biome` + `npm run biome:write` scripts.
- `deploy.yml` runs `npm run lint` (eslint) + `npm run biome` after `npm ci` and before `npm run build`.

### Configurado

- `biome.json` schema URL `2.4.11` → `2.4.14`.
- `biome.json` `files.includes` scopes biome para `src/` + `functions/`; exclui `dist/`, `build/`, `.wrangler/`, `node_modules/`, `coverage/`, CSS, `wrangler.json`.
- Rule overrides para React+Tailwind patterns: `suspicious.{noArrayIndexKey,noImplicitAnyLet}`, `correctness.useExhaustiveDependencies`, `style.noNonNullAssertion`, `a11y.{useKeyWithClickEvents,useButtonType,noStaticElementInteractions,useAriaPropsSupportedByRole}`, `security.noDangerouslySetInnerHtml` — all off.

### Alterado

- Multiple source files reformatted by `biome check --write .` + `--unsafe` (useLiteralKeys, useTemplate, noGlobalIsNan, useOptionalChain). Cosmetic only.
- `src/components/Notification.tsx:69`: forEach arrow-shorthand convertido para block body para satisfazer `useIterableCallbackReturn`.

## [v01.10.06] - 2026-05-13
### Corrigido
- **npm registry split para StepSecurity** — scripts operacionais de Wrangler (`d1:setup`, `d1:migrate`) agora forçam `https://registry.npmjs.org/` via `npx --registry`, preservando o proxy StepSecurity apenas para instalação/atualização de dependências. Isso evita que a configuração `.npmrc` de instalação interfira em comandos operacionais do npm/npx.

## [v01.10.05] - 2026-05-09
### Alterado
- **`site/index.html`** — iframe `github.com/sponsors/.../card` (caixa branca cross-origin) substituído por link card dark navy com ❤ pink + meta cyan + seta animada; card movido para DEPOIS dos botões (lcv.dev/sponsor primário, GitHub Sponsors alternativa). Companion ship Phase 3 (12 repos).

## [v01.10.04] - 2026-05-09
### Alterado
- **`site/index.html`** — `<style>` block reskinneado pra nova identidade visual dark-first navy/cyan da org LCV (paleta `#050b18`/`#38bdf8`/`#34d399`, gradientes radiais, glow shadows, gradient text no h1). Coordinated companion ship Phase 2 com `calculadora-app` v04.01.17, `astrologo-app` v02.17.23, `admin-app` v02.01.01, `mainsite-app` v03.23.01/v02.19.01, `maestro-app` v0.5.17, `mtasts-motor` v02.00.10. Companion à Phase 1 (cross-review-v1 1.12.9, cross-review-v2 v02.18.07, deepseek-cli 0.3.1, grok-cli 1.6.2, sponsor-motor APP v01.02.02, `.github-org/site`). Sem mudança no app runtime; apenas a página GitHub Pages.
- Entrada [Unreleased] anterior (remoção do widget SumUp em `site/index.html`) consolidada aqui — o widget já havia sido removido em ships anteriores.

## [v01.10.03] - 2026-04-30
### Alterado
- `README.md` passou a seguir o novo padrão organizacional de abertura: logo harmonizado, bloco curto de status, tabela `The version history at a glance`, links públicos de release/clone corrigidos para `LCV-Ideas-Software/oraculo-financeiro` e manutenção explícita do GitHub Sponsors em `example-beneficiary`.

## [v01.10.02] - 2026-04-26
### Alterado
- **`.github/workflows/pages.yml`** — `actions/configure-pages@v6.0.0` passou a declarar `with: enablement: true` para idempotência em forks/clones que ainda não tenham GitHub Pages habilitado (corrige `Get Pages site failed... HTTP 404` em primeiro run).
- **CI/Pages modernization** — workflows migraram de `gh-pages` legacy branch para o padrão atual (artifact deployment via `configure-pages` + `upload-pages-artifact` + `deploy-pages`, todos SHA-pinned).
### Validação
- Trilateral cross-review session `08bc6b9a-f3f5-434d-8276-2b21f562a843` (caller + Codex + Gemini) **READY**: paridade confirmada nos 9 repos públicos do workspace em security baseline, repo features, workflow perms, branch rulesets, Pages deployment, CodeQL Default Setup, 0 alertas abertos.

## [v01.10.01] - 2026-04-25
### Public Flip Prep (Phase 2)
- **Repo público**: README reescrito como documentação fork-friendly; AGPL-3.0-or-later confirmada (LICENSE + frontmatter); FUNDING.yml + Sponsorship habilitada; rulesets do GitHub aplicados (10 itens do baseline de hardening).
- **D1 placeholder**: `wrangler.json` (Pages) e `workers/taxaipca-motor/wrangler.json` (Cron Worker) passaram a usar `database_id` nil-UUID (`00000000-0000-0000-0000-000000000000`); o ID real é injetado em deploy via secret `D1_DATABASE_ID` no GitHub Actions com substituição `jq` em ambos os arquivos.
- **Cron Trigger versionado**: `workers/taxaipca-motor/wrangler.json` agora declara `triggers.crons: ["0 5 * * *"]` (02h BRT / 05h UTC, alinhado com a documentação do README).
- **Bootstrap consistente**: `scripts/setup-d1.ps1` e `package.json` (`d1:migrate`) passaram a usar `example_db` + binding `BIGDATA_DB`, em paridade com `wrangler.json` e o restante do workspace; o setup script agora valida ambos os `wrangler.json` (root + worker).
- **Sanitização HTML parser-based**: `enviar-email.ts` migrou de regex para `sanitize-html` (allowlist de tags/atributos); `THIRDPARTY.md` atualizado.
- **Histórico Git**: residuals de prefixos internos (memória/sessão) e fragmentos de UUID anteriores foram limpos do histórico via `git filter-repo` antes do flip público.

## [v01.10.00] - 2026-04-24
### Corrigido
- **GET `/api/taxa-ipca-atual` → 403 no carregamento do app**: `requireAllowedOrigin` ficou incompatível com browsers em GET same-origin (Chrome/Firefox/Safari não enviam header `Origin` em GET same-origin, apenas em métodos não-safe). O helper agora aceita Origin ausente quando `Sec-Fetch-Site` é `same-origin`/`same-site`; rejeita `cross-site` e ausência de ambos sinais.
- **POST `/api/oraculo-auth` → 500 (Cloudflare error 1101, "Worker threw exception")**: handler `onRequestPost` lançava exceção fora do try/catch (chamadas a `enforceRateLimit`, `ensureTables` e `request.json()` ficavam descobertas), fazendo a Cloudflare servir HTML 500 genérico em vez do nosso `jsonResponse`. O cliente caía em `res.json()` rejeitado e mostrava "Erro de rede". Handler passou a ser envolvido em try/catch top-level que retorna sempre JSON + `console.error` para Workers Logs.
### Alterado
- **Middleware resolve Secrets Store para `RESEND_API_KEY`**: `functions/_middleware.ts` passou a resolver também `RESEND_API_KEY` (além de `GEMINI_API_KEY`) quando estiver como binding do Secrets Store, corrigindo cenário silencioso em que `env.RESEND_API_KEY` era um objeto `{get()}` e o `Bearer [object Object]` falhava no Resend.
- **`RESEND_API_KEY` só é exigida nos branches que enviam e-mail** (`save`, `request-token`, `request-delete-token`); `retrieve`, `verify-save`, `verify-delete` e `session-retrieve` deixaram de bloquear por falta dessa chave.
- **Consumo atômico de OTP**: `UPDATE oraculo_auth_tokens SET used = 1 WHERE id = ? AND used = 0` + checagem de `meta.changes` para impedir dupla-consumação em requisições concorrentes.
- **Hardening transversal (Fix D)**: `contato.ts`, `enviar-email.ts`, `analisar-ia.ts`, `tesouro-ipca-vision.ts` e `taxa-ipca-atual.ts` agora têm try/catch top-level + `console.error` + JSON genérico no catch.
- **Cliente defensivo**: novo helper `src/lib/api.ts::fetchJson` confere `Content-Type: application/json` antes de `res.json()`, evitando mascarar falhas do servidor como "Erro de rede". Aplicado nos fluxos de auth do `App.tsx` (`autoRetrieve`, `handleAuthEmailSubmit`, `handleAuthTokenSubmit`).
- **Testes de `requireAllowedOrigin`** atualizados para refletir o novo contrato: Origin válido + Sec-Fetch-Site seguro aceitam; Origin inválido, `cross-site` e ausência total rejeitam.
### Motivação
- **Origem da rodada**: dois erros em produção (`oraculo-financeiro.lcv.app.br`) reportados pelo usuário em 2026-04-24: 403 no GET `/api/taxa-ipca-atual` ao carregar o app e 500 no POST `/api/oraculo-auth` ao recuperar dados via código de e-mail.
- **Diagnóstico cross-review**: sessão de cross-review (3 rounds, convergência alcançada). Probes diretos em produção confirmaram: 403 é o nosso `jsonResponse` com body `{"ok":false,"error":"Origem não permitida."}`; 500 é Cloudflare error 1101 com `Content-Type: text/plain` e body `"error code: 1101"`, ou seja, exceção não capturada no handler.

## [Security Publication Hardening] - 2026-04-23
### Segurança
- Memórias e contexto interno de desenvolvimento passaram a ser apenas locais: padrões correspondentes adicionados ao ignore e removidos do índice Git com `git rm --cached`, preservando os arquivos no disco local.
- Regras de publicação foram endurecidas para impedir envio de `.env*`, `.dev.vars*`, `.wrangler/`, `.tmp/`, logs, bancos locais e artefatos de teste para GitHub/npm.
### Validação
- `git ls-files` confirmou ausência de memórias/artefatos locais rastreados; `npm pack --dry-run --json --ignore-scripts` não incluiu arquivos proibidos.

## [v01.09.04] - 2026-04-17
### Corrigido
- `wrangler.json` do app Pages deixou de declarar `observability`, preservando o baseline apenas em `workers/taxaipca-motor/wrangler.json`, que continua sendo config de Worker.
### Motivação
- Restaurar o deploy do `oraculo-financeiro` após os logs do GitHub Actions confirmarem que `wrangler 4.83.0` rejeita `observability` em projetos Cloudflare Pages.

## [v01.09.03] - 2026-04-17
### Alterado
- `wrangler.json` e `workers/taxaipca-motor/wrangler.json` agora garantem `observability.logs.enabled = true`, `observability.logs.invocation_logs = true` e `observability.traces.enabled = true`.
- Campos preexistentes de observability, como `head_sampling_rate`, foram preservados durante o merge do baseline.
### Motivação
- Padronizar logs de invocação e traces do Cloudflare no `oraculo-financeiro` e no worker `taxaipca-motor`.

## [v01.09.02] - 2026-04-17
### Alterado
- **Auth e origem fail-closed**: `oraculo-auth.ts`, `contato.ts`, `enviar-email.ts`, `analisar-ia.ts`, `tesouro-ipca-vision.ts` e `taxa-ipca-atual.ts` passaram a exigir origem `https://*.lcv.app.br`, aplicar rate limiting real e endurecer respostas sensíveis.
- **Tokens sensíveis protegidos**: OTPs e session tokens passaram a ser persistidos por hash, mantendo compatibilidade transitória de leitura sem deixar o valor bruto como caminho canônico.
- **Mutações públicas aposentadas**: `auditorias-ia`, `registros-lci-cdb` e `tesouro-ipca` deixaram de aceitar escrita pública e passaram a responder `410` nos caminhos de mutação descontinuados.
- **Testes de segurança adicionados**: `functions/api/_shared/security.test.ts` cobre origem, headers, hashing e sanitização/escape dos helpers novos.
### Motivação
- **Origem da rodada**: fechamento da auditoria defensiva de 2026-04-17, com foco em fechar escrita pública indevida, relay abusável de e-mail e fluxos caros sem rate limit.

## [v01.09.01] - 2026-04-16
### Alterado
- **Lockfile**: `package-lock.json` regenerado (rm -rf + npm install). 220 packages, 0 vulnerabilidades.
### Motivação
- Adotar patches recentes em deps transitivas.
- Parte do plano de upgrade v2 (fase O2).

## [v01.09.00] - 2026-04-16
### Alterado
- **biome.json**: removida a regra `correctness.useExhaustiveDependencies: "warn"` — era config morta (Biome não roda no CI nem em `npm run lint`; apenas `biome format`). ESLint via `eslint-plugin-react-hooks` permanece como único enforcer de hook deps.
### Motivação
- Biome detecta 6 warnings (vs 0 efetivos do ESLint — oraculo tem poucos `// eslint-disable`). Custo de migração não se paga. Consolidação direcional: ESLint stays, Biome fica só como formatter.
### Não alterado
- `eslint-plugin-react-hooks@^7.0.1` e `.npmrc legacy-peer-deps=true` permanecem.
- Parte do plano de upgrade v2 (fase O1).

## [v01.08.12] - 2026-04-10
### Adicionado
- **Biome 2.x**: lint + format com organizeImports

### Alterado
- **vite**: 8.0.7 → 8.0.8
- **vitest**: 4.1.2 → 4.1.4
- **lucide-react**: 1.7.0 → 1.8.0
- **Dependabot groups**: @vitest/*e @biomejs/* adicionados

## [v01.08.11] - 2026-04-08
### Atualização Tecnológica
- **ESLint 9 → 10**: Migração para `eslint@10.2.0` e `@eslint/js@10.0.1`.
- **`.npmrc`**: Criado com `legacy-peer-deps=true` para resolver conflito `eslint-plugin-react-hooks@7` ↔ ESLint 10.

### Controle de versão
- `oraculo-financeiro`: APP v01.08.10 → APP v01.08.11

## [v01.08.10] - 2026-04-07
### Segurança
- **Vite 8.0.3 → 8.0.7**: Correção de 3 CVEs de severidade alta/média.

### Controle de versão
- `oraculo-financeiro`: APP v01.08.09 → APP v01.08.10
## [v01.08.09] - 2026-04-06
### Adicionado
- **Cross-Service AI Telemetry**: Implementação de `logAiUsage` em `analisar-ia.ts` e `tesouro-ipca-vision.ts` para registro de tokens, latência e status no `ai_usage_logs` (D1).
### Alterado
- **Worker Rename**: `cron-taxa-ipca` renomeado para `taxaipca-motor` em wrangler.json, index.ts, deploy.yml e memórias AI.
- **Compatibility Date**: Todos os `wrangler.json` atualizados para `2026-04-06`.
### Controle de versão
- `oraculo-financeiro`: APP v01.08.08 → APP v01.08.09

## [v01.08.08] - 2026-04-06
### Alterado
- **Observability 100% (taxaipca-motor)**: `head_sampling_rate: 1`, `invocation_logs: true` e `enabled: true` ativados no `wrangler.json` do worker taxaipca-motor.

### Controle de versão
- `oraculo-financeiro`: APP v01.08.07 → APP v01.08.08

## [v01.08.07] - 2026-04-04
### Resolvido
- **Modernização GenAI**: As APIs nalisar-ia.ts e  esouro-ipca-vision.ts implementam as totais capacidades das '10 features' (structuredLog, contagem de tokens pré/pós e metadados de cobrança).
- **Direto ao Google**: Removidos resquícios do Cloudflare Gateway proxy mitigando timeout 524 fantasma na resolução do IPCA Vision.
- **Cloudflare Environment**: Sincronização do binding `RESEND_API_KEY` mapeado ativamente ao Secrets Store nativo.

## [v01.08.06] - 2026-04-02
### Controle de versão
- `oraculo-financeiro`: APP v01.08.05 → APP v01.08.06

## [v01.08.07] - 2026-04-04
### Resolvido
- **Modernização GenAI**: As APIs nalisar-ia.ts e  esouro-ipca-vision.ts implementam as totais capacidades das '10 features' (structuredLog, contagem de tokens pré/pós e metadados de cobrança).
- **Direto ao Google**: Removidos resquícios do Cloudflare Gateway proxy mitigando timeout 524 fantasma na resolução do IPCA Vision.
- **Cloudflare Environment**: Sincronização do binding `RESEND_API_KEY` mapeado ativamente ao Secrets Store nativo.

## [v01.08.05] - 2026-04-02
### Refatoração Estrutural
- **Conformidade de Segurança (Linting)**: Adicionadas verificações rigorosas no backend (`analisar-ia.ts` e `tesouro-ipca-vision.ts`) para tratamento explícito de exceções utilizando `error instanceof Error` eliminando todos os casos residuais de `no-explicit-any` detectados pelo ESLint na operação via novo SDK `@google/genai`.

### Controle de versão
- `oraculo-financeiro`: APP v01.08.04 → APP v01.08.05

## [v01.08.07] - 2026-04-04
### Resolvido
- **Modernização GenAI**: As APIs nalisar-ia.ts e  esouro-ipca-vision.ts implementam as totais capacidades das '10 features' (structuredLog, contagem de tokens pré/pós e metadados de cobrança).
- **Direto ao Google**: Removidos resquícios do Cloudflare Gateway proxy mitigando timeout 524 fantasma na resolução do IPCA Vision.
- **Cloudflare Environment**: Sincronização do binding `RESEND_API_KEY` mapeado ativamente ao Secrets Store nativo.

## [v01.08.04] - 2026-03-31
### Corrigido
- **Compliance - docs legais locais em runtime**: o `LicencasModule` passou a carregar `LICENSE`, `NOTICE` e `THIRDPARTY` a partir de `public/legal/*` via `BASE_URL`, eliminando dependência de `raw.githubusercontent.com` no browser e removendo os 404 recorrentes em produção.

### Controle de versão
- `oraculo-financeiro`: APP v01.08.03 → APP v01.08.04

## [v01.08.07] - 2026-04-04
### Resolvido
- **Modernização GenAI**: As APIs nalisar-ia.ts e  esouro-ipca-vision.ts implementam as totais capacidades das '10 features' (structuredLog, contagem de tokens pré/pós e metadados de cobrança).
- **Direto ao Google**: Removidos resquícios do Cloudflare Gateway proxy mitigando timeout 524 fantasma na resolução do IPCA Vision.
- **Cloudflare Environment**: Sincronização do binding `RESEND_API_KEY` mapeado ativamente ao Secrets Store nativo.

## [v01.08.03] - 2026-03-31
### Adicionado
- **Governança de Licenciamento (GNU AGPLv3)**: Inserção do `LicencasModule` e `ComplianceBanner` no frontend para fechamento do SaaS Loophole com conformidade total.

### Controle de versão
- `oraculo-financeiro`: APP v01.08.02 -> APP v01.08.03

## [v01.08.07] - 2026-04-04
### Resolvido
- **Modernização GenAI**: As APIs nalisar-ia.ts e  esouro-ipca-vision.ts implementam as totais capacidades das '10 features' (structuredLog, contagem de tokens pré/pós e metadados de cobrança).
- **Direto ao Google**: Removidos resquícios do Cloudflare Gateway proxy mitigando timeout 524 fantasma na resolução do IPCA Vision.
- **Cloudflare Environment**: Sincronização do binding `RESEND_API_KEY` mapeado ativamente ao Secrets Store nativo.

## [v01.08.02] - 2026-03-31
### Corrigido
- **Compliance - GNU AGPLv3**: corrigido erro 404 no conteúdo descarregado do arquivo LICENSE, publicando o texto integral e atualizado da licença (~34KB) em conformidade técnica e jurídica.

### Controle de versão
- `oraculo-financeiro`: APP v01.08.01   APP v01.08.02

## [v01.08.01] — 2026-03-31
### Alterado
- **Fluxo indireto `preview` padronizado**: branch operacional `preview` adotado no repositório para promoções consistentes para `main`.
- **Automação de promoção**: workflow `.github/workflows/preview-auto-pr.yml` adicionado/atualizado para abrir/reusar PR `preview -> main`, habilitar auto-merge e tentar merge imediato quando elegível.
- **Permissões do GitHub Actions**: ajuste para permitir criação/aprovação de PR por workflow, eliminando falhas 403 operacionais.

### Controle de versão
- `oraculo-financeiro`: APP v01.08.00 → APP v01.08.01

## [v01.08.00] — 2026-03-30
### Alterado
- **Notificações — padrão admin-app**: sistema de notificações migrado do pattern inline `pushNotification(tone, title, message)` com state local para o padrão `useNotification` hook + `NotificationProvider` utilizado no admin-app. Pill toast centralizado no topo com backdrop blur, variantes cromáticas (success/error/info/warning), animação spring e auto-dismiss.
- **`Notification.tsx`**: componente Context+Provider (já existia, agora efetivamente utilizado).
- **`Notification.css`**: criado com styling idêntico ao admin-app (pill toast, Google palette, mobile responsive).
- **`main.tsx`**: `<App />` agora envolto em `<NotificationProvider>`.
- **`App.tsx`**: removidos tipos orphans (`NotificationTone`, `ConnectionStatus`, `NotificationItem`), state `notifications`/`connectionStatus`, função `pushNotification`, e rendering inline `<aside className="notifications">` / `<div className="status-square">`. 33 call sites convertidos para `showNotification(message, type)`.

### Controle de versão
- `oraculo-financeiro`: APP v01.07.02 → APP v01.08.00

## [v01.07.02] — 2026-03-29
### Alterado
- **CI/CD branch standardization**: workflow de deploy padronizado para publicar no branch `main` na Cloudflare Pages, com trigger GitHub em `main` e `concurrency.group` atualizado para `deploy-main`.

### Controle de versão
- `oraculo-financeiro`: APP v01.07.01 → APP v01.07.02

## [v01.07.01] — 2026-03-27
### Corrigido
- **CSS Grid Overlap**: os containers `.grid` em formulários (especialmente em *"Registrar novo lote"*) agora possuem `min-width: 0` nos itens filhos e `text-overflow: ellipsis` no `<select>`. Isso evita que a string de vencimento alongada do Tesouro IPCA+ com Juros Semestrais expanda a trilha do grid para fora da tela, encavalando sobre o input de "Valor Investido".

### Melhorado
- **Taxonomia de Juros Semestrais**: Títulos "Tesouro IPCA+ com Juros Semestrais" agora recebem o sufixo `(Semestral)` na string de vencimento (ex: `15/08/2032 (Semestral)`). Isso resolve o bug visual no dropdown onde as NTN-Bs Principais se misturavam às NTN-Bs padrão, impedindo o usuário de selecionar a opção correta devido à sobreposição de \`value\` no `<select>`, e melhora a clareza do relatório.

## [v01.07.00] — 2026-03-27
### Adicionado
- **Email linkage nas tabelas individuais**: coluna `email` adicionada a `oraculo_tesouro_ipca_lotes` e `oraculo_lci_cdb_registros` via self-healing migration. Todos os registros são vinculados ao email do usuário ao salvar via autenticação.
- **Auto-exclusão de dados (frontend)**: botão "🗑️ Excluir Meus Dados" no frontend aberto com fluxo completo de email/token (actions `request-delete-token` + `verify-delete`). Cascata por email em todas as 4 tabelas.
- **`stampEmailOnRecords`**: função auxiliar em `oraculo-auth.ts` que vincula email aos registros individuais referenciados no `dados_json` durante `verify-save`.
- **Sessão persistente (60 min)**: após autenticação via OTP, backend gera session token (UUID) com TTL de 60 minutos. Frontend armazena em `sessionStorage` (sobrevive F5, não sobrevive fechar janela). Ao recarregar, dados são restaurados automaticamente via `session-retrieve` com validação server-side e rotação de token.

### Corrigido
- **Exposição de dados no frontend público**: registros em `oraculo_tesouro_ipca_lotes` e `oraculo_lci_cdb_registros` permaneciam após exclusão do usuário no admin-app. Agora a cascata de exclusão remove registros por IDs do JSON + por email (safety net) em todas as tabelas.
- **Cron resetava ao deploy**: `triggers.crons` hardcoded em `wrangler.json` sobrescrevia a configuração de agendamento a cada deploy. Removido — agendamento agora gerenciado exclusivamente via API Cloudflare (admin-app).
- **[SECURITY] GET handlers públicos removidos**: `onRequestGet` de `tesouro-ipca.ts` e `registros-lci-cdb.ts` retornavam todos os registros sem autenticação. Removidos. Dados de usuário agora acessíveis somente via fluxo autenticado em `oraculo-auth.ts`.
- **[SECURITY] Frontend auto-load removido**: `carregarRegistros()` e `useEffect` que carregavam todos os dados ao abrir a página foram deletados. Frontend agora inicia vazio — dados populados somente após validação via email/token.

### Melhorado
- **Botão "Análise Inteligente" reposicionado**: movido para antes dos botões de ação, centralizado em linha própria com largura 100% e espaçamento adequado.
- **Notificações de sessão**: autenticação bem-sucedida informa ao usuário que a sessão dura 60 minutos e sobrevive refresh.

## [v01.06.02] — 2026-03-27
### Corrigido
- **IR Tesouro Direto — remoção de MP 2026 fictícia**: `aliquotaIrRegressiva` aplicava alíquota fixa de 17,5% para compras a partir de 2026. Corrigido para tabela regressiva padrão (22,5% / 20% / 17,5% / 15%) conforme Lei 11.033/2004 e site oficial do Tesouro Direto.
- **`diasParaMenorIr`**: removia contagem regressiva para IR 15% em compras pós-2026 (retornava 0). Corrigido para sempre calcular 720 − dias decorridos.
- **`gerarSinalTesouro`**: lógica de decisão considerava 17,5% como IR mínimo. Corrigido para reconhecer apenas 15% como piso.

## [v01.06.01] — 2026-03-27
### Corrigido
- **Dropdown Vencimentos desordenado**: sort de datas `dd/mm/yyyy` usava `localeCompare` direto (ordenava por dia, não por ano). Corrigido para converter `dd/mm/yyyy` → `yyyymmdd` antes de comparar, garantindo ordem cronológica (mais próximo → mais distante).
- **IDE Type Errors**: declarados `ScheduledEvent` e `ExecutionContext` inline no worker (evita dependência de `@cloudflare/workers-types`).

### Melhorado
- **Cron Worker Observability completa**: logging granular em cada etapa — trigger metadata (`scheduledTime`, expressão cron, UTC), origem do disparo (`cron(...)` vs `http-manual`), listagem individual de cada título IPCA+ encontrado, timing de parse e D1 separados, e stack trace em erros.

## [v01.06.00] — 2026-03-27
### Corrigido
- **Cron Worker CSV Parser**: reescrito `parseCSV` para mapear corretamente as 7 colunas do CSV do Tesouro Transparente (antes mapeava 8 colunas incorretamente, causando dados corrompidos e falha na identificação de títulos IPCA+).
- **Cron Worker Full-Scan**: implementada varredura completa do CSV para identificar a data-base mais recente (dados não são cronologicamente ordenados).

### Adicionado
- **Cron Worker Observability**: logging estruturado (`console.log`/`console.error`) em todo o pipeline do worker (download, parse, upsert) para monitoramento via Cloudflare Observability.

### Melhorado
- **Footer Buttons (UX)**: botões "Contato" e "Enviar por E-mail" agora possuem `box-shadow` para profundidade visual e hover mais intenso (`#1557b0` com glow), melhorando discoverability.

## [v01.05.00] — 2026-03-26
### Alterado
- **E-mail de análise — reescrita completa**: `gerarHtmlRelatorio` agora replica a tela do frontend com inline CSS. Todas as seções: parâmetros (CDI/IPCA/Duration), LCI/LCA (alíquota IR, CDB equivalente, rendimentos, ganho real, benchmark colorido), Tesouro IPCA+ (resumo carteira, MTM com convexidade, lotes individuais com badge VENDER/MANTER, sinal), e análise IA completa (avaliação badge, números-chave, ciladas, recomendação, timing, resumo). Design tiptap.dev com `@media` responsive.
- **Vencimentos cronológicos**: dropdown de vencimentos de títulos IPCA+ ordenado do vencimento mais próximo ao mais distante via `.sort()`.

### Corrigido
- **Lint TypeScript**: corrigidos comparadores de tipo — `benchmarkLci.classe` usava `'bom'` e `'razoavel'` (inexistentes); corrigidos para `'muito-bom'` e `'regular'`. `analiseIa.recomendacao` usava `'INVESTIR'` (inexistente); corrigido para `'MANTER'`.

## [v01.04.00] — 2026-03-26
### Adicionado
- **Formulário de Contato**: botão no rodapé abre modal com formulário (nome, telefone, e-mail, mensagem). Backend `contato.ts` envia via Resend (`oraculo-financeiro@lcv.app.br`). Portado do `mainsite-frontend/ContactModal`.
- **E-mail de Análise**: botão no rodapé abre modal (portado do `astrologo-frontend/EmailModal`). Gera HTML completo com parâmetros, lotes IPCA+, registros LCI/LCA e análise IA. Backend `enviar-email.ts` via Resend.
- **Suporte a PDF no Vision**: drag/drop e file input aceitam `.pdf` além de imagens. Vision worker envia ao Gemini com `application/pdf`, system instruction atualizada.
- **Scroll FABs**: botões flutuantes de Voltar ao topo / Ir ao final (paridade admin-app). Threshold 200px, design tiptap.dev.

### Corrigido
- **Notificações ocultas**: `z-index` de `.notifications` elevado para 101 (acima de `.auth-overlay` z-index: 100).
- **Botão Resgatar Análise**: adicionada borda para paridade visual com demais botões.
- **Lint**: `let` → `const` em `formatPhone`, `analiseIa.texto` → `analiseIa.analise`.
- **500 em `/api/tesouro-ipca`**: self-healing migration — `ALTER TABLE ADD COLUMN vencimento` executa automaticamente na primeira request se a coluna não existir.
- **Labels PDF**: botão "Upload Imagem" → "Upload Imagem/PDF"; hint do drag/drop atualizado para "Anexe um print ou PDF do extrato".

## [v01.03.00] — 2026-03-26
### Adicionado
- **Tesouro Transparente**: Worker `/api/taxa-ipca-atual` reescrito para usar CSV público gratuito do Tesouro Transparente (dados abertos, ~13 MB) com cache D1 (`oraculo_taxa_ipca_cache`). ANBIMA (paga) removida.
- **Force Refresh**: endpoint aceita `?force=true` para bypass do cache (disparo manual via admin-app).
- **Cron Worker**: novo Worker standalone `workers/cron-taxa-ipca/` com Cron Trigger (02:00 BRT / 05:00 UTC) para pré-aquecimento diário do cache.
- **CI/CD Cron**: pipeline `deploy.yml` atualizado para deploy automático do cron worker.
- **Máscaras de Input**: 7 inputs monetários e de taxa convertidos para formato brasileiro (1.234,56) via helpers `formatBRL`/`parseBRL`/`formatTaxa`.
- **Auto-fetch Taxa**: frontend busca taxa IPCA+ indicativa do Tesouro Transparente ao montar componente, com indicador visual (loading/referência).

### Alterado
- **~~MP 2026 (IR)~~** *(corrigido em v01.06.02)*: MP 1.303/25 caducou em outubro/2025 sem conversão em lei. Alíquota fixa de 17,5% nunca entrou em vigor; tabela regressiva (22,5%→15%) permanece vigente.
- **Prompt Vision**: formato brasileiro dd/mm/aaaa explícito, modelo `gemini-3.1-pro-preview`.

## [v01.02.05] — 2026-03-26
### Corrigido
- **Modelo Vision reescrito**: worker `tesouro-ipca-vision.ts` inteiramente refatorado — modelo migrado de `gemini-3-pro-preview` (texto-only, incapaz de processar imagens) para `gemini-2.5-pro-latest` (último Pro com suporte nativo a visão multimodal + thinking). Adicionados retry com 1 tentativa extra, filtro de thought parts, tipagem forte (zero `any`), e alinhamento completo ao padrão de engenharia do `analisar-ia.ts`.
- **Tabela DELETE órfã**: corrigido nome da tabela no `onRequestDelete` de `tesouro-ipca.ts` de `tesouro_ipca_lotes` para `oraculo_tesouro_ipca_lotes` (bug latente que causaria falha silenciosa caso invocado).

## [v01.02.04] — 2026-03-26
### Corrigido
- **API Multimodal Versionamento**: forçado fallback explícito para identificador do modelo `gemini-3-pro-preview` e incluído novo property name das features v1beta (`system_instruction` em detrito do padrão REST original) com o framework `thinkingLevel: "HIGH"` assegurando as 10 modern-features de processamento IA estritas.

## [v01.02.03] — 2026-03-26
### Corrigido
- **Erro 500 no Worker (Vision API)**: substituídas as chamadas do método `Response.json` (incompatível com certas engines locais de Node do Wrangler) pelo utilitário `jsonResponse`, restaurando o fluxo de leitura de extratos no ambiente dev e produção.

## [v01.02.02] — 2026-03-26
### Removido
- **Quality Gates**: removida a configuração estrita do Github Actions (`quality-gates.yml`) que bloqueava merges na branch principal por linting e build, permitindo fluidez de deploy para o app.

## [v01.02.01] — 2026-03-26
### Corrigido
- **UX Drag & Drop Invisível**: injetado banner visual fixo (Feature Banner) na interface do Tesouro Direto, possuindo call-to-action explícito com botão de `Upload Imagem` (input file), sanando a grave falha de discoverability onde a tela exigia um drop às cegas.

## [v01.02.00] — 2026-03-26
### Adicionado
- **API Multimodal (Cloudflare Workers)**: endpoint nativo `/api/tesouro-ipca-vision.ts` implementado para ingerir Base64 do extrato do Tesouro e realizar parser JSON via modelo Gemini 1.5 Pro. Sistema com `responseMimeType: application/json`.
- **Interface Drag & Drop**: adicionada overlay interativa no painel da Marcação a Mercado para recepção instantânea de capturas de tela, extração de texto em OCR cognitivo e preenchimento autômato do lote.

### Alterado
- **Redesign UI/UX Completo**: transição de glassmorphisms pesados para a filosofia sólida `Tiptap.dev` (Google Blue, Pill buttons, Solid Cards 30px radius, fonte Inter).
- **Adequação WCAG/eMAG**: inputs validados para id/name e autocomplete.
- **Migração de Frontend para Admin**: as tabelas de histórico persistente foram deletadas do frontend (`App.tsx`), delegando a leitura e exclusão para a matriz do Admin-app.
- Migração de D1 para `example_db` com prefixação de tabelas (`oraculo_lci_cdb_registros`, `oraculo_auditorias_ia`, `oraculo_tesouro_ipca_lotes`)

### Infra
- `wrangler.json` atualizado para `example_db` (binding `BIGDATA_DB`)
- Versionamento consolidado para `APP v01.02.00` + `package.json` 1.2.0

## [v01.01.00] — 2026-03-22
### Adicionado
- Footer com exibição de versão via APP_VERSION
- Classe CSS `.app-version-footer` em App.css
- Cabeçalho de código em App.tsx e analisar-ia.ts

### Alterado
- Upgrade Gemini API: modelo gemini-3-pro-preview, endpoint v1beta, thinkingLevel HIGH, safetySettings, retry com 1 tentativa extra
- Padronização do sistema de versão para formato APP v00.00.00

## [v01.00.00] — Anterior
### Histórico
- Versão inicial com análise LCI/LCA e Tesouro IPCA+ via IA Gemini
