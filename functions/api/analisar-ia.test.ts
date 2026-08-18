import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1DatabaseLike } from './_shared/security';

const runtime = vi.hoisted(() => {
  class MockVertexHttpError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly operation: string,
    ) {
      super(message);
      this.name = 'VertexHttpError';
    }
  }
  return {
    constructorOptions: [] as Record<string, unknown>[],
    generateRequests: [] as Record<string, unknown>[],
    countRequests: [] as Record<string, unknown>[],
    generateText: '',
    totalTokens: 100,
    count404Models: [] as string[],
    generate404Models: [] as string[],
    generate404Operation: 'generateContent',
    generateFailure: null as Error | null,
    MockVertexHttpError,
  };
});

vi.mock('./_shared/vertex', () => ({
  VertexHttpError: runtime.MockVertexHttpError,
  // Espelha a semantica do sanitizador real sobre a classe MOCK (instanceof).
  sanitizeAiErrorDetail: (error: unknown) =>
    error instanceof runtime.MockVertexHttpError
      ? `vertex_${error.operation}_http_${error.status}`
      : 'erro_nao_classificado_mock',
  VertexGenAI: class {
    constructor(options: Record<string, unknown>) {
      runtime.constructorOptions.push(options);
    }
    readonly models = {
      countTokens: async (request: Record<string, unknown>) => {
        runtime.countRequests.push(request);
        if (runtime.count404Models.includes(request.model as string)) {
          throw new runtime.MockVertexHttpError(
            `Vertex countTokens falhou (HTTP 404): Publisher Model \`${request.model}\` not found.`,
            404,
            'countTokens',
          );
        }
        return { totalTokens: runtime.totalTokens };
      },
      generateContent: async (request: Record<string, unknown>) => {
        runtime.generateRequests.push(request);
        if (runtime.generateFailure) throw runtime.generateFailure;
        if (runtime.generate404Models.includes(request.model as string)) {
          throw new runtime.MockVertexHttpError(
            `Vertex generateContent falhou (HTTP 404): Publisher Model \`${request.model}\` not found.`,
            404,
            runtime.generate404Operation,
          );
        }
        return {
          text: runtime.generateText,
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 },
        };
      },
    };
  },
}));

import { onRequestPost } from './analisar-ia';

const ANALISE_VALIDA = {
  avaliacao: 'bom',
  titulo: 'LCI vantajosa',
  analise: 'Análise completa.',
  numerosChave: {
    retornoLiquidoEstimado: '9,2% a.a.',
    ganhoRealAcimaIpca: '+4,1% a.a.',
    comparacaoTesouroSelic: '+0,6 p.p.',
  },
  recomendacao: 'MANTER',
  timing: 'imediato',
  ciladas: [],
  resumo: 'Bom investimento.',
};

const PAYLOAD_LCI = {
  tipo: 'lci-lca',
  prazoDias: 360,
  taxaLciLca: 95,
  aporte: 10000,
  cdiAtual: 10.5,
  ipcaProjetado: 4.2,
  aliquotaIr: 17.5,
  cdbEquivalente: 115.15,
  rendLciLiquido: 998.12,
  rendCdbLiquido: 980.0,
  rendLciPctAa: 9.98,
  ganhoRealLci: 5.5,
  benchmarkLabel: 'boa',
  benchmarkDescricao: 'acima da mediana',
};

// Identificadores sintéticos de propósito: a fixture reproduz o FORMATO da mensagem
// do Vertex (project id + service account + permissão), nunca o inventário real —
// que é justamente o que este teste garante não sair na resposta.
const SYNTHETIC_PROJECT_ID = 'exemplo-projeto-000';
const VERTEX_UPSTREAM_DETAIL = `Vertex generateContent falhou (HTTP 403): Permission denied on resource project ${SYNTHETIC_PROJECT_ID}; caller sa-exemplo@${SYNTHETIC_PROJECT_ID}.iam.gserviceaccount.com lacks aiplatform.endpoints.predict.`;

