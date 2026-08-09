const SECRET_KEYS = ['VERTEX_SA_KEY', 'RESEND_API_KEY'] as const;

export async function onRequest(context: {
  request: Request;
  env: Record<string, unknown>;
  next: () => Promise<Response>;
}) {
  const url = new URL(context.request.url);

  // Bloqueio de exposição pública via URL interna .pages.dev
  if (url.hostname.endsWith('.pages.dev')) {
    url.hostname = 'oraculo-financeiro.lcv.app.br';
    return Response.redirect(url.toString(), 301);
  }

  // ========== SECRET STORE RESOLVER MIDDLEWARE ==========
  if (context.env) {
    await Promise.all(
      SECRET_KEYS.map(async (key) => {
        const binding = (context.env as Record<string, unknown>)[key];
        if (binding && typeof binding === 'object' && typeof (binding as Record<string, unknown>).get === 'function') {
          try {
            (context.env as Record<string, unknown>)[key] = await (binding as { get(): Promise<string> }).get();
          } catch (error) {
            console.warn(`[Secrets Store] Falha ao resolver secret ${key}:`, error);
            (context.env as Record<string, unknown>)[key] = undefined;
          }
        }
      }),
    );
  }

  return context.next();
}
