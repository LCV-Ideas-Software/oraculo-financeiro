// Módulo: oraculo-financeiro/functions/api/tesouro-ipca-vision.ts
// Versão: v01.11.00
// Descrição: OCR multimodal via Vertex AI (service account OAuth, REST v1 global) — extrai lotes do Tesouro IPCA+ a partir de imagens/PDFs de extratos; modelo do seletor do admin (modeloVision; padrão gemini-3.1-pro-preview).
// Alinhado ao padrão do analisar-ia.ts: retry, thought filtering, jsonResponse, safety BLOCK_ONLY_HIGH.

import { DEFAULT_ORACULO_MODEL, loadConfiguredOraculoModel } from './_shared/oraculoModelConfig';
import { type D1DatabaseLike, enforceRateLimit, jsonResponse, requireAllowedOrigin } from './_shared/security';
import { VertexGenAI, VertexHttpError } from './_shared/vertex';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Env {
  VERTEX_SA_KEY: string;
  VERTEX_PROJECT?: string;
  VERTEX_LOCATION?: string;
  BIGDATA_DB?: D1DatabaseLike;
}

interface Context {
  env: Env;
  request: Request;
}

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

const VERTEX_CONFIG = {
  maxTokensInput: 120000,
  maxOutputTokens: 8192,
  temperature: 0.1,
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

export const onRequestPost = async ({ request, env }: Context) => {
  try {
    const originError = requireAllowedOrigin(request);
    if (originError) return originError;

    if (env.BIGDATA_DB) {
      const rateLimitError = await enforceRateLimit(request, env.BIGDATA_DB, 'tesouro_ipca_vision');
      if (rateLimitError) return rateLimitError;
    }

    const saKeyJson = typeof env?.VERTEX_SA_KEY === 'string' && env.VERTEX_SA_KEY.length > 0 ? env.VERTEX_SA_KEY : null;
    if (!saKeyJson) {
      return jsonResponse({ ok: false, error: 'Serviço de IA indisponível.' }, 503);
    }

    let payload: { imageBase64: string; mimeType: string };
    try {
      payload = (await request.json()) as { imageBase64: string; mimeType: string };
    } catch {
      return jsonResponse({ ok: false, error: 'Payload JSON inválido.' }, 400);
    }

    if (!payload.imageBase64 || !payload.mimeType) {
      return jsonResponse({ ok: false, error: 'Arquivo base64 e mimeType são obrigatórios.' }, 400);
    }

    const systemInstruction = `Você é um consultor financeiro especialista em marcação a mercado do Tesouro Direto brasileiro.
Extraia TODOS os lotes de investimento do extrato do Tesouro IPCA+ enviado na imagem ou PDF.

ATENÇÃO: as datas no extrato estão em formato BRASILEIRO: dd/mm/aaaa (dia/mês/ano).
Exemplo: "26/02/2026" significa 26 de fevereiro de 2026 e deve ser convertido para "2026-02-26".

Retorne EXATAMENTE um array JSON contendo um objeto para CADA lote encontrado na imagem:
[
  {
    "dataCompra": "2026-02-26",
    "valorInvestido": 15491.04,
    "taxaContratada": 7.41
  },
  {
    "dataCompra": "2026-03-03",
    "valorInvestido": 1011.09,
    "taxaContratada": 7.59
  }
]

Regras de Extração e Conversão:
1. dataCompra: Encontre a coluna "Data da Aplicação" ou "Data de Compra". O formato é dd/mm/aaaa (BRASILEIRO). Converta para YYYY-MM-DD (ISO). ATENÇÃO: o ano está nos 4 últimos dígitos (ex: 26/02/2026 → ano é 2026, NÃO 2024).
2. valorInvestido: Encontre a coluna "Valor Investido" (AxB). Use o formato numérico com ponto decimal (ex: 15.491,04 → 15491.04). NÃO use o preço unitário do título.
3. taxaContratada: Encontre "Rentabilidade Contratada" (ex: IPCA + 7,41%). Extraia apenas o número após o "+". Converta vírgula para ponto (7,41 → 7.41).
4. Extraia TODOS os lotes da tabela — cada linha é um lote separado.
5. Ignore Tesouro Selic e Tesouro Prefixado. Extraia apenas Tesouro IPCA+.
6. Não retorne markdown, crases ou explicações. Apenas o array JSON.`;

    const ai = new VertexGenAI({
      saKeyJson,
      // Sem VERTEX_PROJECT, o cliente deriva o project do project_id da SA (portável para forks).
      project: env?.VERTEX_PROJECT,
      location: env?.VERTEX_LOCATION || DEFAULT_VERTEX_LOCATION,
    });
    let modelName = await loadConfiguredOraculoModel(env?.BIGDATA_DB, 'modeloVision');

    const safetySettings = [
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_ONLY_HIGH' },
    ];

    const _telStart = Date.now();

    const visionContents = [
      {
        inlineData: {
          data: payload.imageBase64,
          mimeType: payload.mimeType,
        },
      },
      'Extraia os dados estruturados deste arquivo (imagem ou PDF).',
    ];

    // Um 404 de publisher model (countTokens/generateContent) significa modelo
    // indisponível; um 404 da mint OAuth ou de qualquer outra origem não.
    const isModelUnavailable = (error: unknown): boolean =>
      error instanceof VertexHttpError && error.status === 404 && error.operation !== 'oauth-token';

    type PipelineOutcome =
      | { kind: 'ok'; rawText: string; usageDetails: Record<string, number> }
      | { kind: 'model-unavailable' }
      | { kind: 'http-response'; response: Response };

    // Executa o pipeline completo (guard de maxTokensInput + geração com retry)
    // para um modelo. Com signalModelUnavailable, o 404 de publisher model
    // interrompe cedo para o caller repetir o pipeline INTEIRO no modelo
    // padrão — o guard de entrada é reavaliado no fallback, nunca contornado.
    const runVertexPipeline = async (model: string, signalModelUnavailable: boolean): Promise<PipelineOutcome> => {
      try {
        const countRes = await ai.models.countTokens({
          model,
          contents: visionContents,
          config: { httpOptions: { timeout: 20_000 } },
        });
        const inputTokens = countRes.totalTokens || 0;
        if (inputTokens > VERTEX_CONFIG.maxTokensInput) {
          structuredLog('error', 'Token limit exceeded in Vision', {
            endpoint: 'tesouro-ipca-vision',
            tokens: inputTokens,
          });
          return {
            kind: 'http-response',
            response: jsonResponse(
              { ok: false, error: `Documento muito grande para análise de ML: ${inputTokens} tokens.` },
              413,
            ),
          };
        }
      } catch (countError) {
        if (signalModelUnavailable && isModelUnavailable(countError)) return { kind: 'model-unavailable' };
        structuredLog('warn', 'Token count failed in Vision', {
          endpoint: 'tesouro-ipca-vision',
          error: String(countError),
        });
      }

      for (let tentativa = 0; tentativa < 2; tentativa++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: visionContents,
            config: {
              systemInstruction: systemInstruction,
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
            const metadata = response.usageMetadata || {};
            const usageDetails = {
              promptTokens: metadata.promptTokenCount || 0,
              outputTokens: metadata.candidatesTokenCount || 0,
              cachedTokens: metadata.cachedContentTokenCount || 0,
            };
            structuredLog('info', 'Geracao Gemini concluida', {
              endpoint: 'tesouro-ipca-vision',
              attempt: tentativa + 1,
              usage: usageDetails,
            });
            return { kind: 'ok', rawText: response.text, usageDetails };
          }
          throw new Error('Gemini retornou resposta vazia ou bloqueada pelos filtros de segurança.');
        } catch (error) {
          if (signalModelUnavailable && isModelUnavailable(error)) return { kind: 'model-unavailable' };
          const errMsg = error instanceof Error ? error.message : String(error);
          structuredLog('warn', 'Falha ao requisitar Gemini (Vision)', {
            endpoint: 'tesouro-ipca-vision',
            attempt: tentativa + 1,
            error: errMsg,
          });
          if (tentativa === 1) {
            void logAiUsage(env?.BIGDATA_DB, {
              module: 'oraculo-vision-ocr',
              model,
              input_tokens: 0,
              output_tokens: 0,
              latency_ms: Date.now() - _telStart,
              status: 'error',
              error_detail: errMsg.slice(0, 200),
            });
            return {
              kind: 'http-response',
              response: jsonResponse({ ok: false, error: `Falha na requisição AI Gemini: ${errMsg}` }, 500),
            };
          }
          await new Promise((r) => setTimeout(r, 800));
        }
      }

      // Rede defensiva (a última tentativa sempre retorna acima).
      structuredLog('error', 'Gemini retornou vazio em extacao OCR', { endpoint: 'tesouro-ipca-vision' });
      void logAiUsage(env?.BIGDATA_DB, {
        module: 'oraculo-vision-ocr',
        model,
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - _telStart,
        status: 'error',
        error_detail: 'Empty OCR response',
      });
      return {
        kind: 'http-response',
        response: jsonResponse(
          { ok: false, error: 'Gemini retornou resposta vazia ou bloqueada pelos filtros de segurança.' },
          500,
        ),
      };
    };

    // Seletor sempre respeitado: o modelo configurado roda primeiro; só quando
    // o Vertex o declara indisponível (404) o pipeline repete no padrão
    // validado. Quando o seletor JÁ é o padrão, o 404 segue o fluxo comum de
    // erro (sem loop de fallback).
    let outcome = await runVertexPipeline(modelName, modelName !== DEFAULT_ORACULO_MODEL);
    if (outcome.kind === 'model-unavailable') {
      structuredLog('warn', 'Modelo do seletor indisponível no Vertex — fallback para o padrão validado', {
        endpoint: 'tesouro-ipca-vision',
        selectedModel: modelName,
        fallbackModel: DEFAULT_ORACULO_MODEL,
      });
      modelName = DEFAULT_ORACULO_MODEL;
      outcome = await runVertexPipeline(modelName, false);
    }
    if (outcome.kind !== 'ok') {
      if (outcome.kind === 'http-response') return outcome.response;
      // Inalcançável: a repetição do pipeline roda com signalModelUnavailable=false.
      return jsonResponse({ ok: false, error: 'Erro interno.' }, 500);
    }
    const { rawText, usageDetails } = outcome;

    // Telemetria de sucesso
    void logAiUsage(env?.BIGDATA_DB, {
      module: 'oraculo-vision-ocr',
      model: modelName,
      input_tokens: (usageDetails as { promptTokens?: number }).promptTokens || 0,
      output_tokens: (usageDetails as { outputTokens?: number }).outputTokens || 0,
      latency_ms: Date.now() - _telStart,
      status: 'ok',
    });

    // Parse do array JSON estruturado retornado pelo modelo
    let extractedData: unknown[];
    try {
      const parsed = JSON.parse(rawText);
      if (!Array.isArray(parsed)) {
        throw new Error('A IA não retornou um array JSON.');
      }
      extractedData = parsed;
    } catch (error) {
      structuredLog('error', 'Impossivel fazer parse da IA (Vision)', {
        endpoint: 'tesouro-ipca-vision',
        response: String(error),
      });
      return jsonResponse(
        { ok: false, error: 'A IA não retornou um formato JSON válido.', raw: rawText.slice(0, 500) },
        500,
      );
    }

    return jsonResponse({ ok: true, data: extractedData });
  } catch (error) {
    console.error('tesouro-ipca-vision:onRequestPost', error);
    return jsonResponse({ ok: false, error: 'Erro interno.' }, 500);
  }
};
