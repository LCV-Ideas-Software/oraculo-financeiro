import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1DatabaseLike } from './_shared/security';

const runtime = vi.hoisted(() => {
  class MockVertexHttpError extends Error {
    constructor(
      message: string,
      readonly status: number,
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
    totalTokens: 570,
    generate404Models: [] as string[],
    MockVertexHttpError,
  };
});

vi.mock('./_shared/vertex', () => ({
  VertexHttpError: runtime.MockVertexHttpError,
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
        if (runtime.generate404Models.includes(request.model as string)) {
          throw new runtime.MockVertexHttpError(
            `Vertex generateContent falhou (HTTP 404): Publisher Model \`${request.model}\` not found.`,
            404,
          );
        }
        return {
          text: runtime.generateText,
          usageMetadata: { promptTokenCount: 538, candidatesTokenCount: 40 },
        };
      },
    };
  },
}));

import { onRequestPost } from './tesouro-ipca-vision';

const LOTES = [
  { dataCompra: '2026-02-26', valorInvestido: 15491.04, taxaContratada: 7.41 },
  { dataCompra: '2026-03-03', valorInvestido: 1011.09, taxaContratada: 7.59 },
];

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
  request: new Request('https://oraculo-financeiro.lcv.app.br/api/tesouro-ipca-vision', {
    method: 'POST',
    headers: { Origin: 'https://oraculo-financeiro.lcv.app.br', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
});

beforeEach(() => {
  runtime.constructorOptions.length = 0;
  runtime.generateRequests.length = 0;
  runtime.countRequests.length = 0;
  runtime.generateText = JSON.stringify(LOTES);
  runtime.totalTokens = 570;
  runtime.generate404Models.length = 0;
});

describe('/api/tesouro-ipca-vision — transporte Vertex multimodal', () => {
  it('retorna 503 quando VERTEX_SA_KEY está ausente', async () => {
    const res = await onRequestPost(
      context({ imageBase64: 'QUJD', mimeType: 'application/pdf' }, { BIGDATA_DB: createDb(null) }),
    );
    expect(res.status).toBe(503);
    expect(runtime.generateRequests).toHaveLength(0);
  });

  it('retorna 400 sem imageBase64 ou mimeType', async () => {
    const res = await onRequestPost(
      context({ mimeType: 'image/png' }, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: createDb(null) }),
    );
    expect(res.status).toBe(400);
  });

  it('envia o inlineData multimodal, usa o modelo do seletor (modeloVision) e NUNCA envia thinkingConfig', async () => {
    const db = createDb(JSON.stringify({ modeloAnalise: 'gemini-2.5-pro', modeloVision: 'gemini-2.5-flash' }));
    const res = await onRequestPost(
      context({ imageBase64: 'QUJD', mimeType: 'application/pdf' }, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: db }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: LOTES });

    // Sem VERTEX_PROJECT no env, o handler não fixa projeto: o cliente deriva do project_id da SA.
    expect(runtime.constructorOptions[0]!.project).toBeUndefined();
    const req = runtime.generateRequests[0]!;
    expect(req.model).toBe('gemini-2.5-flash');
    expect(req.contents).toEqual([
      { inlineData: { data: 'QUJD', mimeType: 'application/pdf' } },
      'Extraia os dados estruturados deste arquivo (imagem ou PDF).',
    ]);
    const config = req.config as Record<string, unknown>;
    expect(config.responseMimeType).toBe('application/json');
    expect(config.temperature).toBe(0.1);
    // Decisão provada no Vertex REST v1: thinkingBudgetTokens é campo desconhecido (400).
    expect(config.thinkingConfig).toBeUndefined();
    expect(JSON.stringify(req)).not.toContain('thinking');
    // Teto de espera nas chamadas Vertex (paridade com a frota: 20s count / 80s generate).
    expect(config.httpOptions).toEqual({ timeout: 80_000 });
    expect((runtime.countRequests[0]!.config as Record<string, unknown>).httpOptions).toEqual({ timeout: 20_000 });

    // O countTokens de pré-checagem também recebe o inlineData
    expect(runtime.countRequests[0]!.contents).toEqual([
      { inlineData: { data: 'QUJD', mimeType: 'application/pdf' } },
      'Extraia os dados estruturados deste arquivo (imagem ou PDF).',
    ]);
  });

  it('respeita o seletor na 1ª chamada e cai no padrão validado quando o modelo selecionado está indisponível (404)', async () => {
    runtime.generate404Models.push('gemini-9.9-ultra');
    const db = createDb(JSON.stringify({ modeloVision: 'gemini-9.9-ultra' }));
    const res = await onRequestPost(
      context({ imageBase64: 'QUJD', mimeType: 'application/pdf' }, { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: db }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: LOTES });
    // O seletor é sempre honrado primeiro; o fallback só entra após a indisponibilidade real.
    expect(runtime.generateRequests.map((r) => r.model)).toEqual(['gemini-9.9-ultra', 'gemini-3.1-pro-preview']);
  });

  it('cai no modelo padrão quando o seletor está vazio e retorna 500 quando a IA não devolve array', async () => {
    runtime.generateText = JSON.stringify({ nao: 'array' });
    const res = await onRequestPost(
      context(
        { imageBase64: 'QUJD', mimeType: 'image/png' },
        { VERTEX_SA_KEY: '{"sa":"x"}', BIGDATA_DB: createDb(null) },
      ),
    );
    expect(runtime.generateRequests[0]!.model).toBe('gemini-3.1-pro-preview');
    expect(res.status).toBe(500);
  });
});
