// Módulo: oraculo-financeiro/functions/api/analisar-ia.ts
// Versão: v01.11.00
// Descrição: Migração para Vertex AI — service account OAuth (VERTEX_SA_KEY), REST v1 global, modelo do seletor do admin (modeloAnalise; padrão gemini-3.1-pro-preview), safetySettings e retry preservados. Prompt fiduciário preservado.

import { loadConfiguredOraculoModel } from './_shared/oraculoModelConfig';
import { type D1DatabaseLike, enforceRateLimit, jsonResponse, requireAllowedOrigin } from './_shared/security';
import { VertexGenAI } from './_shared/vertex';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Env {
  BIGDATA_DB: D1DatabaseLike;
  VERTEX_SA_KEY: string;
  VERTEX_PROJECT?: string;
  VERTEX_LOCATION?: string;
}

interface Context {
  env: Env;
  request: Request;
}

// Payload que vem do front-end
type PayloadLciLca = {
  tipo: 'lci-lca';
  prazoDias: number;
  taxaLciLca: number;
  aporte: number;
  cdiAtual: number;
  ipcaProjetado: number;
  aliquotaIr: number;
  cdbEquivalente: number;
  rendLciLiquido: number;
  rendCdbLiquido: number;
  rendLciPctAa: number;
  ganhoRealLci: number;
  benchmarkLabel: string;
  benchmarkDescricao: string;
};

type LotePayload = {
  dataCompra: string;
  valorInvestido: number;
  taxaContratada: number;
};

type PayloadTesouro = {
  tipo: 'tesouro-ipca';
  lotes: LotePayload[];
  taxaAtual: number;
  durationAnos: number;
  totalInvestido: number;
  taxaMediaContratada: number;
  durationModMedia: number;
  mtmTotal: number;
  aliquotaIrMedia: number;
  diasParaMenorIr: number;
  ganhoLiquidoHoje: number;
  ganhoLiquidoIrMin: number;
  economiaIr: number;
  sinal: string;
  forcaSinal: string;
};

type Payload = PayloadLciLca | PayloadTesouro;

// Resposta estruturada do Gemini
type AnaliseIA = {
  avaliacao: 'bom' | 'regular' | 'ruim';
  titulo: string;
  analise: string;
  numerosChave: {
    retornoLiquidoEstimado: string;
    ganhoRealAcimaIpca: string;
    comparacaoTesouroSelic: string;
  };
  recomendacao: 'MANTER' | 'VENDER' | 'AGUARDAR' | 'EVITAR';
  timing: string;
  ciladas: string[];
  resumo: string;
};

