// Módulo: functions/api/_shared/oraculoModelConfig.ts
// Resolve os modelos configurados nos seletores do módulo Oráculo do admin-app
// (admin_module_configs / module_key 'oraculo-config', campos modeloAnalise e
// modeloVision). O seletor é SEMPRE respeitado: qualquer ID sintaticamente
// válido é usado exatamente como configurado — modelos novos nunca são
// rebaixados na seleção. A queda para o padrão validado acontece apenas
// (a) aqui, quando o valor está ausente/ilegível/inválido para compor a URL
// do publisher model, ou (b) em runtime nos handlers, quando o Vertex
// responde 404 para o modelo selecionado (indisponível).

import type { D1DatabaseLike } from './security';

export const DEFAULT_ORACULO_MODEL = 'gemini-3.1-pro-preview';

// O ID entra no path da URL do Vertex (…/publishers/google/models/<id>:verbo);
// aceita apenas o formato de publisher model: alfanumérico com ponto/hífen
// internos, sem separadores de path ou espaços.
const VALID_MODEL_ID = /^[a-z0-9](?:[a-z0-9.-]{0,126}[a-z0-9])?$/i;

export type OraculoModelField = 'modeloAnalise' | 'modeloVision';

export async function loadConfiguredOraculoModel(
  db: D1DatabaseLike | undefined,
  field: OraculoModelField,
): Promise<string> {
  if (!db) return DEFAULT_ORACULO_MODEL;
  try {
    const row = await db
      .prepare('SELECT config_json FROM admin_module_configs WHERE module_key = ? LIMIT 1')
      .bind('oraculo-config')
      .first<{ config_json?: string }>();
    if (!row?.config_json) return DEFAULT_ORACULO_MODEL;
    const config = JSON.parse(row.config_json) as Record<string, unknown>;
    const value = typeof config[field] === 'string' ? (config[field] as string).trim() : '';
    return VALID_MODEL_ID.test(value) ? value : DEFAULT_ORACULO_MODEL;
  } catch {
    return DEFAULT_ORACULO_MODEL;
  }
}