const createDb = (configJson: string | null): D1DatabaseLike => ({
  prepare: (query: string) => {
    const isModuleConfig = query.includes('admin_module_configs');
    const bound = {
      run: async () => ({}),
      all: async () => ({}),
      first: async <T>() => (isModuleConfig && configJson !== null ? ({ config_json: configJson } as T) : null),
    };
    return { ...bound, bind: () => bound };
  },
});

const context = (body: unknown, env: Record<string, unknown>) => ({
  env: env as never,
  request: new Request('https://oraculo-financeiro.lcv.app.br/api/analisar-ia', {
    method: 'POST',
    headers: { Origin: 'https://oraculo-financeiro.lcv.app.br', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
});

beforeEach(() => {
  runtime.constructorOptions.length = 0;
  runtime.generateRequests.length = 0;
  runtime.countRequests.length = 0;
  runtime.generateText = JSON.stringify(ANALISE_VALIDA);
  runtime.totalTokens = 100;
  runtime.count404Models.length = 0;
  runtime.generate404Models.length = 0;
  runtime.generate404Operation = 'generateContent';
  runtime.generateFailure = null;
});

describe('/api/analisar-ia — transporte Vertex', () => {
  it('retorna 503 quando VERTEX_SA_KEY está ausente', async () => {
    const res = await onRequestPost(context(PAYLOAD_LCI, { BIGDATA_DB: createDb(null) }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: 'Serviço de IA indisponível.' });
    expect(runtime.generateRequests).toHaveLength(0);
  });

  it('retorna 400 para payload sem tipo válido', async () => {
    const res = await onRequestPost(
      context({ tipo: 'outro' }, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: createDb(null) }),
    );
    expect(res.status).toBe(400);
  });

  it('usa o modelo do seletor do admin (modeloAnalise), envia o combo validado e NUNCA envia thinkingConfig', async () => {
    const db = createDb(JSON.stringify({ modeloAnalise: 'gemini-2.5-pro', modeloVision: 'gemini-2.5-flash' }));
    const res = await onRequestPost(context(PAYLOAD_LCI, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: db }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, analise: ANALISE_VALIDA });

    expect(runtime.constructorOptions[0]).toMatchObject({ saKeyJson: '{"sa":"x"}' });
    // Sem VERTEX_PROJECT no env, o handler não fixa projeto: o cliente deriva do project_id da SA.
    expect(runtime.constructorOptions[0]!.project).toBeUndefined();
    const req = runtime.generateRequests[0]!;
    expect(req.model).toBe('gemini-2.5-pro');
    const config = req.config as Record<string, unknown>;
    expect(config.responseMimeType).toBe('application/json');
    expect(config.temperature).toBe(0.3);
    expect(config.maxOutputTokens).toBe(8192);
    expect(typeof config.systemInstruction).toBe('string');
    // Decisão provada no Vertex REST v1: o campo thinkingBudgetTokens usado pela
    // versão AI Studio é desconhecido da API (400 Unknown name) — não pode ser enviado.
    expect(config.thinkingConfig).toBeUndefined();
    expect(JSON.stringify(req)).not.toContain('thinking');
    // Teto de espera nas chamadas Vertex (paridade com a frota: 20s count / 80s generate).
    expect(config.httpOptions).toEqual({ timeout: 80_000 });
    expect((runtime.countRequests[0]!.config as Record<string, unknown>).httpOptions).toEqual({ timeout: 20_000 });
  });

  it('cai no modelo padrão quando o seletor está vazio ou o config não existe', async () => {
    const res = await onRequestPost(context(PAYLOAD_LCI, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: createDb(null) }));
    expect(res.status).toBe(200);
    expect(runtime.generateRequests[0]!.model).toBe('gemini-3.1-pro-preview');
  });

  it('respeita o seletor na 1ª chamada e cai no padrão validado quando o modelo selecionado está indisponível (404)', async () => {
    runtime.generate404Models.push('gemini-9.9-ultra');
    const db = createDb(JSON.stringify({ modeloAnalise: 'gemini-9.9-ultra' }));
    const res = await onRequestPost(context(PAYLOAD_LCI, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: db }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, analise: ANALISE_VALIDA });
    // O seletor é sempre honrado primeiro; o fallback só entra após a indisponibilidade real.
    expect(runtime.generateRequests.map((r) => r.model)).toEqual(['gemini-9.9-ultra', 'gemini-3.1-pro-preview']);
    // O pipeline inteiro é repetido no fallback: o guard de entrada roda de novo no modelo padrão.
    expect(runtime.countRequests.map((r) => r.model)).toEqual(['gemini-9.9-ultra', 'gemini-3.1-pro-preview']);
  });

  it('quando o 404 aparece já no countTokens, o fallback re-conta com o padrão antes de gerar', async () => {
    runtime.count404Models.push('gemini-9.9-ultra');
    runtime.generate404Models.push('gemini-9.9-ultra');
    const db = createDb(JSON.stringify({ modeloAnalise: 'gemini-9.9-ultra' }));
    const res = await onRequestPost(context(PAYLOAD_LCI, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: db }));

    expect(res.status).toBe(200);
    expect(runtime.countRequests.map((r) => r.model)).toEqual(['gemini-9.9-ultra', 'gemini-3.1-pro-preview']);
    // O modelo indisponível nunca chega à geração; o padrão gera após passar pelo guard.
    expect(runtime.generateRequests.map((r) => r.model)).toEqual(['gemini-3.1-pro-preview']);
  });

  it('o guard de maxTokensInput vale também no caminho de fallback (413 sem gerar)', async () => {
    runtime.count404Models.push('gemini-9.9-ultra');
    runtime.totalTokens = 200_000;
    const db = createDb(JSON.stringify({ modeloAnalise: 'gemini-9.9-ultra' }));
    const res = await onRequestPost(context(PAYLOAD_LCI, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: db }));

    expect(res.status).toBe(413);
    expect(runtime.generateRequests).toHaveLength(0);
  });

  it('um 404 vindo da mint OAuth NÃO dispara fallback de modelo (proveniência da operação)', async () => {
    runtime.generate404Models.push('gemini-9.9-ultra');
    runtime.generate404Operation = 'oauth-token';
    const db = createDb(JSON.stringify({ modeloAnalise: 'gemini-9.9-ultra' }));
    const res = await onRequestPost(context(PAYLOAD_LCI, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: db }));

    expect(res.status).toBe(500);
    expect(runtime.generateRequests.map((r) => r.model)).toEqual(['gemini-9.9-ultra', 'gemini-9.9-ultra']);
  });

  it('não entra em loop quando o próprio modelo padrão está indisponível (404)', async () => {
    runtime.generate404Models.push('gemini-3.1-pro-preview');
    const res = await onRequestPost(context(PAYLOAD_LCI, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: createDb(null) }));
    expect(res.status).toBe(500);
    expect(runtime.generateRequests).toHaveLength(2);
  });

  it('retorna 413 quando a contagem de tokens excede o teto de entrada', async () => {
    runtime.totalTokens = 200_000;
    const res = await onRequestPost(context(PAYLOAD_LCI, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: createDb(null) }));
    expect(res.status).toBe(413);
    expect(runtime.generateRequests).toHaveLength(0);
  });

  it('não devolve o detalhe do erro do Vertex no corpo da resposta 500', async () => {
    runtime.generateFailure = new runtime.MockVertexHttpError(VERTEX_UPSTREAM_DETAIL, 403, 'generateContent');
    const res = await onRequestPost(context(PAYLOAD_LCI, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: createDb(null) }));

    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain(VERTEX_UPSTREAM_DETAIL);
    expect(body).not.toContain(SYNTHETIC_PROJECT_ID);
    expect(body).not.toContain('iam.gserviceaccount.com');
    expect(body).not.toContain('aiplatform.endpoints.predict');
    expect(JSON.parse(body)).toEqual({ ok: false, error: 'Falha na requisição AI Gemini.' });
  });

  it('retorna 500 com excerto quando a resposta do modelo não é JSON', async () => {
    runtime.generateText = 'não é json';
    const res = await onRequestPost(context(PAYLOAD_LCI, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: createDb(null) }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok: boolean; raw?: string };
    expect(body.ok).toBe(false);
    expect(body.raw).toBe('não é json');
  });
});