// ─── PROMPT PRINCIPAL DO GEMINI ──────────────────────────────────────────────
//
// Premissa: linguagem clara, direta e honesta. Diferente do jargão financeiro
// que existe para confundir e criar dependência — aqui o objetivo é o oposto.
//
const SYSTEM_PROMPT = `Você é Oráculo — um analisador financeiro independente e fiduciário.
Sua única lealdade é ao investidor. Você não representa bancos, corretoras nem emissores.

═══ MISSÃO ═══
Analisar dados de renda fixa brasileira e emitir um veredicto claro, numérico e acionável.
A pergunta que você responde é uma só: "Isso é bom para o meu dinheiro?"

═══ TOM E ESTILO ═══
• Linguagem simples e direta — como um amigo competente, não como um gerente de banco.
• Se algo é ruim para o investidor, diga que é ruim. Isenção de responsabilidade não é análise.
• Use reais (R$) sempre que possível. Percentual sem contexto de valor absoluto engana.
• Nunca use "depende do perfil do investidor" como conclusão — isso é esquiva, não análise.
• Se usar um termo técnico, explique em uma frase logo após (ex: "duration — prazo médio de retorno").

═══ REGRAS DE ANÁLISE ═══

1. RETORNO LÍQUIDO PRIMEIRO
   IR e IOF existem. O retorno bruto é marketing. Sempre mostre o que sobra depois dos impostos.

2. RETORNO REAL
   Rentabilidade abaixo do IPCA é perda de poder de compra, mesmo que seja positiva em reais.
   Sempre calcule: retorno real = retorno nominal − inflação (equação de Fisher).

3. BENCHMARK MÍNIMO
   O custo de oportunidade de risco zero é o Tesouro Selic líquido de IR.
   Qualquer produto que fique abaixo disso sem vantagem equivalente (liquidez, isenção, garantia)
   é desvantajoso — sem desculpa.

4. LCI/LCA — COMO AVALIAR
   A isenção de IR é um benefício real. Mas bancos compensam com taxas menores.
   A chave é o "CDB equivalente bruto": se o emissor oferece um CDB que pague mais do que esse
   equivalente, a LCI/LCA é menos vantajosa do que parece. Se não oferece, a LCI/LCA ganhou.
   Avalie também: existe carência? Existe spread de saída? A "liquidez diária" é real?

5. TESOURO IPCA+ — Marcação a Mercado
   Quando a taxa de mercado CAI, o preço do papel SOBE (ganho de MTM para quem vende antes).
   Quando a taxa de mercado SOBE, o preço CAI (perda para quem vende antes).
   Quem segura até o vencimento recebe o contratado — independente do MTM.
   Explique em R$ o que significa: "se vender hoje, você recebe R$ X a mais/menos".

6. DURATION — RISCO E AMPLIFICAÇÃO
   Duration mede a sensibilidade do preço à variação de taxa.
   Duration de 7 anos = uma queda de 1 p.p. na taxa valoriza o papel ~7% (e vice-versa).
   Alta duration não é ruim por si só — é um amplificador. Avalie se o prêmio de taxa compensa.

7. EFICIÊNCIA FISCAL NO TESOURO
   A tabela regressiva de IR vai de 22,5% (curto prazo) a 15% (mais de 720 dias).
   Vender antes de atingir o IR mínimo tem um custo fiscal real — quantifique-o em R$.

8. CILADAS COMUNS — IDENTIFIQUE E NOMEIE (se presentes):
   - Comparação de taxa bruta de um produto com taxa líquida de outro (fraude comparativa)
   - "Liquidez diária" com carência ou spread de saída embutido
   - Prazo longo sem prêmio de taxa proporcional ao risco
   - Retorno nominal positivo com retorno real negativo (perde para a inflação)
   - CDB de banco grande abaixo do CDI líquido do Tesouro Selic (o banco ganha, você perde)

═══ FORMATO DE RESPOSTA ═══
Responda EXCLUSIVAMENTE com o JSON abaixo — sem texto antes, sem texto depois, sem markdown:

{
  "avaliacao": "bom" | "regular" | "ruim",
  "titulo": "string — 1 frase de impacto resumindo o veredicto",
  "analise": "string — 3 a 5 parágrafos em linguagem simples com a análise completa (use \\n para parágrafos)",
  "numerosChave": {
    "retornoLiquidoEstimado": "string — ex: '9,2% a.a. líquido de IR'",
    "ganhoRealAcimaIpca": "string — ex: '+4,1% a.a. acima do IPCA projetado'",
    "comparacaoTesouroSelic": "string — ex: '+0,6 p.p. acima do Tesouro Selic líquido'"
  },
  "recomendacao": "MANTER" | "VENDER" | "AGUARDAR" | "EVITAR",
  "timing": "string — ex: 'imediato', 'aguardar 43 dias para IR mínimo de 15%', 'manter até vencimento'",
  "ciladas": ["lista de alertas específicos ao caso — pode ser vazia []"],
  "resumo": "string — 1 frase conclusiva que qualquer pessoa sem conhecimento financeiro entende"
}`;

// ─── BUILDERS DE PROMPT POR TIPO ─────────────────────────────────────────────

