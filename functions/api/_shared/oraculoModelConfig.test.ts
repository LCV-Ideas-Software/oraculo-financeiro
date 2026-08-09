import { describe, expect, it } from 'vitest';
import { DEFAULT_ORACULO_MODEL, loadConfiguredOraculoModel } from './oraculoModelConfig';
import type { D1DatabaseLike } from './security';

const dbWithConfig = (
  configJson: string | null,
  capture?: { queries: string[]; binds: unknown[] },
): D1DatabaseLike => ({
  prepare: (query: string) => {
    capture?.queries.push(query);
    return {
      bind: (...args: unknown[]) => {
        capture?.binds.push(...args);
        return {
          run: async () => ({}),
          all: async () => ({}),
          first: async <T>() => (configJson === null ? null : ({ config_json: configJson } as T)),
        };
      },
      run: async () => ({}),
      all: async () => ({}),
      first: async <T>() => null as T | null,
    };
  },
});

const throwingDb: D1DatabaseLike = {
  prepare: () => {
    throw new Error('D1 indisponível');
  },
};

describe('loadConfiguredOraculoModel', () => {
  it('lê o campo do seletor no armazenamento canônico do admin (admin_module_configs / oraculo-config)', async () => {
    const capture = { queries: [] as string[], binds: [] as unknown[] };
    const db = dbWithConfig(
      JSON.stringify({ modeloAnalise: 'gemini-2.5-pro', modeloVision: 'gemini-2.5-flash' }),
      capture,
    );

    const analise = await loadConfiguredOraculoModel(db, 'modeloAnalise');
    const vision = await loadConfiguredOraculoModel(db, 'modeloVision');

    expect(analise).toBe('gemini-2.5-pro');
    expect(vision).toBe('gemini-2.5-flash');
    expect(capture.queries[0]).toMatch(/admin_module_configs/u);
    expect(capture.queries[0]).toMatch(/module_key/u);
    expect(capture.binds[0]).toBe('oraculo-config');
  });

  it('cai no modelo padrão quando o campo está vazio, ausente ou o config não existe', async () => {
    expect(await loadConfiguredOraculoModel(dbWithConfig(JSON.stringify({ modeloAnalise: '' })), 'modeloAnalise')).toBe(
      DEFAULT_ORACULO_MODEL,
    );
    expect(await loadConfiguredOraculoModel(dbWithConfig(JSON.stringify({})), 'modeloVision')).toBe(
      DEFAULT_ORACULO_MODEL,
    );
    expect(await loadConfiguredOraculoModel(dbWithConfig(null), 'modeloAnalise')).toBe(DEFAULT_ORACULO_MODEL);
  });

  it('respeita o seletor mesmo para IDs fora da tabela validada (modelos novos nunca são rebaixados na seleção)', async () => {
    expect(
      await loadConfiguredOraculoModel(
        dbWithConfig(JSON.stringify({ modeloAnalise: 'gemini-pro-latest' })),
        'modeloAnalise',
      ),
    ).toBe('gemini-pro-latest');
    expect(
      await loadConfiguredOraculoModel(
        dbWithConfig(JSON.stringify({ modeloVision: 'gemini-9.9-ultra' })),
        'modeloVision',
      ),
    ).toBe('gemini-9.9-ultra');
  });

  it('rejeita apenas IDs sintaticamente inválidos para o path da URL do Vertex (fail-safe no padrão)', async () => {
    const malformados = [
      'models/gemini-3.1-pro-preview',
      'gemini 2.5 pro',
      '../../../projects/outro',
      'gemini:pro?x=1',
      '-gemini-flash',
    ];
    for (const id of malformados) {
      expect(
        await loadConfiguredOraculoModel(dbWithConfig(JSON.stringify({ modeloAnalise: id })), 'modeloAnalise'),
      ).toBe(DEFAULT_ORACULO_MODEL);
    }
  });

  it('aceita todos os nove publisher models validados', async () => {
    const validados = [
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ];
    for (const modelo of validados) {
      expect(
        await loadConfiguredOraculoModel(dbWithConfig(JSON.stringify({ modeloAnalise: modelo })), 'modeloAnalise'),
      ).toBe(modelo);
    }
  });

  it('falha para o padrão em erro de D1, JSON inválido ou banco ausente', async () => {
    expect(await loadConfiguredOraculoModel(throwingDb, 'modeloAnalise')).toBe(DEFAULT_ORACULO_MODEL);
    expect(await loadConfiguredOraculoModel(dbWithConfig('não-é-json'), 'modeloAnalise')).toBe(DEFAULT_ORACULO_MODEL);
    expect(await loadConfiguredOraculoModel(undefined, 'modeloVision')).toBe(DEFAULT_ORACULO_MODEL);
  });
});
