import { describe, expect, it } from 'vitest';
import { sanitizeAiErrorDetail, VertexGenAI, VertexHttpError } from './vertex';

const te = new TextEncoder();

const b64urlToBuf = (s: string): Uint8Array<ArrayBuffer> => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return new Uint8Array(Buffer.from(b64, 'base64'));
};

const b64urlToJson = (s: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

const makeTestSa = async (kid: string) => {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${(pkcs8.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----\n`;
  return {
    publicKey: pair.publicKey,
    saJson: JSON.stringify({
      type: 'service_account',
      project_id: 'proj-x',
      private_key_id: kid,
      private_key: pem,
      client_email: `${kid}@proj-x.iam.gserviceaccount.com`,
      token_uri: 'https://oauth2.test.invalid/token',
    }),
  };
};

const jsonResponse = (status: number, payload: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }) as unknown as Response;

interface MockOpts {
  tokenPayload?: unknown;
  apiPayload?: unknown;
  tokenStatus?: number;
  apiStatus?: number;
  tokenDelay?: () => Promise<void>;
}

const makeFetchMock = (opts: MockOpts = {}) => {
  const { tokenPayload, apiPayload, tokenStatus = 200, apiStatus = 200, tokenDelay } = opts;
  const calls: {
    token: Array<{ url: string; init: RequestInit }>;
    api: Array<{ url: string; init: RequestInit }>;
  } = { token: [], api: [] };
  const fetchImpl = (async (url: string | URL, init: RequestInit) => {
    if (String(url).includes('oauth2.test.invalid')) {
      calls.token.push({ url: String(url), init });
      if (tokenDelay) await tokenDelay();
      return jsonResponse(tokenStatus, tokenPayload ?? { access_token: 'tok-1', expires_in: 3600 });
    }
    calls.api.push({ url: String(url), init });
    return jsonResponse(
      apiStatus,
      apiPayload ?? {
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1 },
      },
    );
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

const client = (sa: { saJson: string }, mock: ReturnType<typeof makeFetchMock>, extra: Record<string, unknown> = {}) =>
  new VertexGenAI({
    saKeyJson: sa.saJson,
    project: 'proj-x',
    location: 'global',
    fetchImpl: mock.fetchImpl,
    ...extra,
  });

describe('autenticação por service account (JWT RS256 → OAuth2)', () => {
  it('minta JWT com header/claims do fluxo oficial e troca por access token no token_uri', async () => {
    const sa = await makeTestSa('kid-claims');
    const mock = makeFetchMock();
    await client(sa, mock).models.countTokens({ model: 'm', contents: 'oi' });

    expect(mock.calls.token).toHaveLength(1);
    const req = mock.calls.token[0]!;
    expect(req.url).toBe('https://oauth2.test.invalid/token');
    expect(req.init.method).toBe('POST');
    const params = new URLSearchParams(req.init.body as string);
    expect(params.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');

    const assertion = params.get('assertion') ?? '';
    const [h = '', c = '', s = ''] = assertion.split('.');
    expect(b64urlToJson(h)).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'kid-claims' });
    const claims = b64urlToJson(c) as { iss: string; scope: string; aud: string; iat: number; exp: number };
    expect(claims.iss).toBe('kid-claims@proj-x.iam.gserviceaccount.com');
    expect(claims.scope).toBe('https://www.googleapis.com/auth/cloud-platform');
    expect(claims.aud).toBe('https://oauth2.test.invalid/token');
    expect(claims.exp - claims.iat).toBe(3600);

    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', sa.publicKey, b64urlToBuf(s), te.encode(`${h}.${c}`));
    expect(valid).toBe(true);
  });

  it('nunca envia api key: sem ?key= na URL e sem x-goog-api-key nos headers', async () => {
    const sa = await makeTestSa('kid-nokey');
    const mock = makeFetchMock();
    await client(sa, mock).models.generateContent({ model: 'm', contents: 'oi' });
    const { url, init } = mock.calls.api[0]!;
    expect(url).not.toMatch(/[?&]key=/u);
    const headers = init.headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('x-goog-api-key');
    expect(headers.Authorization).toBe('Bearer tok-1');
  });

  it('reusa o access token dentro da validade e reminta após a margem de expiração', async () => {
    const sa = await makeTestSa('kid-cache');
    const mock = makeFetchMock();
    let nowMs = 1_700_000_000_000;
    const ai = client(sa, mock, { now: () => nowMs });
    await ai.models.countTokens({ model: 'm', contents: '1' });
    await ai.models.generateContent({ model: 'm', contents: '2' });
    expect(mock.calls.token).toHaveLength(1);
    nowMs += (3600 - 240) * 1000;
    await ai.models.countTokens({ model: 'm', contents: '3' });
    expect(mock.calls.token).toHaveLength(2);
  });

  it('single-flight: chamadas concorrentes compartilham uma única mint', async () => {
    const sa = await makeTestSa('kid-flight');
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const mock = makeFetchMock({ tokenDelay: () => gate });
    const ai = client(sa, mock);
    const p1 = ai.models.countTokens({ model: 'm', contents: '1' });
    const p2 = ai.models.generateContent({ model: 'm', contents: '2' });
    release();
    await Promise.all([p1, p2]);
    expect(mock.calls.token).toHaveLength(1);
  });

  it('o cache é por identidade de chave (kid distinto minta separadamente)', async () => {
    const sa1 = await makeTestSa('kid-iso-1');
    const sa2 = await makeTestSa('kid-iso-2');
    const mock = makeFetchMock();
    await client(sa1, mock).models.countTokens({ model: 'm', contents: 'a' });
    await client(sa2, mock).models.countTokens({ model: 'm', contents: 'b' });
    expect(mock.calls.token).toHaveLength(2);
  });
});

describe('montagem das requisições REST do Vertex', () => {
  it('monta a URL global do generateContent e a regional quando location não é global', async () => {
    const sa = await makeTestSa('kid-url');
    const mock = makeFetchMock();
    await client(sa, mock).models.generateContent({ model: 'gemini-2.5-flash', contents: 'oi' });
    expect(mock.calls.api[0]!.url).toBe(
      'https://aiplatform.googleapis.com/v1/projects/proj-x/locations/global/publishers/google/models/gemini-2.5-flash:generateContent',
    );

    const mock2 = makeFetchMock();
    const regional = new VertexGenAI({
      saKeyJson: sa.saJson,
      project: 'proj-x',
      location: 'us-central1',
      fetchImpl: mock2.fetchImpl,
    });
    await regional.models.countTokens({ model: 'm', contents: 'oi' });
    expect(mock2.calls.api[0]!.url).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/proj-x/locations/us-central1/publishers/google/models/m:countTokens',
    );
  });

  it.each([
    ['us', 'https://aiplatform.us.rep.googleapis.com'],
    ['eu', 'https://aiplatform.eu.rep.googleapis.com'],
  ])('mapeia a multirregião %s para o hostname oficial', async (location, endpoint) => {
    const sa = await makeTestSa(`kid-${location}`);
    const mock = makeFetchMock();
    const ai = new VertexGenAI({ saKeyJson: sa.saJson, project: 'proj-x', location, fetchImpl: mock.fetchImpl });

    await ai.models.countTokens({ model: 'm', contents: 'oi' });

    expect(mock.calls.api[0]!.url).toBe(
      `${endpoint}/v1/projects/proj-x/locations/${location}/publishers/google/models/m:countTokens`,
    );
  });

  it.each(['europe-west10', 'asia-south2', 'northamerica-northeast1'])(
    'aceita qualquer região oficial do Vertex sem lista hard-coded que envelheça (%s)',
    async (location) => {
      const sa = await makeTestSa(`kid-region-${location}`);
      const mock = makeFetchMock();
      const ai = new VertexGenAI({ saKeyJson: sa.saJson, project: 'proj-x', location, fetchImpl: mock.fetchImpl });

      await ai.models.countTokens({ model: 'm', contents: 'oi' });

      expect(mock.calls.api[0]!.url).toBe(
        `https://${location}-aiplatform.googleapis.com/v1/projects/proj-x/locations/${location}/publishers/google/models/m:countTokens`,
      );
    },
  );

  it.each([
    'attacker.example/path?',
    'evil.com',
    'aiplatform.googleapis.com.evil',
    'Us-Central1',
    'us..central1',
    '-us-central1',
    '',
  ])(
    'rejeita VERTEX_LOCATION que não é rótulo DNS minúsculo único (%s) antes de obter ou transmitir o bearer token',
    async (location) => {
      const sa = await makeTestSa('kid-location-origin');
      const mock = makeFetchMock();

      expect(
        () =>
          new VertexGenAI({
            saKeyJson: sa.saJson,
            project: 'proj-x',
            location,
            fetchImpl: mock.fetchImpl,
          }),
      ).toThrow(/VERTEX_LOCATION/);
      expect(mock.calls.token).toHaveLength(0);
      expect(mock.calls.api).toHaveLength(0);
    },
  );

  it('mapeia config do formato do SDK para o corpo REST (generationConfig + top-level)', async () => {
    const sa = await makeTestSa('kid-map');
    const mock = makeFetchMock();
    const safetySettings = [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' }];
    await client(sa, mock).models.generateContent({
      model: 'm',
      contents: 'pergunta',
      config: {
        systemInstruction: 'seja literal',
        temperature: 0.3,
        maxOutputTokens: 8192,
        safetySettings,
        responseMimeType: 'application/json',
      },
    });
    const body = JSON.parse(mock.calls.api[0]!.init.body as string);
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'pergunta' }] }]);
    expect(body.systemInstruction).toEqual({ role: 'user', parts: [{ text: 'seja literal' }] });
    expect(body.generationConfig).toEqual({
      temperature: 0.3,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    });
    expect(body.safetySettings).toEqual(safetySettings);
    expect(body.config).toBeUndefined();
    expect(body.httpOptions).toBeUndefined();
  });

  it('normaliza array misto de parts (inlineData + string) em um único content de usuário', async () => {
    const sa = await makeTestSa('kid-multimodal');
    const mock = makeFetchMock();
    await client(sa, mock).models.generateContent({
      model: 'm',
      contents: [{ inlineData: { data: 'QUJD', mimeType: 'application/pdf' } }, 'Extraia os dados deste arquivo.'],
      config: { maxOutputTokens: 300 },
    });
    const body = JSON.parse(mock.calls.api[0]!.init.body as string);
    expect(body.contents).toEqual([
      {
        role: 'user',
        parts: [
          { inlineData: { data: 'QUJD', mimeType: 'application/pdf' } },
          { text: 'Extraia os dados deste arquivo.' },
        ],
      },
    ]);
  });

  it('normaliza o mesmo array misto no countTokens', async () => {
    const sa = await makeTestSa('kid-multimodal-count');
    const mock = makeFetchMock({ apiPayload: { totalTokens: 570 } });
    const res = await client(sa, mock).models.countTokens({
      model: 'm',
      contents: [{ inlineData: { data: 'QUJD', mimeType: 'image/png' } }, 'Descreva.'],
    });
    const body = JSON.parse(mock.calls.api[0]!.init.body as string);
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ inlineData: { data: 'QUJD', mimeType: 'image/png' } }, { text: 'Descreva.' }] },
    ]);
    expect(res.totalTokens).toBe(570);
  });

  it('deriva o project do project_id da SA quando options.project não é fornecido', async () => {
    const sa = await makeTestSa('kid-derive');
    const mock = makeFetchMock();
    const ai = new VertexGenAI({ saKeyJson: sa.saJson, location: 'global', fetchImpl: mock.fetchImpl });
    await ai.models.countTokens({ model: 'm', contents: 'oi' });
    expect(mock.calls.api[0]!.url).toBe(
      'https://aiplatform.googleapis.com/v1/projects/proj-x/locations/global/publishers/google/models/m:countTokens',
    );
  });

  it('options.project explícito tem precedência sobre o project_id da SA', async () => {
    const sa = await makeTestSa('kid-precedence');
    const mock = makeFetchMock();
    const ai = new VertexGenAI({
      saKeyJson: sa.saJson,
      project: 'projeto-explicito',
      location: 'global',
      fetchImpl: mock.fetchImpl,
    });
    await ai.models.countTokens({ model: 'm', contents: 'oi' });
    expect(mock.calls.api[0]!.url).toContain('/projects/projeto-explicito/');
  });

  it('falha com erro diagnóstico quando nem options.project nem project_id existem', async () => {
    const sa = await makeTestSa('kid-noproj');
    const semProjeto = JSON.stringify({ ...JSON.parse(sa.saJson), project_id: undefined });
    const mock = makeFetchMock();
    const ai = new VertexGenAI({ saKeyJson: semProjeto, location: 'global', fetchImpl: mock.fetchImpl });
    await expect(ai.models.countTokens({ model: 'm', contents: 'oi' })).rejects.toThrow(/VERTEX_PROJECT|project_id/u);
  });

  it('passa adiante contents que já são Content[] com role e parts', async () => {
    const sa = await makeTestSa('kid-passthrough');
    const mock = makeFetchMock();
    const contents = [{ role: 'user', parts: [{ text: 'já normalizado' }] }];
    await client(sa, mock).models.generateContent({ model: 'm', contents });
    const body = JSON.parse(mock.calls.api[0]!.init.body as string);
    expect(body.contents).toEqual(contents);
  });

  it('httpOptions.timeout instala um AbortSignal na chamada da API sem afetar a mint de token', async () => {
    const sa = await makeTestSa('kid-timeout');
    const mock = makeFetchMock();
    await client(sa, mock).models.generateContent({
      model: 'm',
      contents: 'x',
      config: { httpOptions: { timeout: 20_000 } },
    });
    expect(mock.calls.token[0]!.init.signal).toBeInstanceOf(AbortSignal); // teto próprio da mint (20s)
    expect(mock.calls.api[0]!.init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(mock.calls.api[0]!.init.body as string);
    expect(body.generationConfig).toBeUndefined();
  });

  it('omite campos ausentes sem enviar chaves vazias', async () => {
    const sa = await makeTestSa('kid-min');
    const mock = makeFetchMock();
    await client(sa, mock).models.generateContent({ model: 'm', contents: 'x' });
    const body = JSON.parse(mock.calls.api[0]!.init.body as string);
    expect(body.generationConfig).toBeUndefined();
    expect(body.systemInstruction).toBeUndefined();
    expect(body.safetySettings).toBeUndefined();
    expect(mock.calls.api[0]!.init.signal ?? undefined).toBeUndefined();
    expect(mock.calls.token[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('normalização das respostas', () => {
  it('expõe .text sem thought parts, candidates com finishReason e usageMetadata com thoughtsTokenCount', async () => {
    const sa = await makeTestSa('kid-resp');
    const apiPayload = {
      candidates: [
        {
          content: { parts: [{ thought: true, text: 'raciocínio' }, { text: 'olá ' }, { text: 'mundo' }] },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, thoughtsTokenCount: 7 },
    };
    const mock = makeFetchMock({ apiPayload });
    const res = await client(sa, mock).models.generateContent({ model: 'm', contents: 'oi' });
    expect(res.text).toBe('olá mundo');
    expect(res.candidates?.[0]?.finishReason).toBe('STOP');
    expect(res.usageMetadata?.thoughtsTokenCount).toBe(7);
  });

  it('.text é vazio quando não há candidates', async () => {
    const sa = await makeTestSa('kid-vazio');
    const mock = makeFetchMock({ apiPayload: { candidates: [] } });
    const res = await client(sa, mock).models.generateContent({ model: 'm', contents: 'oi' });
    expect(res.text).toBe('');
  });

  it('countTokens monta a URL própria e repassa totalTokens', async () => {
    const sa = await makeTestSa('kid-count');
    const mock = makeFetchMock({ apiPayload: { totalTokens: 42 } });
    const res = await client(sa, mock).models.countTokens({ model: 'm', contents: 'conte' });
    expect(mock.calls.api[0]!.url).toMatch(/:countTokens$/u);
    expect(res.totalTokens).toBe(42);
  });
});

describe('regressão workerd e erros diagnósticos', () => {
  it('invoca o fetch global desacoplado do this da instância (regressão: Illegal invocation no workerd)', async () => {
    const sa = await makeTestSa('kid-global-fetch');
    const urls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = function (this: unknown, url: string | URL) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError('Illegal invocation: function called with incorrect `this` reference.');
      }
      urls.push(String(url));
      if (String(url).includes('oauth2.test.invalid')) {
        return Promise.resolve(jsonResponse(200, { access_token: 'tok-g', expires_in: 3600 }));
      }
      return Promise.resolve(jsonResponse(200, { totalTokens: 1 }));
    } as unknown as typeof fetch;
    try {
      const ai = new VertexGenAI({ saKeyJson: sa.saJson, project: 'proj-x', location: 'global' });
      const res = await ai.models.countTokens({ model: 'm', contents: 'x' });
      expect(res.totalTokens).toBe(1);
      expect(urls).toHaveLength(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('erro HTTP do Vertex vira VertexHttpError com propriedade status numérica (classificador de retry)', async () => {
    const sa = await makeTestSa('kid-status');
    const mock = makeFetchMock({ apiStatus: 429, apiPayload: { error: { code: 429, message: 'Resource exhausted' } } });
    const failure = await client(sa, mock)
      .models.generateContent({ model: 'm', contents: 'x' })
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(failure).toBeInstanceOf(VertexHttpError);
    expect((failure as VertexHttpError).status).toBe(429);
    expect(String((failure as Error).message)).toMatch(/429.*Resource exhausted/su);
  });

  it('VertexHttpError carrega a operação de origem — generateContent, countTokens e oauth-token são distinguíveis', async () => {
    const saGen = await makeTestSa('kid-op-gen');
    const gen404 = makeFetchMock({
      apiStatus: 404,
      apiPayload: { error: { code: 404, message: 'Publisher Model not found' } },
    });
    const genFailure = await client(saGen, gen404)
      .models.generateContent({ model: 'm', contents: 'x' })
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect((genFailure as VertexHttpError).operation).toBe('generateContent');

    const saCount = await makeTestSa('kid-op-count');
    const count404 = makeFetchMock({
      apiStatus: 404,
      apiPayload: { error: { code: 404, message: 'Publisher Model not found' } },
    });
    const countFailure = await client(saCount, count404)
      .models.countTokens({ model: 'm', contents: 'x' })
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect((countFailure as VertexHttpError).operation).toBe('countTokens');
  });

  it('erro do token endpoint também carrega status e detalhe do OAuth', async () => {
    const sa = await makeTestSa('kid-err-token');
    const mock = makeFetchMock({
      tokenStatus: 400,
      tokenPayload: { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' },
    });
    const failure = await client(sa, mock)
      .models.countTokens({ model: 'm', contents: 'x' })
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(failure).toBeInstanceOf(VertexHttpError);
    expect((failure as VertexHttpError).status).toBe(400);
    expect((failure as VertexHttpError).operation).toBe('oauth-token');
    expect(String((failure as Error).message)).toMatch(/invalid_grant.*Invalid JWT Signature/su);
  });

  it('credencial JSON malformada ou sem campo obrigatório falha com erro diagnóstico', async () => {
    const mock = makeFetchMock();
    const broken = new VertexGenAI({
      saKeyJson: 'não-é-json',
      project: 'p',
      location: 'global',
      fetchImpl: mock.fetchImpl,
    });
    await expect(broken.models.countTokens({ model: 'm', contents: 'x' })).rejects.toThrow(/VERTEX_SA_KEY.*JSON/su);

    const sa = await makeTestSa('kid-campo');
    const missing = JSON.stringify({ ...JSON.parse(sa.saJson), private_key: undefined });
    const partial = new VertexGenAI({
      saKeyJson: missing,
      project: 'p',
      location: 'global',
      fetchImpl: mock.fetchImpl,
    });
    await expect(partial.models.countTokens({ model: 'm', contents: 'x' })).rejects.toThrow(/private_key/u);
  });
});

describe('sanitizeAiErrorDetail', () => {
  it('reduz VertexHttpError a operacao + status numerico, sem a mensagem do provedor', () => {
    const err = new VertexHttpError(
      'Vertex generateContent falhou (HTTP 403): {"error":{"message":"Permission denied on projects/proj-x by sa@exemplo-projeto-000.iam.gserviceaccount.com"}}',
      403,
      'generateContent',
    );
    const detail = sanitizeAiErrorDetail(err);
    expect(detail).toBe('vertex_generateContent_http_403');
    expect(detail).not.toMatch(/proj-x|gserviceaccount|Permission/u);
  });

  it('classifica erro de configuracao da SA key por prefixo, sem ecoar o campo', () => {
    expect(
      sanitizeAiErrorDetail(new Error('VERTEX_SA_KEY inválido: campo obrigatório ausente ou vazio: private_key')),
    ).toBe('sa_key_config_invalida');
  });

  it('classifica resposta vazia do modelo', () => {
    expect(sanitizeAiErrorDetail(new Error('Gemini retornou resposta vazia.'))).toBe('resposta_vazia');
    expect(
      sanitizeAiErrorDetail(new Error('Gemini retornou resposta vazia ou bloqueada pelos filtros de segurança.')),
    ).toBe('resposta_vazia');
  });

  it('classifica timeout/abort pelo name do erro', () => {
    const abort = new Error('The operation was aborted for https://endpoint-interno.exemplo.com');
    abort.name = 'AbortError';
    expect(sanitizeAiErrorDetail(abort)).toBe('timeout');
    expect(sanitizeAiErrorDetail(abort)).not.toMatch(/endpoint-interno/u);
  });

  it('nunca ecoa a mensagem de um erro desconhecido - so o name da classe', () => {
    const err = new TypeError('fetch failed: https://url-interna.exemplo.com com token xoxb-token-de-teste');
    expect(sanitizeAiErrorDetail(err)).toBe('erro_nao_classificado_TypeError');
  });

  it('um Error.name envenenado (gravavel) nao atravessa - vira o rotulo fixo', () => {
    const err = new Error('qualquer');
    err.name = 'sa@exemplo-projeto-000.iam.gserviceaccount.com: 403';
    expect(sanitizeAiErrorDetail(err)).toBe('erro_nao_classificado_desconhecido');
    expect(sanitizeAiErrorDetail(err)).not.toMatch(/@|gserviceaccount|403/u);
  });

  it('um name identificador porem fora do vocabulario nativo tambem vira o rotulo fixo', () => {
    // Threads do PR #236: a regex de identificador aceitava QUALQUER token
    // alfanumerico, entao um name forjado passava ao log/D1 com cardinalidade
    // arbitraria. Apenas os names de erro nativos atravessam.
    const err = new Error('qualquer');
    err.name = 'PayloadForjadoQualquer';
    expect(sanitizeAiErrorDetail(err)).toBe('erro_nao_classificado_desconhecido');
    const range = new Error('qualquer');
    range.name = 'RangeError';
    expect(sanitizeAiErrorDetail(range)).toBe('erro_nao_classificado_RangeError');
  });

  it('trata lancamentos que nem sao Error', () => {
    expect(sanitizeAiErrorDetail('string qualquer com segredo-de-teste')).toBe('erro_nao_error');
    expect(sanitizeAiErrorDetail(undefined)).toBe('erro_nao_error');
  });
});
