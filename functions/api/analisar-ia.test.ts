import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1DatabaseLike } from './_shared/security';

const runtime = vi.hoisted(() => ({
  constructorOptions: [] as Record<string, unknown>[],
  generateRequests: [] as Record<string, unknown>[],
  countRequests: [] as Record<string, unknown>[],
  generateText: '',
  totalTokens: 100,
}));

vi.mock('./_shared/vertex', () => ({
  VertexGenAI: class {
    constructor(options: Record<string, unknown>) {
      runtime.constructorOptions.push(options);
    }
    readonly models = {
      countTokens: async (request: Record<string, unknown>) => {
        runtime.countRequests.push(request);
        return { totalTokens: runtime.totalTokens };
      },
      generateContent: async (request: Record<string, unknown>) => {
        runtime.generateRequests.push(request);
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
  });

  it('cai no modelo padrão quando o seletor está vazio ou o config não existe', async () => {
    const res = await onRequestPost(context(PAYLOAD_LCI, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: createDb(null) }));
    expect(res.status).toBe(200);
    expect(runtime.generateRequests[0]!.model).toBe('gemini-3.1-pro-preview');
  });

  it('retorna 413 quando a contagem de tokens excede o teto de entrada', async () => {
    runtime.totalTokens = 200_000;
    const res = await onRequestPost(context(PAYLOAD_LCI, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: createDb(null) }));
    expect(res.status).toBe(413);
    expect(runtime.generateRequests).toHaveLength(0);
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
