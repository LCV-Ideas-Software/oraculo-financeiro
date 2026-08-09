// Módulo: functions/api/_shared/oraculoModelConfig.ts
// Resolve os modelos configurados nos seletores do módulo Oráculo do admin-app
// (admin_module_configs / module_key 'oraculo-config', campos modeloAnalise e
// modeloVision). Fail-safe: qualquer ausência, erro de D1, JSON inválido ou ID
// fora da allowlist cai no modelo padrão — o app nunca fica sem transporte.

import type { D1DatabaseLike } from './security';

export const DEFAULT_ORACULO_MODEL = 'gemini-3.1-pro-preview';

// Publisher models do Vertex AI validados empiricamente (endpoint global,
// generateContent/countTokens 200). Tabela da Onda 2 + gemini-3.6-flash
// (validado 2026-08-09; teto declarado pela API: 1..65537-exclusivo).
const ALLOWED_ORACULO_MODELS = new Set([
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]);

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
    return ALLOWED_ORACULO_MODELS.has(value) ? value : DEFAULT_ORACULO_MODEL;
  } catch {
    return DEFAULT_ORACULO_MODEL;
  }
}