function buildPromptLciLca(p: PayloadLciLca): string {
  const fmtR = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (v: number) => v.toFixed(2);
  const diffCdb = p.taxaLciLca - p.cdbEquivalente;

  return `INVESTIMENTO EM ANÁLISE: LCI/LCA (isenta de IR e IOF)

Dados brutos:
• Prazo: ${p.prazoDias} dias corridos
• Taxa da LCI/LCA: ${fmtPct(p.taxaLciLca)}% do CDI
• CDI anual atual: ${fmtPct(p.cdiAtual)}% a.a.
• IPCA projetado 12 meses: ${fmtPct(p.ipcaProjetado)}% a.a.
• Aporte: R$ ${fmtR(p.aporte)}

Métricas calculadas (use-as diretamente na análise):
• Alíquota IR do CDB equivalente no prazo: ${p.aliquotaIr.toFixed(1)}%
• CDB bruto equivalente para empatar com esta LCI/LCA: ${fmtPct(p.cdbEquivalente)}% do CDI
  → Interpretação: só compensa trocar esta LCI/LCA por um CDB que pague ACIMA de ${fmtPct(p.cdbEquivalente)}% do CDI.
  → Diferença atual taxa LCI vs CDB equiv.: ${diffCdb > 0 ? '+' : ''}${fmtPct(diffCdb)} p.p. ${diffCdb > 0 ? '(LCI mais vantajosa na comparação direta)' : '(LCI menos vantajosa — o banco capturou o benefício fiscal)'}
• Rendimento líquido da LCI/LCA no período: R$ ${fmtR(p.rendLciLiquido)}
• Rendimento líquido do CDB equivalente no mesmo período: R$ ${fmtR(p.rendCdbLiquido)}
• Taxa efetiva anual líquida da LCI/LCA: ${fmtPct(p.rendLciPctAa)}% a.a.
• Ganho real acima do IPCA projetado: ${p.ganhoRealLci >= 0 ? '+' : ''}${fmtPct(p.ganhoRealLci)}% a.a.
• Avaliação de mercado da taxa: ${p.benchmarkLabel} — "${p.benchmarkDescricao}"

Por favor, analise este investimento para um investidor brasileiro de pessoa física.
Concentre-se em responder: a isenção de IR foi capturada pelo emissor (taxa baixa) ou repassada ao investidor?`;
}

function buildPromptTesouro(p: PayloadTesouro): string {
  const fmtR = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (v: number) => v.toFixed(2);
  const delta = p.taxaAtual - p.taxaMediaContratada;
  const direcaoTaxa =
    delta > 0
      ? `SUBIU ${fmtPct(delta)} p.p. → papel DESVALORIZOU (perda de MTM)`
      : `CAIU ${fmtPct(Math.abs(delta))} p.p. → papel VALORIZOU (ganho de MTM)`;

  const loteLines = p.lotes
    .map(
      (l, i) =>
        `  Lote ${i + 1}: compra ${l.dataCompra} | R$ ${fmtR(l.valorInvestido)} | ${fmtPct(l.taxaContratada)}% a.a.`,
    )
    .join('\n');

  return `INVESTIMENTO EM ANÁLISE: CARTEIRA TESOURO DIRETO IPCA+

Lotes registrados (${p.lotes.length} lote${p.lotes.length > 1 ? 's' : ''}):
${loteLines}

Cenário atual de mercado:
• Taxa IPCA+ ofertada HOJE: ${fmtPct(p.taxaAtual)}% a.a.
• Duration Macaulay estimada: ${p.durationAnos} anos

Análise de Marcação a Mercado (método Duration Modificada + Convexidade — padrão ANBIMA/Fabozzi):
• Total investido: R$ ${fmtR(p.totalInvestido)}
• Taxa média contratada (ponderada pelo capital): ${fmtPct(p.taxaMediaContratada)}% a.a.
• Duration Modificada média: ${fmtPct(p.durationModMedia)} anos
• Variação de taxa: ${fmtPct(Math.abs(delta))} p.p. — taxa ${direcaoTaxa}
• MTM total estimado (ganho/perda se vender hoje): ${p.mtmTotal >= 0 ? '+' : ''}R$ ${fmtR(p.mtmTotal)}

Análise fiscal:
• Alíquota IR média atual (ponderada): ${p.aliquotaIrMedia.toFixed(1)}%
• Dias médios para atingir IR mínimo (15%): ${p.diasParaMenorIr === 0 ? 'já atingido em todos os lotes' : `${p.diasParaMenorIr} dias`}
• Ganho líquido se vender HOJE (IR atual): ${p.ganhoLiquidoHoje >= 0 ? '+' : ''}R$ ${fmtR(p.ganhoLiquidoHoje)}
• Ganho líquido aguardando IR 15%: ${p.ganhoLiquidoIrMin >= 0 ? '+' : ''}R$ ${fmtR(p.ganhoLiquidoIrMin)}
• Economia fiscal esperando: ${p.economiaIr > 0 ? `+R$ ${fmtR(p.economiaIr)}` : 'nenhuma (IR já no mínimo)'}
• Sinal quantitativo calculado: ${p.sinal} (força: ${p.forcaSinal})

Por favor, analise esta carteira para um investidor brasileiro de pessoa física.
Foque especialmente na decisão de VENDER AGORA vs AGUARDAR, justificando com os números acima.
Se há lotes com perfis muito diferentes, destaque o mais relevante.`;
}

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

const VERTEX_CONFIG = {
  maxTokensInput: 120000,
  maxOutputTokens: 8192,
  temperature: 0.3,
};

const DEFAULT_VERTEX_LOCATION = 'global';
// Teto de espera por chamada Vertex (paridade com a frota); a mint OAuth tem teto próprio no cliente.
const VERTEX_REQUEST_TIMEOUT_MS = 80_000;

function structuredLog(level: string, message: string, context = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...context,
  };
  console.log(JSON.stringify(logEntry));
}

// ── Telemetria: registra uso de AI no BIGDATA_DB ──
function logAiUsage(
  db: D1DatabaseLike | undefined,
  entry: {
    module: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    latency_ms: number;
    status: string;
    error_detail?: string;
  },
) {
  if (!db || typeof db.prepare !== 'function') return;
  (async () => {
    try {
      await db
        .prepare(`
        CREATE TABLE IF NOT EXISTS ai_usage_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          module TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0, latency_ms INTEGER DEFAULT 0,
          status TEXT DEFAULT 'ok', error_detail TEXT
        )
      `)
        .all();
      await db
        .prepare(`
        INSERT INTO ai_usage_logs (module, model, input_tokens, output_tokens, latency_ms, status, error_detail)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          entry.module,
          entry.model,
          entry.input_tokens,
          entry.output_tokens,
          entry.latency_ms,
          entry.status,
          entry.error_detail || null,
        )
        .run();
    } catch (err) {
      console.warn('[telemetry] ai_usage_logs INSERT failed:', err instanceof Error ? err.message : err);
    }
  })();
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────

export const onRequestPost = async ({ env, request }: Context) => {
  try {
    const originError = requireAllowedOrigin(request);
    if (originError) return originError;

    const rateLimitError = await enforceRateLimit(request, env.BIGDATA_DB, 'analisar_ia');
    if (rateLimitError) return rateLimitError;

    const saKeyJson = typeof env?.VERTEX_SA_KEY === 'string' && env.VERTEX_SA_KEY.length > 0 ? env.VERTEX_SA_KEY : null;
    if (!saKeyJson) {
      return jsonResponse({ ok: false, error: 'Serviço de IA indisponível.' }, 503);
    }

    let payload: Payload;
    try {
      payload = (await request.json()) as Payload;
    } catch {
      return jsonResponse({ ok: false, error: 'Payload JSON inválido.' }, 400);
    }

    if (!payload?.tipo || !['lci-lca', 'tesouro-ipca'].includes(payload.tipo)) {
      return jsonResponse({ ok: false, error: 'Campo "tipo" inválido.' }, 400);
    }

    // Monta o prompt de usuário de acordo com o tipo
    const userPrompt =
      payload.tipo === 'lci-lca'
        ? buildPromptLciLca(payload as PayloadLciLca)
        : buildPromptTesouro(payload as PayloadTesouro);

    const ai = new VertexGenAI({
      saKeyJson,
      // Sem VERTEX_PROJECT, o cliente deriva o project do project_id da SA (portável para forks).
      project: env?.VERTEX_PROJECT,
      location: env?.VERTEX_LOCATION || DEFAULT_VERTEX_LOCATION,
    });
    const modelName = await loadConfiguredOraculoModel(env?.BIGDATA_DB, 'modeloAnalise');

    const safetySettings = [
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_ONLY_HIGH' },
    ];

    const _telStart = Date.now();
    try {
      const countRes = await ai.models.countTokens({
        model: modelName,
        contents: userPrompt,
        config: { httpOptions: { timeout: 20_000 } },
      });
      const inputTokens = countRes.totalTokens || 0;
      if (inputTokens > VERTEX_CONFIG.maxTokensInput) {
        structuredLog('error', 'Token limit exceeded', { endpoint: 'analisar-ia', tokens: inputTokens });
        return jsonResponse({ ok: false, error: `Contexto muito longo: ${inputTokens} tokens.` }, 413);
      }
    } catch (countError) {
      structuredLog('warn', 'Token count failed', { endpoint: 'analisar-ia', error: String(countError) });
    }

    let rawText = '';
    let usageDetails = {};
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: userPrompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            temperature: VERTEX_CONFIG.temperature,
            maxOutputTokens: VERTEX_CONFIG.maxOutputTokens,
            // Sem thinkingConfig: o REST v1 do Vertex rejeita thinkingBudgetTokens
            // (400 Unknown name) e o v1beta o ignorava silenciosamente — o
            // comportamento efetivo (sem budget de thinking) é preservado.
            safetySettings,
            httpOptions: { timeout: VERTEX_REQUEST_TIMEOUT_MS },
          },
        });

        if (response.text) {
          rawText = response.text;
          const metadata = response.usageMetadata || {};
          usageDetails = {
            promptTokens: metadata.promptTokenCount || 0,
            outputTokens: metadata.candidatesTokenCount || 0,
            cachedTokens: metadata.cachedContentTokenCount || 0,
          };
          structuredLog('info', 'Geracao Gemini concluida', {
            endpoint: 'analisar-ia',
            attempt: tentativa + 1,
            usage: usageDetails,
          });
          break;
        } else {
          throw new Error('Gemini retornou resposta vazia.');
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        structuredLog('warn', 'Falha ao requisitar Gemini', {
          endpoint: 'analisar-ia',
          attempt: tentativa + 1,
          error: errMsg,
        });
        if (tentativa === 1) {
          void logAiUsage(env?.BIGDATA_DB, {
            module: 'oraculo-analisar-ia',
            model: modelName,
            input_tokens: 0,
            output_tokens: 0,
            latency_ms: Date.now() - _telStart,
            status: 'error',
            error_detail: errMsg.slice(0, 200),
          });
          return jsonResponse({ ok: false, error: `Falha na requisição AI Gemini: ${errMsg}` }, 500);
        }
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    if (!rawText) {
      structuredLog('error', 'Gemini retornou vazio apos retentativas', { endpoint: 'analisar-ia' });
      void logAiUsage(env?.BIGDATA_DB, {
        module: 'oraculo-analisar-ia',
        model: modelName,
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - _telStart,
        status: 'error',
        error_detail: 'Empty response after retries',
      });
      return jsonResponse({ ok: false, error: 'Gemini retornou resposta vazia.' }, 500);
    }

    // Telemetria de sucesso
    void logAiUsage(env?.BIGDATA_DB, {
      module: 'oraculo-analisar-ia',
      model: modelName,
      input_tokens: (usageDetails as { promptTokens?: number }).promptTokens || 0,
      output_tokens: (usageDetails as { outputTokens?: number }).outputTokens || 0,
      latency_ms: Date.now() - _telStart,
      status: 'ok',
    });

    // Parse do JSON estruturado retornado pelo modelo
    let analise: AnaliseIA;
    try {
      analise = JSON.parse(rawText) as AnaliseIA;
    } catch {
      return jsonResponse(
        { ok: false, error: 'Resposta do Gemini não é JSON válido.', raw: rawText.slice(0, 500) },
        500,
      );
    }

    // Persiste no D1 para auditoria histórica
    try {
      const db = env?.BIGDATA_DB;
      if (db && typeof db.prepare === 'function') {
        const risco = analise.avaliacao === 'ruim' ? 'alto' : analise.avaliacao === 'regular' ? 'medio' : 'baixo';
        await db
          .prepare(
            `INSERT INTO oraculo_auditorias_ia (id, created_at, observacao, risco, recomendacao)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
          )
          .bind(
            crypto.randomUUID(),
            new Date().toISOString(),
            `[${payload.tipo}] ${analise.titulo} — ${analise.resumo}`,
            risco,
            analise.recomendacao,
          )
          .run();
      }
    } catch {
      // Persitência no D1 é secundária — não bloqueia a resposta ao client
    }

    return jsonResponse({ ok: true, analise });
  } catch (error) {
    console.error('analisar-ia:onRequestPost', error);
    return jsonResponse({ ok: false, error: 'Erro interno.' }, 500);
  }
};
