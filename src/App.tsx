/*
 * Copyright © 2026 LCV Ideas & Software
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Módulo: oraculo-financeiro/src/App.tsx
// Versão: v01.11.01
// Descrição: Frontend do Oráculo Financeiro — análise LCI/LCA e Tesouro IPCA+ com IA Gemini via Vertex AI.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ComplianceBanner } from './components/ComplianceBanner';
import { useNotification } from './components/Notification';
import { LicencasModule } from './modules/compliance/LicencasModule';
import './App.css';
import { fetchJson } from './lib/api';
import {
  type AnaliseTesouroLote,
  aliquotaIof,
  aliquotaIrRegressiva,
  analisarLote,
  diasParaMenorIr as calcDiasParaMenorIr,
  cdbEquivalenteALciLca,
  classificarLciLca,
  dataMediaPonderada,
  ganhoRealAnualizado,
  gerarSinalTesouro,
  mediasPonderadasPorCapital,
  rendimentoLiquidoCdb,
  rendimentoLiquidoLciLca,
  taxaEfetivaAnualDoPeriodo,
} from './lib/finance';

const APP_VERSION = 'APP v01.11.01';

type TabId = 'lci-lca' | 'tesouro-ipca';

type RegistroBase = {
  id: string;
  criadoEm: string;
};

type RegistroLciLca = RegistroBase & {
  prazoDias: number;
  taxaLciLca: number;
  aporte: number;
  aliquotaIr: number;
  cdbEquivalente: number;
};

type RegistroTesouroIpca = RegistroBase & {
  dataCompra: string;
  valorInvestido: number;
  taxaContratada: number;
  vencimento: string; // ex: "15/08/2032"
  taxaAtual: number;
  diasParaMenorIr: number;
  sinal: 'vender' | 'manter';
  analise: string;
};

type TituloTD = {
  tipo: string;
  vencimento: string;
  dataBase: string;
  taxaCompra: number;
  taxaVenda: number;
  pu: number;
};
type LoteTesouroForm = {
  dataCompra: string;
  valorInvestido: number;
  taxaContratada: number;
  vencimento: string;
};

type AvaliacaoIA = 'bom' | 'regular' | 'ruim';
type RecomendacaoIA = 'MANTER' | 'VENDER' | 'AGUARDAR' | 'EVITAR';

type AnaliseIA = {
  avaliacao: AvaliacaoIA;
  titulo: string;
  analise: string;
  numerosChave: {
    retornoLiquidoEstimado: string;
    ganhoRealAcimaIpca: string;
    comparacaoTesouroSelic: string;
  };
  recomendacao: RecomendacaoIA;
  timing: string;
  ciladas: string[];
  resumo: string;
};

async function parseApiError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

// ── Formatação Brasileira (máscaras de input) ─────────────────────────────────

/** Formata número como moeda brasileira: 15491.04 → "15.491,04" */
function formatBRL(value: number, decimals = 2): string {
  if (Number.isNaN(value) || value === 0) return '';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Parseia string brasileira de volta para número: "15.491,04" → 15491.04 */
function parseBRL(input: string): number {
  if (input.trim() === '') return 0;
  // Permite digitação livre: aceita apenas dígitos, vírgula e ponto
  const clean = input.replace(/[^\d.,]/g, '');
  // Converte formato BR para JS: remove pontos de milhar, troca vírgula por ponto
  const normalized = clean.replace(/\./g, '').replace(',', '.');
  const val = parseFloat(normalized);
  return Number.isNaN(val) ? 0 : val;
}

function TaxaInput({
  value,
  onChange,
  ...props
}: {
  value: number;
  onChange: (v: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [rawText, setRawText] = useState(() =>
    value === 0 || Number.isNaN(value)
      ? ''
      : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  );
  const [prevExternalValue, setPrevExternalValue] = useState(value);

  // Render-time sync: detecta mudança externa (IA, fetch) sem useEffect
  if (Math.abs(prevExternalValue - value) > 0.001) {
    setPrevExternalValue(value);
    setRawText(
      value === 0 || Number.isNaN(value)
        ? ''
        : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    );
  }

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={rawText}
      onChange={(e) => {
        const raw = e.target.value;
        setRawText(raw);
        const num = parseBRL(raw);
        onChange(num);
      }}
    />
  );
}

const htmlToPlainText = (html: string): string => {
  if (typeof DOMParser === 'undefined') {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\u00a0/g, ' ');
};

function App() {
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState<TabId>('tesouro-ipca');
  const [loading, setLoading] = useState(false);
  const [showLicenses, setShowLicenses] = useState(false);

  const [prazoDias, setPrazoDias] = useState(365);
  const [taxaLciLca, setTaxaLciLca] = useState(90);
  const [aporte, setAporte] = useState(10000);
  const [taxaAtualTesouro, setTaxaAtualTesouro] = useState(7);
  const [durationAnos, setDurationAnos] = useState(5);
  const [cdiAtual, setCdiAtual] = useState(10.65);
  const [ipcaProjetado, setIpcaProjetado] = useState(4.83);

  const [novoLoteDataCompra, setNovoLoteDataCompra] = useState(new Date().toISOString().slice(0, 10));
  const [novoLoteValor, setNovoLoteValor] = useState(1000);
  const [novoLoteTaxa, setNovoLoteTaxa] = useState(6);
  const [novoLoteVencimento, setNovoLoteVencimento] = useState('');

  const [lciRegistros, setLciRegistros] = useState<RegistroLciLca[]>([]);
  const [tesouroRegistros, setTesouroRegistros] = useState<RegistroTesouroIpca[]>([]);

  const [analisandoIa, setAnalisandoIa] = useState(false);
  const [analiseIa, setAnaliseIa] = useState<AnaliseIA | null>(null);

  // Imagem/PDF Drag/Drop
  const [isDragging, setIsDragging] = useState(false);
  const [processandoImg, setProcessandoImg] = useState(false);

  // Contato + E-mail modals
  const [showContato, setShowContato] = useState(false);
  const [contatoForm, setContatoForm] = useState({ name: '', phone: '', email: '', message: '' });
  const [contatoSending, setContatoSending] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailDestinoInput, setEmailDestinoInput] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  // Floating scroll buttons
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const st = window.scrollY;
      const docH = document.documentElement.scrollHeight;
      const winH = window.innerHeight;
      setShowScrollTop(st > 200);
      setShowScrollBottom(docH - st - winH > 200);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Auth (email + OTP) ──────────────────────────────────────────────────
  type AuthMode = 'save' | 'retrieve' | 'delete' | null;
  type AuthStep = 'email' | 'token';
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [authStep, setAuthStep] = useState<AuthStep>('email');
  const [authEmail, setAuthEmail] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // ── Sessão persistente (sessionStorage, 60 min, validada server-side) ────
  const SESSION_KEY = 'oraculo_session';
  const SESSION_TTL_MS = 60 * 60 * 1000; // 60 minutos

  type SessionData = { email: string; sessionToken: string; expiresAt: number };

  /** Cria sessão com token do backend */
  const createSession = (email: string, sessionToken: string) => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        email,
        sessionToken,
        expiresAt: Date.now() + SESSION_TTL_MS,
      }),
    );
  };

  /** Retorna sessão ativa (email + token), ou null se expirada/inexistente */
  const getActiveSession = (): SessionData | null => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as SessionData;
      if (Date.now() > session.expiresAt || !session.sessionToken) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
  };

  /** Destrói a sessão */
  const clearSession = () => sessionStorage.removeItem(SESSION_KEY);

  // Tesouro Transparente — taxas IPCA+ por vencimento
  const [titulosIpca, setTitulosIpca] = useState<TituloTD[]>([]);
  const [taxaRef, setTaxaRef] = useState<string | null>(null);
  const [taxaLoading, setTaxaLoading] = useState(false);

  // Auto-fetch taxa do Tesouro Transparente ao montar
  useEffect(() => {
    const fetchTaxa = async () => {
      setTaxaLoading(true);
      try {
        const res = await fetch('/api/taxa-ipca-atual');
        if (!res.ok) return;
        const payload = (await res.json()) as {
          ok: boolean;
          taxaMediaIndicativa?: number;
          dataReferencia?: string;
          fonte?: string;
          titulos?: TituloTD[];
        };
        if (payload.ok && payload.taxaMediaIndicativa) {
          setTaxaAtualTesouro(payload.taxaMediaIndicativa);
          setTaxaRef(payload.dataReferencia ?? null);
          if (payload.titulos?.length) {
            // Ordenar por vencimento cronológico (mais próximo → mais distante)
            const toKey = (d: string) => {
              const [dd, mm, yy] = d.slice(0, 10).split('/');
              return `${yy}${mm}${dd}`;
            };
            const mapped = payload.titulos.map((t) => ({
              ...t,
              vencimento: t.tipo.includes('Semestrais') ? `${t.vencimento} (Semestral)` : t.vencimento,
            }));
            const sorted = mapped.sort((a, b) => toKey(a.vencimento).localeCompare(toKey(b.vencimento)));
            setTitulosIpca(sorted);
            const primeiroTitulo = sorted[0];
            if (primeiroTitulo) {
              setNovoLoteVencimento(primeiroTitulo.vencimento);
            }
          }
          showNotification(
            `Taxas atualizadas — ${payload.titulos?.length ?? 0} vencimentos IPCA+ carregados (${payload.fonte === 'cache' ? 'cache' : 'Tesouro Transparente'} — ref: ${payload.dataReferencia ?? 'hoje'})`,
            'success',
          );
        }
      } catch {
        // Falha silenciosa — mantém o valor default manual
      } finally {
        setTaxaLoading(false);
      }
    };
    void fetchTaxa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── LCI/LCA ─────────────────────────────────────────────────────────────
  const aliquotaIr = useMemo(() => aliquotaIrRegressiva(prazoDias), [prazoDias]);
  const iofPct = useMemo(() => aliquotaIof(prazoDias), [prazoDias]);
  const cdbEquivalente = useMemo(() => cdbEquivalenteALciLca(taxaLciLca, aliquotaIr), [taxaLciLca, aliquotaIr]);
  const rendLciLiquido = useMemo(
    () => rendimentoLiquidoLciLca(aporte, cdiAtual, taxaLciLca, prazoDias),
    [aporte, cdiAtual, taxaLciLca, prazoDias],
  );
  const rendCdbLiquido = useMemo(
    () => rendimentoLiquidoCdb(aporte, cdiAtual, cdbEquivalente, prazoDias),
    [aporte, cdiAtual, cdbEquivalente, prazoDias],
  );
  const rendLciPctAa = useMemo(
    () => (aporte > 0 ? taxaEfetivaAnualDoPeriodo((rendLciLiquido / aporte) * 100, prazoDias) : 0),
    [rendLciLiquido, aporte, prazoDias],
  );
  const ganhoRealLci = useMemo(() => ganhoRealAnualizado(rendLciPctAa, ipcaProjetado), [rendLciPctAa, ipcaProjetado]);
  const benchmarkLci = useMemo(() => classificarLciLca(taxaLciLca), [taxaLciLca]);

  // ── Tesouro IPCA+ ─────────────────────────────────────────────────────────
  const lotesTesouroForm = useMemo<LoteTesouroForm[]>(
    () =>
      tesouroRegistros.map((r) => ({
        dataCompra: r.dataCompra,
        valorInvestido: r.valorInvestido,
        taxaContratada: r.taxaContratada,
        vencimento: r.vencimento ?? '',
      })),
    [tesouroRegistros],
  );

  const totalInvestidoTesouro = useMemo(
    () => lotesTesouroForm.reduce((sum, l) => sum + l.valorInvestido, 0),
    [lotesTesouroForm],
  );

  const taxaMediaTesouro = useMemo(
    () => mediasPonderadasPorCapital(lotesTesouroForm, (l) => l.taxaContratada),
    [lotesTesouroForm],
  );

  const dataMediaTesouro = useMemo(() => dataMediaPonderada(lotesTesouroForm), [lotesTesouroForm]);

  // Per-lote: taxa atual específica do vencimento (fallback: média)
  const taxaParaLote = useCallback(
    (vencimento: string) => {
      if (!titulosIpca.length || !vencimento) return taxaAtualTesouro;
      const match = titulosIpca.find((t) => t.vencimento === vencimento);
      return match ? match.taxaCompra : taxaAtualTesouro;
    },
    [titulosIpca, taxaAtualTesouro],
  );

  // Per-lote: Duration Modificada + Convexidade (Fabozzi/CFA Institute)
  const analisesLotes = useMemo<AnaliseTesouroLote[]>(
    () =>
      tesouroRegistros.map((r) =>
        analisarLote(r.dataCompra, r.valorInvestido, r.taxaContratada, taxaParaLote(r.vencimento), durationAnos),
      ),
    [tesouroRegistros, taxaParaLote, durationAnos],
  );

  const mtmTotalTesouro = useMemo(() => analisesLotes.reduce((s, a) => s + a.mtmR$, 0), [analisesLotes]);

  const economiaIrTotal = useMemo(() => analisesLotes.reduce((s, a) => s + a.economiaIrAguardando, 0), [analisesLotes]);

  const aliquotaIrMediaTesouro = useMemo(
    () =>
      mediasPonderadasPorCapital(
        tesouroRegistros.map((r, i) => ({
          valorInvestido: r.valorInvestido,
          ir: analisesLotes[i]?.aliquotaIrAtual ?? 0,
        })),
        (l) => l.ir,
      ),
    [tesouroRegistros, analisesLotes],
  );

  const diasMediosParaMenorIr = useMemo(
    () =>
      Math.round(
        mediasPonderadasPorCapital(
          tesouroRegistros.map((r, i) => ({
            valorInvestido: r.valorInvestido,
            dias: analisesLotes[i]?.diasParaMenorIr ?? 0,
          })),
          (l) => l.dias,
        ),
      ),
    [tesouroRegistros, analisesLotes],
  );

  const durationModMediaTesouro = useMemo(
    () =>
      mediasPonderadasPorCapital(
        analisesLotes.map((a, i) => ({
          valorInvestido: tesouroRegistros[i]?.valorInvestido ?? 0,
          md: a.md,
        })),
        (l) => l.md,
      ),
    [analisesLotes, tesouroRegistros],
  );

  const decisaoTesouro = useMemo(
    () =>
      gerarSinalTesouro(
        taxaMediaTesouro,
        taxaAtualTesouro,
        diasMediosParaMenorIr,
        aliquotaIrMediaTesouro,
        mtmTotalTesouro,
        economiaIrTotal,
      ),
    [
      taxaMediaTesouro,
      taxaAtualTesouro,
      diasMediosParaMenorIr,
      aliquotaIrMediaTesouro,
      mtmTotalTesouro,
      economiaIrTotal,
    ],
  );

  // ── Auto-retrieve se sessão válida (server-side session token) ───────────
  // Sessão validada pelo backend via session-retrieve (token rotável).
  // Nenhum dado é exibido sem autenticação server-side.
  useEffect(() => {
    const session = getActiveSession();
    if (!session) return;

    const autoRetrieve = async () => {
      const envelope = await fetchJson<{
        ok: boolean;
        dados?: ReturnType<typeof collectAnaliseData>;
        sessionToken?: string;
        error?: string;
      }>('/api/oraculo-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'session-retrieve',
          email: session.email,
          token: session.sessionToken,
        }),
      });

      if (!envelope.data) {
        // Resposta não-JSON ou falha de rede — não limpa sessão local.
        return;
      }

      const result = envelope.data;
      if (result.ok && result.dados) {
        if (result.dados.tesouroRegistros) setTesouroRegistros(result.dados.tesouroRegistros);
        if (result.dados.lciRegistros) setLciRegistros(result.dados.lciRegistros);
        if (result.dados.taxaAtualTesouro) setTaxaAtualTesouro(result.dados.taxaAtualTesouro);
        if (result.dados.durationAnos) setDurationAnos(result.dados.durationAnos);
        if (result.dados.cdiAtual) setCdiAtual(result.dados.cdiAtual);
        if (result.dados.ipcaProjetado) setIpcaProjetado(result.dados.ipcaProjetado);
        if (result.dados.prazoDias) setPrazoDias(result.dados.prazoDias);
        if (result.dados.taxaLciLca) setTaxaLciLca(result.dados.taxaLciLca);
        if (result.dados.aporte) setAporte(result.dados.aporte);
        if (result.sessionToken) createSession(session.email, result.sessionToken);
        showNotification(`Sessão restaurada — Dados de ${session.email} carregados automaticamente.`, 'success');
      } else {
        clearSession();
      }
    };
    void autoRetrieve();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear AI analysis state when user switches tab; flagged for follow-up refactor (derive from activeTab + key reset).
    setAnaliseIa(null);
  }, [activeTab]);

  const handleSalvarLciLca = async () => {
    const novoRegistro: RegistroLciLca = {
      id: crypto.randomUUID(),
      criadoEm: new Date().toISOString(),
      prazoDias,
      taxaLciLca,
      aporte,
      aliquotaIr,
      cdbEquivalente,
    };

    if (prazoDias <= 0 || taxaLciLca <= 0 || aporte <= 0) {
      showNotification('Parâmetros inválidos — Informe prazo, taxa e aporte com valores positivos.', 'warning');
      return;
    }

    setLoading(true);

    try {
      setLciRegistros((previous) => [novoRegistro, ...previous].slice(0, 200));
      showNotification('Registro adicionado — Dados incluídos na análise local atual.', 'success');
    } finally {
      setLoading(false);
    }
  };

  // ── Auth handlers ────────────────────────────────────────────────────────

  const collectAnaliseData = () => ({
    tesouroRegistros,
    lciRegistros,
    taxaAtualTesouro,
    durationAnos,
    cdiAtual,
    ipcaProjetado,
    prazoDias,
    taxaLciLca,
    aporte,
  });

  const handleAuthEmailSubmit = async () => {
    if (!authEmail?.includes('@')) {
      showNotification('E-mail inválido — Insira um endereço de e-mail válido.', 'warning');
      return;
    }
    setAuthLoading(true);
    try {
      const action = authMode === 'save' ? 'save' : authMode === 'delete' ? 'request-delete-token' : 'request-token';
      const body: Record<string, unknown> = { action, email: authEmail };
      if (authMode === 'save') body.dados = collectAnaliseData();

      const envelope = await fetchJson<{ ok: boolean; message?: string; error?: string }>('/api/oraculo-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!envelope.data) {
        showNotification(envelope.error ?? 'Erro de rede — Não foi possível conectar ao servidor.', 'error');
        return;
      }

      const result = envelope.data;
      if (result.ok) {
        setAuthStep('token');
        showNotification(`Código enviado — ${result.message ?? 'Verifique seu e-mail.'}`, 'info');
      } else {
        showNotification(result.error ?? 'Falha ao enviar código.', 'error');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthTokenSubmit = async () => {
    if (authToken.length !== 6) return;
    setAuthLoading(true);
    try {
      const action = authMode === 'save' ? 'verify-save' : authMode === 'delete' ? 'verify-delete' : 'retrieve';
      const envelope = await fetchJson<{
        ok: boolean;
        message?: string;
        error?: string;
        dados?: ReturnType<typeof collectAnaliseData>;
        sessionToken?: string;
      }>('/api/oraculo-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, email: authEmail, token: authToken }),
      });

      if (!envelope.data) {
        showNotification(envelope.error ?? 'Erro de rede — Não foi possível conectar ao servidor.', 'error');
        return;
      }

      const result = envelope.data;
      if (result.ok) {
        if (authMode === 'delete') {
          // Limpar todos os dados locais e sessão após exclusão
          setTesouroRegistros([]);
          setLciRegistros([]);
          clearSession();
          showNotification(
            result.message ?? 'Dados excluídos — Todos os seus dados foram removidos permanentemente.',
            'success',
          );
        } else if (authMode === 'save') {
          if (result.sessionToken) createSession(authEmail, result.sessionToken);
          showNotification(
            `✅ Salvo com sucesso! Dados vinculados a ${authEmail}. Sessão ativa por 60 min.`,
            'success',
          );
        } else if (result.dados) {
          // Restaurar dados
          if (result.dados.tesouroRegistros) setTesouroRegistros(result.dados.tesouroRegistros);
          if (result.dados.lciRegistros) setLciRegistros(result.dados.lciRegistros);
          if (result.dados.taxaAtualTesouro) setTaxaAtualTesouro(result.dados.taxaAtualTesouro);
          if (result.dados.durationAnos) setDurationAnos(result.dados.durationAnos);
          if (result.dados.cdiAtual) setCdiAtual(result.dados.cdiAtual);
          if (result.dados.ipcaProjetado) setIpcaProjetado(result.dados.ipcaProjetado);
          if (result.dados.prazoDias) setPrazoDias(result.dados.prazoDias);
          if (result.dados.taxaLciLca) setTaxaLciLca(result.dados.taxaLciLca);
          if (result.dados.aporte) setAporte(result.dados.aporte);
          if (result.sessionToken) createSession(authEmail, result.sessionToken);
          showNotification(`✅ Dados restaurados! Sessão ativa para ${authEmail} por 60 min.`, 'success');
        }
        // Fechar modal
        setAuthMode(null);
        setAuthStep('email');
        setAuthEmail('');
        setAuthToken('');
      } else {
        showNotification(result.error ?? 'Código inválido.', 'error');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // ── Contato handler ──────────────────────────────────────────────────

  const formatPhone = (val: string) => {
    const v = val.replace(/\D/g, '').substring(0, 11);
    if (v.length === 0) return '';
    if (v.length <= 2) return `(${v}`;
    if (v.length <= 3) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
    if (v.length <= 7) return `(${v.slice(0, 2)}) ${v.slice(2, 3)} ${v.slice(3)}`;
    return `(${v.slice(0, 2)}) ${v.slice(2, 3)} ${v.slice(3, 7)}-${v.slice(7)}`;
  };

  const handleContatoSubmit = async () => {
    if (!contatoForm.name || !contatoForm.email || !contatoForm.message) {
      showNotification('Campos obrigatórios — Preencha nome, e-mail e mensagem.', 'warning');
      return;
    }
    setContatoSending(true);
    try {
      const res = await fetch('/api/contato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contatoForm),
      });
      const data = (await res.json()) as { ok: boolean; message?: string; error?: string };
      if (data.ok) {
        showNotification(data.message ?? 'Mensagem enviada com sucesso.', 'success');
        setShowContato(false);
        setContatoForm({ name: '', phone: '', email: '', message: '' });
      } else {
        showNotification(data.error ?? 'Falha ao enviar.', 'error');
      }
    } catch {
      showNotification('Erro de rede — Não foi possível conectar ao servidor.', 'error');
    } finally {
      setContatoSending(false);
    }
  };

  // ── E-mail report ───────────────────────────────────────────────────

  const gerarTextoRelatorio = (): string => {
    const div = `\n${'─'.repeat(28)}\n`;
    let t = `📈 ANÁLISE FINANCEIRA — ORÁCULO FINANCEIRO\n\n`;
    t += `Parâmetros: CDI ${cdiAtual}% | IPCA ${ipcaProjetado}% | Duração ${durationAnos}a\n`;

    if (tesouroRegistros.length > 0) {
      t += `${div}TESOURO IPCA+ (${tesouroRegistros.length} lotes)\n\n`;
      tesouroRegistros.forEach((r, i) => {
        t += `${i + 1}. ${r.dataCompra} — R$ ${r.valorInvestido.toLocaleString('pt-BR')} — ${r.taxaContratada}% a.a. — ${r.sinal.toUpperCase()}\n`;
        t += `   ${r.analise}\n\n`;
      });
    }

    if (lciRegistros.length > 0) {
      t += `${div}LCI/LCA (${lciRegistros.length} registros)\n\n`;
      lciRegistros.forEach((r, i) => {
        t += `${i + 1}. R$ ${r.aporte.toLocaleString('pt-BR')} — ${r.prazoDias}d — ${r.taxaLciLca}% CDI ≈ CDB ${r.cdbEquivalente.toFixed(2)}%\n`;
      });
    }

    if (analiseIa) {
      const iaTxt = htmlToPlainText(analiseIa.analise);
      t += `${div}ANÁLISE INTELIGENTE (IA)\n\n${iaTxt.trim()}\n`;
    }

    t += `${div}Gerado via Oráculo Financeiro ${APP_VERSION}`;
    return t;
  };

  const gerarHtmlRelatorio = (): string => {
    const font = "font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;";
    const sh = 'box-shadow: 0 1px 3px rgba(0,0,0,0.08);';
    const card = `background: #fff; border-radius: 20px; padding: 24px; border: 1px solid rgba(0,0,0,0.05); ${sh} margin-bottom: 20px;`;
    const label = 'font-size: 12px; color: #666; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.5px;';
    const val = 'font-size: 18px; font-weight: 700; color: #0d0d0d; margin: 0;';
    const block = 'background: #f9f9f8; padding: 14px 16px; border-radius: 12px;';
    const pos = 'color: #16a34a;';
    const neg = 'color: #dc2626;';
    const pill = (bg: string, fg: string) =>
      `display: inline-block; padding: 4px 12px; border-radius: 100px; font-size: 11px; font-weight: 700; background: ${bg}; color: ${fg};`;

    // ── LCI/LCA section ──
    const lciSection =
      lciRegistros.length > 0
        ? `
      <div style="${card}">
        <h3 style="font-size: 18px; font-weight: 800; color: #0d0d0d; margin: 0 0 20px; padding-bottom: 12px; border-bottom: 1px solid #f0f0f0;">LCI/LCA ≈ CDB — Análise de Equivalência</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <div style="${block}"><p style="${label}">Prazo</p><p style="${val}">${prazoDias} dias</p></div>
          <div style="${block}"><p style="${label}">Taxa LCI/LCA</p><p style="${val}">${taxaLciLca.toFixed(2)}% CDI</p></div>
          <div style="${block}"><p style="${label}">Aporte</p><p style="${val}">R$ ${aporte.toLocaleString('pt-BR')}</p></div>
          <div style="${block}"><p style="${label}">Alíquota IR (CDB)</p><p style="${val}">${aliquotaIr.toFixed(1)}%</p></div>
          <div style="${block} background: #eef6ff;"><p style="${label}">CDB bruto equivalente</p><p style="${val} color: #1a73e8;">${cdbEquivalente.toFixed(2)}% CDI</p></div>
        </div>
        <h4 style="font-size: 14px; color: #666; margin: 16px 0 12px;">Rendimento estimado (CDI a ${cdiAtual}% a.a.)</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <div style="${block}"><p style="${label}">LCI/LCA líquido (isento)</p><p style="${val} ${pos}">R$ ${rendLciLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
          <div style="${block}"><p style="${label}">CDB equiv. líquido (após IR)</p><p style="${val} ${pos}">R$ ${rendCdbLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
          <div style="${block}"><p style="${label}">Taxa efetiva a.a.</p><p style="${val}">${rendLciPctAa.toFixed(2)}% a.a.</p></div>
          <div style="${block}"><p style="${label}">Ganho real (acima IPCA)</p><p style="${val} ${ganhoRealLci >= 0 ? pos : neg}">${ganhoRealLci >= 0 ? '+' : ''}${ganhoRealLci.toFixed(2)}% a.a.</p></div>
        </div>
        <div style="padding: 14px 20px; border-radius: 12px; text-align: center; background: ${benchmarkLci.classe === 'excelente' ? '#f0fdf4' : benchmarkLci.classe === 'muito-bom' ? '#eef6ff' : benchmarkLci.classe === 'regular' ? '#fffbeb' : '#fef2f2'}; border: 1px solid ${benchmarkLci.classe === 'excelente' ? '#bbf7d0' : benchmarkLci.classe === 'muito-bom' ? '#bfdbfe' : benchmarkLci.classe === 'regular' ? '#fde68a' : '#fecaca'};">
          <strong style="font-size: 14px;">${benchmarkLci.label}</strong><br/>
          <span style="font-size: 13px; color: #555;">${benchmarkLci.descricao}</span>
        </div>
        ${
          lciRegistros.length > 0
            ? `
        <h4 style="font-size: 14px; color: #666; margin: 20px 0 12px;">Registros LCI/LCA salvos (${lciRegistros.length})</h4>
        ${lciRegistros
          .map(
            (r) => `
          <div style="padding: 12px 16px; background: #f9f9f8; border-radius: 12px; margin-bottom: 8px; font-size: 13px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
            <span>R$ <strong>${r.aporte.toLocaleString('pt-BR')}</strong></span>
            <span>${r.prazoDias}d</span>
            <span>${r.taxaLciLca.toFixed(2)}% CDI</span>
            <span style="${pill('#eef6ff', '#1a73e8')}">≈ CDB ${r.cdbEquivalente.toFixed(2)}%</span>
          </div>
        `,
          )
          .join('')}`
            : ''
        }
      </div>`
        : '';

    // ── Tesouro IPCA+ section ──
    const tesouroSection =
      tesouroRegistros.length > 0
        ? `
      <div style="${card}">
        <h3 style="font-size: 18px; font-weight: 800; color: #0d0d0d; margin: 0 0 4px;">Tesouro IPCA+ — Resumo da Carteira</h3>
        <p style="font-size: 12px; color: #888; margin: 0 0 20px;">Duration Modificada + Convexidade (Fabozzi/CFA Institute)</p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px;">
          <div style="${block}"><p style="${label}">Total investido</p><p style="${val}">R$ ${totalInvestidoTesouro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
          <div style="${block}"><p style="${label}">Taxa média contratada</p><p style="${val}">${taxaMediaTesouro.toFixed(2)}% a.a.</p></div>
          <div style="${block}"><p style="${label}">Taxa de mercado atual</p><p style="${val} ${taxaAtualTesouro < taxaMediaTesouro ? pos : taxaAtualTesouro > taxaMediaTesouro ? neg : ''}">${taxaAtualTesouro.toFixed(2)}% a.a.</p></div>
          <div style="${block}"><p style="${label}">Duration Mod. média</p><p style="${val}">${durationModMediaTesouro.toFixed(2)} anos</p></div>
          <div style="${block}"><p style="${label}">Data média de compra</p><p style="${val}">${dataMediaTesouro || '—'}</p></div>
          <div style="${block}"><p style="${label}">IR médio ponderado</p><p style="${val}">${aliquotaIrMediaTesouro.toFixed(1)}%</p></div>
        </div>
        <div style="border-top: 1px solid #f0f0f0; padding-top: 16px; margin-top: 8px;">
          <h4 style="font-size: 14px; color: #666; margin: 0 0 12px;">Análise de Ganho / Perda (MTM)</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px;">
            <div style="${block} ${mtmTotalTesouro > 0 ? 'background: #f0fdf4; border: 1px solid #bbf7d0;' : mtmTotalTesouro < 0 ? 'background: #fef2f2; border: 1px solid #fecaca;' : ''}">
              <p style="${label}">Ganho/Perda MTM estimado</p>
              <p style="${val} ${mtmTotalTesouro >= 0 ? pos : neg}">${mtmTotalTesouro >= 0 ? '+' : ''}R$ ${mtmTotalTesouro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            ${
              mtmTotalTesouro > 0
                ? `
            <div style="${block}"><p style="${label}">Líquido vender hoje (IR ${aliquotaIrMediaTesouro.toFixed(1)}%)</p><p style="${val} ${pos}">+R$ ${analisesLotes.reduce((s, a) => s + a.ganhoLiquidoHoje, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
            <div style="${block}"><p style="${label}">Líquido aguardando IR 15%</p><p style="${val} ${pos}">+R$ ${analisesLotes.reduce((s, a) => s + a.ganhoLiquidoIrMin, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
            ${economiaIrTotal > 0.01 ? `<div style="${block}"><p style="${label}">Economia fiscal esperando IR 15%</p><p style="${val} ${pos}">+R$ ${economiaIrTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>` : ''}
            <div style="${block}"><p style="${label}">Dias médios p/ IR 15%</p><p style="${val}">${diasMediosParaMenorIr === 0 ? 'IR já no mínimo ✓' : `${diasMediosParaMenorIr} dias`}</p></div>
            `
                : ''
            }
          </div>
        </div>
        <div style="text-align: center; padding: 16px 20px; border-radius: 14px; margin-bottom: 16px; background: ${decisaoTesouro.sinal === 'VENDER' ? '#fef2f2' : '#f0fdf4'}; border: 1px solid ${decisaoTesouro.sinal === 'VENDER' ? '#fecaca' : '#bbf7d0'};">
          <span style="${pill(decisaoTesouro.sinal === 'VENDER' ? '#dc2626' : '#16a34a', '#fff')} font-size: 14px; margin-bottom: 6px;">${decisaoTesouro.sinal}</span>
          <span style="display: inline-block; margin-left: 8px; font-size: 12px; font-weight: 600; color: #666;">${decisaoTesouro.forca}</span>
          <p style="font-size: 14px; color: #333; margin: 8px 0 4px;">${decisaoTesouro.texto}</p>
          <p style="font-size: 12px; color: #888; margin: 0;">${decisaoTesouro.subTexto}</p>
        </div>
        <h4 style="font-size: 14px; color: #666; margin: 16px 0 12px;">Lotes individuais (${tesouroRegistros.length})</h4>
        ${tesouroRegistros
          .map((r, i) => {
            const a = analisesLotes[i];
            return `
          <div style="padding: 16px; background: #f9f9f8; border-radius: 14px; margin-bottom: 10px; border-left: 4px solid ${r.sinal === 'vender' ? '#dc2626' : '#16a34a'};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 13px; color: #666;">Compra: <strong style="color: #0d0d0d;">${r.dataCompra}</strong></span>
              <span style="${pill(r.sinal === 'vender' ? '#fef2f2' : '#f0fdf4', r.sinal === 'vender' ? '#dc2626' : '#16a34a')}">${r.sinal.toUpperCase()}</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; font-size: 13px;">
              <span>Investido: <strong>R$ ${r.valorInvestido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
              <span>Taxa: <strong>${r.taxaContratada.toFixed(2)}%</strong></span>
              ${
                a
                  ? `
              <span>MD: <strong>${a.md.toFixed(2)}a</strong></span>
              <span>IR: <strong>${a.aliquotaIrAtual}%</strong></span>
              <span style="${a.mtmR$ >= 0 ? pos : neg}">MTM: <strong>${a.mtmR$ >= 0 ? '+' : ''}R$ ${a.mtmR$.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> (${a.mtmPct >= 0 ? '+' : ''}${a.mtmPct.toFixed(2)}%)</span>
              <span>IR 15%: <strong>${a.diasParaMenorIr === 0 ? '✓' : `${a.diasParaMenorIr}d`}</strong></span>
              `
                  : ''
              }
            </div>
            <p style="font-size: 12px; color: #888; margin: 8px 0 0; font-style: italic;">${r.analise}</p>
          </div>`;
          })
          .join('')}
      </div>`
        : '';

    // ── IA Analysis section ──
    const iaSection = analiseIa
      ? `
      <div style="${card} border-left: 4px solid #1a73e8;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <span style="${pill(analiseIa.avaliacao === 'bom' ? '#f0fdf4' : analiseIa.avaliacao === 'regular' ? '#fffbeb' : '#fef2f2', analiseIa.avaliacao === 'bom' ? '#16a34a' : analiseIa.avaliacao === 'regular' ? '#d97706' : '#dc2626')} font-size: 13px;">${analiseIa.avaliacao === 'bom' ? 'BOM' : analiseIa.avaliacao === 'regular' ? 'REGULAR' : 'RUIM'}</span>
          <h3 style="font-size: 18px; font-weight: 800; color: #0d0d0d; margin: 0;">${analiseIa.titulo}</h3>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
          <div style="${block} text-align: center;"><p style="${label}">Retorno líquido</p><p style="font-size: 15px; font-weight: 700; color: #0d0d0d; margin: 0;">${analiseIa.numerosChave.retornoLiquidoEstimado}</p></div>
          <div style="${block} text-align: center;"><p style="${label}">Ganho real (IPCA)</p><p style="font-size: 15px; font-weight: 700; color: #0d0d0d; margin: 0;">${analiseIa.numerosChave.ganhoRealAcimaIpca}</p></div>
          <div style="${block} text-align: center;"><p style="${label}">vs Tesouro Selic</p><p style="font-size: 15px; font-weight: 700; color: #0d0d0d; margin: 0;">${analiseIa.numerosChave.comparacaoTesouroSelic}</p></div>
        </div>
        <div style="font-size: 14px; line-height: 1.8; color: #333; margin-bottom: 16px;">
          ${analiseIa.analise
            .split('\n')
            .filter((p) => p.trim())
            .map((p) => `<p style="margin: 0 0 10px;">${p}</p>`)
            .join('')}
        </div>
        ${
          analiseIa.ciladas.length > 0
            ? `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
          <strong style="font-size: 13px; color: #92400e;">⚠ Alertas detectados</strong>
          <ul style="margin: 8px 0 0; padding-left: 20px; font-size: 13px; color: #78350f;">
            ${analiseIa.ciladas.map((c) => `<li style="margin-bottom: 4px;">${c}</li>`).join('')}
          </ul>
        </div>`
            : ''
        }
        <div style="text-align: center; padding: 14px 20px; border-radius: 12px; background: ${analiseIa.recomendacao === 'MANTER' ? '#f0fdf4' : analiseIa.recomendacao === 'AGUARDAR' ? '#fffbeb' : '#fef2f2'}; border: 1px solid ${analiseIa.recomendacao === 'MANTER' ? '#bbf7d0' : analiseIa.recomendacao === 'AGUARDAR' ? '#fde68a' : '#fecaca'}; margin-bottom: 12px;">
          <span style="${pill(analiseIa.recomendacao === 'MANTER' ? '#16a34a' : analiseIa.recomendacao === 'AGUARDAR' ? '#d97706' : '#dc2626', '#fff')} font-size: 14px;">${analiseIa.recomendacao}</span>
          <span style="display: inline-block; margin-left: 8px; font-size: 12px; font-weight: 600; color: #666;">${analiseIa.timing}</span>
        </div>
        <p style="text-align: center; font-size: 14px; font-style: italic; color: #555; margin: 0;">"${analiseIa.resumo}"</p>
      </div>
    `
      : '';

    return `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Análise Financeira — Oráculo Financeiro</title>
      <style>
        @media (max-width: 600px) {
          .container { padding: 16px !important; }
          .grid-2, .grid-3 { grid-template-columns: 1fr !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background: #f5f4f4; ${font}">
      <div class="container" style="max-width: 740px; margin: 0 auto; padding: 40px 24px;">

        <header style="text-align: center; margin-bottom: 28px;">
          <div style="display: inline-block; padding: 8px 20px; background: #0d0d0d; color: #fff; border-radius: 100px; font-size: 14px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 8px;">Oráculo Financeiro</div>
          <p style="font-size: 14px; color: #888; margin: 0;">Análise personalizada de renda fixa</p>
        </header>

        <div style="${card}">
          <h3 style="font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 14px;">Parâmetros de Simulação</h3>
          <div class="grid-3" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
            <div style="${block} text-align: center;"><p style="${label}">CDI atual</p><p style="${val}">${cdiAtual}% a.a.</p></div>
            <div style="${block} text-align: center;"><p style="${label}">IPCA projetado</p><p style="${val}">${ipcaProjetado}% a.a.</p></div>
            <div style="${block} text-align: center;"><p style="${label}">Macaulay Duration</p><p style="${val}">${durationAnos} anos</p></div>
          </div>
        </div>

        ${lciSection}
        ${tesouroSection}
        ${iaSection}

        <footer style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #888; margin: 0;">Gerado via Oráculo Financeiro ${APP_VERSION}</p>
        </footer>

      </div>
    </body>
    </html>
    `;
  };

  const dispararEmailRelatorio = async (emailDestino: string) => {
    setEmailSending(true);
    try {
      const res = await fetch('/api/enviar-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailDestino,
          relatorioHtml: gerarHtmlRelatorio(),
          relatorioTexto: gerarTextoRelatorio(),
        }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string; error?: string };
      if (data.ok) {
        showNotification(data.message ?? 'E-mail enviado com sucesso.', 'success');
        setShowEmailModal(false);
        setEmailDestinoInput('');
      } else {
        showNotification(data.error ?? 'Falha ao enviar e-mail.', 'error');
      }
    } catch {
      showNotification('Erro de rede — Não foi possível enviar o e-mail.', 'error');
    } finally {
      setEmailSending(false);
    }
  };

  const handleAdicionarLote = () => {
    if (!novoLoteDataCompra || novoLoteValor <= 0 || novoLoteTaxa <= 0 || taxaAtualTesouro <= 0) {
      showNotification('Parâmetros inválidos — Preencha data, valor e taxas válidas para o lote.', 'warning');
      return;
    }

    const diasIrNovoLote = calcDiasParaMenorIr(novoLoteDataCompra);

    const lotesComNovo = [
      ...lotesTesouroForm,
      {
        dataCompra: novoLoteDataCompra,
        valorInvestido: novoLoteValor,
        taxaContratada: novoLoteTaxa,
        vencimento: novoLoteVencimento,
      },
    ];

    const taxaMediaComNovo = mediasPonderadasPorCapital(lotesComNovo, (l) => l.taxaContratada);
    const dataMediaComNovo = dataMediaPonderada(lotesComNovo);

    // Análise do novo lote isolado para snapshot
    const taxaDoVencimento = taxaParaLote(novoLoteVencimento);
    const analiseNovoLote = analisarLote(
      novoLoteDataCompra,
      novoLoteValor,
      novoLoteTaxa,
      taxaDoVencimento,
      durationAnos,
    );

    // Análise completa da carteira futura para gerar sinal
    const analisesComNovo = lotesComNovo.map((l) =>
      analisarLote(l.dataCompra, l.valorInvestido, l.taxaContratada, taxaParaLote(l.vencimento), durationAnos),
    );
    const diasMediosComNovo = Math.round(
      mediasPonderadasPorCapital(
        lotesComNovo.map((l, i) => ({
          valorInvestido: l.valorInvestido,
          dias: analisesComNovo[i]?.diasParaMenorIr ?? 0,
        })),
        (l) => l.dias,
      ),
    );
    const irMediaComNovo = mediasPonderadasPorCapital(
      lotesComNovo.map((l, i) => ({ valorInvestido: l.valorInvestido, ir: analisesComNovo[i]?.aliquotaIrAtual ?? 0 })),
      (l) => l.ir,
    );
    const mtmComNovo = analisesComNovo.reduce((s, a) => s + a.mtmR$, 0);
    const econComNovo = analisesComNovo.reduce((s, a) => s + a.economiaIrAguardando, 0);

    const decisaoComNovo = gerarSinalTesouro(
      taxaMediaComNovo,
      taxaAtualTesouro,
      diasMediosComNovo,
      irMediaComNovo,
      mtmComNovo,
      econComNovo,
    );
    const sinalBinario: 'vender' | 'manter' = decisaoComNovo.sinal === 'VENDER' ? 'vender' : 'manter';

    const novoRegistro: RegistroTesouroIpca = {
      id: crypto.randomUUID(),
      criadoEm: new Date().toISOString(),
      dataCompra: novoLoteDataCompra,
      valorInvestido: novoLoteValor,
      taxaContratada: novoLoteTaxa,
      vencimento: novoLoteVencimento,
      taxaAtual: taxaDoVencimento,
      diasParaMenorIr: diasIrNovoLote,
      sinal: sinalBinario,
      analise:
        `MD: ${analiseNovoLote.md.toFixed(2)}a | MTM: R$ ${analiseNovoLote.mtmR$.toFixed(2)} | ` +
        `IR: ${analiseNovoLote.aliquotaIrAtual}% | Média carteira: ${dataMediaComNovo} taxa ${taxaMediaComNovo.toFixed(2)}% | ${decisaoComNovo.texto}`,
    };

    // Adicionar lote ao estado local (sem API)
    setTesouroRegistros((prev) => [novoRegistro, ...prev].slice(0, 200));
    showNotification(
      `Lote adicionado — ${novoLoteVencimento} — R$ ${novoLoteValor.toLocaleString('pt-BR')}, taxa ${novoLoteTaxa.toFixed(2)}%`,
      'info',
    );
    setActiveTab('tesouro-ipca');
  };

  const handleAnalisarIa = async () => {
    setAnalisandoIa(true);
    setAnaliseIa(null);
    try {
      let body: Record<string, unknown>;
      if (activeTab === 'lci-lca') {
        body = {
          tipo: 'lci-lca',
          prazoDias,
          taxaLciLca,
          aporte,
          cdiAtual,
          ipcaProjetado,
          aliquotaIr,
          cdbEquivalente,
          rendLciLiquido,
          rendCdbLiquido,
          rendLciPctAa,
          ganhoRealLci,
          benchmarkLabel: benchmarkLci.label,
          benchmarkDescricao: benchmarkLci.descricao,
        };
      } else {
        if (tesouroRegistros.length === 0) {
          showNotification('Carteira vazia — Adicione pelo menos um lote antes de analisar.', 'warning');
          setAnalisandoIa(false);
          return;
        }
        body = {
          tipo: 'tesouro-ipca',
          lotes: tesouroRegistros.map((r) => ({
            dataCompra: r.dataCompra,
            valorInvestido: r.valorInvestido,
            taxaContratada: r.taxaContratada,
          })),
          taxaAtual: taxaAtualTesouro,
          durationAnos,
          totalInvestido: totalInvestidoTesouro,
          taxaMediaContratada: taxaMediaTesouro,
          durationModMedia: durationModMediaTesouro,
          mtmTotal: mtmTotalTesouro,
          aliquotaIrMedia: aliquotaIrMediaTesouro,
          diasParaMenorIr: diasMediosParaMenorIr,
          ganhoLiquidoHoje: analisesLotes.reduce((s, a) => s + a.ganhoLiquidoHoje, 0),
          ganhoLiquidoIrMin: analisesLotes.reduce((s, a) => s + a.ganhoLiquidoIrMin, 0),
          economiaIr: economiaIrTotal,
          sinal: decisaoTesouro.sinal,
          forcaSinal: decisaoTesouro.forca,
        };
      }
      const res = await fetch('/api/analisar-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = (await res.json()) as { ok: boolean; analise: AnaliseIA };
      setAnaliseIa(data.analise);
    } catch (error) {
      showNotification(
        `Erro na análise IA — ${error instanceof Error ? error.message : 'Falha ao contactar Gemini.'}`,
        'error',
      );
    } finally {
      setAnalisandoIa(false);
    }
  };

  const handleProcessFile = async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!file || (!isImage && !isPdf)) {
      showNotification('Formato inválido — Selecione uma imagem (PNG, JPG) ou um arquivo PDF.', 'warning');
      return;
    }

    setProcessandoImg(true);
    showNotification(
      `${isPdf ? 'Processando PDF' : 'Processando imagem'} — O Gemini está extraindo os dados do extrato...`,
      'info',
    );

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const [, data] = result.split(',');
          if (!data) {
            reject(new Error('Falha ao ler o conteúdo do arquivo'));
            return;
          }
          resolve(data);
        };
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/tesouro-ipca-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data, mimeType: file.type }),
      });

      const payload = (await res.json()) as { ok: boolean; data?: LoteTesouroForm[]; error?: string };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Falha na IA Vision.');
      }

      if (!payload.data || payload.data.length === 0) {
        showNotification(
          'Nenhum dado encontrado — A IA não conseguiu identificar lotes do Tesouro IPCA+ no arquivo.',
          'warning',
        );
        return;
      }

      // Adicionar TODOS os lotes extraídos à análise local atual
      const novosRegistros: RegistroTesouroIpca[] = [];
      for (const lote of payload.data) {
        const diasIr = calcDiasParaMenorIr(lote.dataCompra);
        const analise = analisarLote(
          lote.dataCompra,
          lote.valorInvestido,
          lote.taxaContratada,
          taxaAtualTesouro,
          durationAnos,
        );
        const sinalBinario: 'vender' | 'manter' = analise.mtmR$ > 0 ? 'vender' : 'manter';

        const registro: RegistroTesouroIpca = {
          id: crypto.randomUUID(),
          criadoEm: new Date().toISOString(),
          dataCompra: lote.dataCompra,
          valorInvestido: lote.valorInvestido,
          taxaContratada: lote.taxaContratada,
          vencimento: '',
          taxaAtual: taxaAtualTesouro,
          diasParaMenorIr: diasIr,
          sinal: sinalBinario,
          analise: `MD: ${analise.md.toFixed(2)}a | MTM: R$ ${analise.mtmR$.toFixed(2)} | IR: ${analise.aliquotaIrAtual}% | Vision OCR`,
        };
        novosRegistros.push(registro);
      }

      if (novosRegistros.length > 0) {
        setTesouroRegistros((prev) => [...novosRegistros, ...prev].slice(0, 200));
      }

      // Preencher formulário com o último lote para referência visual
      const ultimo = payload.data[payload.data.length - 1];
      if (ultimo) {
        setNovoLoteDataCompra(ultimo.dataCompra);
        setNovoLoteValor(ultimo.valorInvestido);
        setNovoLoteTaxa(ultimo.taxaContratada);
      }

      if (novosRegistros.length > 0) {
        showNotification(
          `Extração concluída — ${novosRegistros.length} lote${novosRegistros.length > 1 ? 's' : ''} extraído${novosRegistros.length > 1 ? 's' : ''} e adicionado${novosRegistros.length > 1 ? 's' : ''} à análise atual.`,
          'success',
        );
      }

      setActiveTab('tesouro-ipca');
    } catch (error) {
      showNotification(
        `Erro no Vision — ${error instanceof Error ? error.message : 'Falha na comunicação com o Gemini.'}`,
        'error',
      );
    } finally {
      setProcessandoImg(false);
    }
  };

  const handleDropImagem = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (activeTab !== 'tesouro-ipca') return;

    const file = e.dataTransfer.files[0];
    if (!file) return;
    void handleProcessFile(file);
  };

  const handleInputFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleProcessFile(file);
    }
  };

  return (
    <>
      {!showLicenses ? (
        <main className="container">
          <header className="hero">
            <div className="hero-top">
              <div className="brand-panel">
                <p className="chip">Oráculo Financeiro</p>
              </div>
            </div>
          </header>

          <nav className="tabs" aria-label="Abas principais">
            <button
              className={activeTab === 'tesouro-ipca' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('tesouro-ipca')}
              type="button"
            >
              Tesouro Direto IPCA+
            </button>
            <button
              className={activeTab === 'lci-lca' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('lci-lca')}
              type="button"
            >
              LCI/LCA → Equivalente CDB
            </button>
          </nav>

          {activeTab === 'lci-lca' && (
            <section className="panel">
              <h2>LCI/LCA: &sim; CDB</h2>

              <div className="grid">
                <label htmlFor="lci-prazo-dias">
                  Prazo (Dias corridos)
                  <input
                    id="lci-prazo-dias"
                    name="lciPrazoDias"
                    type="number"
                    min={1}
                    autoComplete="off"
                    inputMode="numeric"
                    value={prazoDias}
                    onChange={(e) => setPrazoDias(Number(e.target.value))}
                  />
                </label>

                <label htmlFor="lci-taxa-cdi">
                  Taxa da LCI/LCA (% do CDI)
                  <TaxaInput
                    id="lci-taxa-cdi"
                    name="lciTaxaPercentCdi"
                    autoComplete="off"
                    value={taxaLciLca}
                    onChange={setTaxaLciLca}
                  />
                </label>

                <label htmlFor="lci-aporte">
                  Aporte (R$)
                  <input
                    id="lci-aporte"
                    name="investmentAmount"
                    type="text"
                    autoComplete="transaction-amount"
                    inputMode="decimal"
                    value={formatBRL(aporte)}
                    onChange={(e) => setAporte(parseBRL(e.target.value))}
                  />
                </label>

                <label htmlFor="cdi-atual">
                  CDI atual (% a.a.)
                  <TaxaInput
                    id="cdi-atual"
                    name="currentCdiRate"
                    autoComplete="off"
                    value={cdiAtual}
                    onChange={setCdiAtual}
                  />
                </label>

                <label htmlFor="ipca-projetado">
                  IPCA projetado 12m (% a.a.)
                  <TaxaInput
                    id="ipca-projetado"
                    name="projectedIpcaRate"
                    autoComplete="off"
                    value={ipcaProjetado}
                    onChange={setIpcaProjetado}
                  />
                </label>
              </div>

              <article className="result">
                <h3>Análise de Equivalência LCI/LCA ↔ CDB</h3>

                <div className="result-grid">
                  <div className="result-block">
                    <span className="result-label">Alíquota IR do CDB no prazo</span>
                    <span className="result-value">{aliquotaIr.toFixed(1)}%</span>
                  </div>
                  {iofPct > 0 && (
                    <div className="result-block warn">
                      <span className="result-label">IOF (prazo &lt; 30 dias)</span>
                      <span className="result-value">{iofPct.toFixed(0)}%</span>
                    </div>
                  )}
                  <div className="result-block highlight">
                    <span className="result-label">CDB bruto equivalente</span>
                    <span className="result-value">{cdbEquivalente.toFixed(2)}% CDI</span>
                  </div>
                </div>

                <div className="result-divider" />

                <h4>Rendimento estimado no período (CDI a {cdiAtual}% a.a.)</h4>
                <div className="result-grid">
                  <div className="result-block">
                    <span className="result-label">LCI/LCA líquido (isento)</span>
                    <span className="result-value positive">
                      R${' '}
                      {rendLciLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="result-block">
                    <span className="result-label">CDB equiv. líquido (após IR)</span>
                    <span className="result-value positive">
                      R${' '}
                      {rendCdbLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="result-block">
                    <span className="result-label">Taxa efetiva a.a. (LCI/LCA)</span>
                    <span className="result-value">{rendLciPctAa.toFixed(2)}% a.a.</span>
                  </div>
                  <div className="result-block">
                    <span className="result-label">Ganho real (acima do IPCA)</span>
                    <span className={`result-value ${ganhoRealLci >= 0 ? 'positive' : 'negative'}`}>
                      {ganhoRealLci >= 0 ? '+' : ''}
                      {ganhoRealLci.toFixed(2)}% a.a.
                    </span>
                  </div>
                </div>

                <div className="result-divider" />

                <div className={`benchmark-badge ${benchmarkLci.classe}`}>
                  <strong>Benchmark: {benchmarkLci.label}</strong>
                  <span>{benchmarkLci.descricao}</span>
                </div>
              </article>

              <div className="actions">
                <button onClick={handleSalvarLciLca} type="button">
                  Adicionar Registro
                </button>
                <button
                  onClick={() => void handleAnalisarIa()}
                  type="button"
                  className="btn-ia"
                  disabled={analisandoIa}
                >
                  {analisandoIa ? 'Analisando...' : '✦ Analisar com IA'}
                </button>
              </div>

              {analiseIa && (
                <article className="result analise-ia">
                  <div className="analise-ia-header">
                    <span className={`avaliacao-badge ${analiseIa.avaliacao}`}>
                      {analiseIa.avaliacao === 'bom' ? 'BOM' : analiseIa.avaliacao === 'regular' ? 'REGULAR' : 'RUIM'}
                    </span>
                    <h3>{analiseIa.titulo}</h3>
                  </div>
                  <div className="analise-ia-numeros">
                    <div className="numero-item">
                      <span className="result-label">Retorno líquido</span>
                      <span className="result-value">{analiseIa.numerosChave.retornoLiquidoEstimado}</span>
                    </div>
                    <div className="numero-item">
                      <span className="result-label">Ganho real (acima IPCA)</span>
                      <span className="result-value">{analiseIa.numerosChave.ganhoRealAcimaIpca}</span>
                    </div>
                    <div className="numero-item">
                      <span className="result-label">vs Tesouro Selic</span>
                      <span className="result-value">{analiseIa.numerosChave.comparacaoTesouroSelic}</span>
                    </div>
                  </div>
                  <div className="analise-ia-body">
                    {analiseIa.analise
                      .split('\n')
                      .filter((p) => p.trim())
                      .map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                  </div>
                  {analiseIa.ciladas.length > 0 && (
                    <div className="cilada-lista">
                      <strong>⚠ Alertas detectados</strong>
                      <ul>
                        {analiseIa.ciladas.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className={`recomendacao-banner rec-${analiseIa.recomendacao.toLowerCase()}`}>
                    <span className="rec-label">{analiseIa.recomendacao}</span>
                    <span className="rec-timing">{analiseIa.timing}</span>
                  </div>
                  <p className="analise-ia-resumo">"{analiseIa.resumo}"</p>
                </article>
              )}

              <div className="records">
                <h3>Marcação a Mercado (LCI/LCA)</h3>
                {loading && lciRegistros.length === 0 ? (
                  <p>Carregando dados do D1...</p>
                ) : lciRegistros.length === 0 ? (
                  <p>Aguardando inserção de dados...</p>
                ) : (
                  <ul>
                    {lciRegistros.map((registro) => (
                      <li key={registro.id}>
                        <span>{new Date(registro.criadoEm).toLocaleString('pt-BR')}</span>
                        <span>
                          Prazo: {registro.prazoDias}d | IR: {registro.aliquotaIr.toFixed(1)}%
                        </span>
                        <span>LCI/LCA: {registro.taxaLciLca}% CDI</span>
                        <span>Aporte: R$ {registro.aporte.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        <strong>Eq. CDB: {registro.cdbEquivalente.toFixed(2)}% CDI</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {activeTab === 'tesouro-ipca' && (
            <section
              className={`panel relative ${isDragging ? 'ring-4 ring-[#1a73e8] bg-[#f8faff]' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => void handleDropImagem(e)}
            >
              {isDragging && (
                <div className="absolute inset-0 z-50 bg-[#1a73e8]/10 backdrop-blur-sm flex items-center justify-center rounded-[30px] border-2 border-dashed border-[#1a73e8]">
                  <div className="bg-white p-6 rounded-3xl shadow-lg text-center font-bold text-[#1a73e8] text-lg">
                    Solte a imagem do extrato aqui para extração com IA
                  </div>
                </div>
              )}

              <h2>Tesouro Direto IPCA+: Marcação a Mercado</h2>

              <div
                className="feature-banner"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1.25rem',
                  backgroundColor: processandoImg ? '#fff3cd' : '#e8f0fe',
                  borderRadius: '16px',
                  marginBottom: '2rem',
                  border: `1px solid ${processandoImg ? '#ffc107' : '#d2e3fc'}`,
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {processandoImg && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      height: '3px',
                      backgroundColor: '#1a73e8',
                      animation: 'progressBar 2s ease-in-out infinite',
                      width: '100%',
                    }}
                  />
                )}
                <div className="feature-info">
                  <h3 style={{ margin: 0, color: processandoImg ? '#856404' : '#1a73e8', fontSize: '1.1rem' }}>
                    {processandoImg ? '⏳ Gemini processando...' : '✦ Auto-Preenchimento IA'}
                  </h3>
                  <p
                    style={{
                      margin: '0.25rem 0 0 0',
                      fontSize: '0.85rem',
                      color: processandoImg ? '#664d03' : '#3c4043',
                    }}
                  >
                    {processandoImg
                      ? 'Extraindo dados do extrato. Isso pode levar alguns segundos...'
                      : 'Anexe um print ou PDF do extrato. O Gemini identificará os dados sozinho.'}
                  </p>
                </div>
                <label
                  className="btn-ia"
                  style={{
                    cursor: processandoImg ? 'not-allowed' : 'pointer',
                    margin: 0,
                    padding: '0.5rem 1.25rem',
                    opacity: processandoImg ? 0.6 : 1,
                    pointerEvents: processandoImg ? 'none' : 'auto',
                  }}
                >
                  {processandoImg ? '⏳ Processando...' : 'Upload Imagem/PDF'}
                  <input
                    id="oraculo-file-upload"
                    name="documentUpload"
                    aria-label="Upload de extrato"
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    style={{ display: 'none' }}
                    onChange={handleInputFileChange}
                    disabled={processandoImg}
                  />
                </label>
              </div>

              <div className="grid">
                <label htmlFor="tesouro-taxa-atual">
                  Taxa IPCA+ ofertada hoje (% a.a.)
                  {taxaLoading && <small style={{ color: '#1a73e8', marginLeft: '0.5rem' }}>⏳ Buscando taxa...</small>}
                  {taxaRef && !taxaLoading && (
                    <small style={{ color: '#34a853', marginLeft: '0.5rem' }}>✓ Tesouro Transparente {taxaRef}</small>
                  )}
                  <TaxaInput
                    id="tesouro-taxa-atual"
                    name="currentTesouroRate"
                    autoComplete="off"
                    value={taxaAtualTesouro}
                    onChange={setTaxaAtualTesouro}
                  />
                </label>

                <label htmlFor="tesouro-duration">
                  Macaulay Duration estimada (anos)
                  <input
                    id="tesouro-duration"
                    name="durationYears"
                    type="number"
                    min={0.5}
                    step={0.1}
                    autoComplete="off"
                    inputMode="decimal"
                    value={durationAnos}
                    onChange={(e) => setDurationAnos(Number(e.target.value))}
                  />
                </label>
              </div>

              <article className="result">
                <h3>Resumo da Carteira — MTM com Convexidade</h3>
                <p className="result-footnote">Método: Duration Modificada + Convexidade (Fabozzi/CFA Institute)</p>

                <div className="result-grid">
                  <div className="result-block">
                    <span className="result-label">Total investido</span>
                    <span className="result-value">
                      R$ {totalInvestidoTesouro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="result-block">
                    <span className="result-label">Taxa média contratada (pond.)</span>
                    <span className="result-value">{taxaMediaTesouro.toFixed(2)}% a.a.</span>
                  </div>
                  <div className="result-block">
                    <span className="result-label">Taxa de mercado atual</span>
                    <span
                      className={`result-value ${taxaAtualTesouro < taxaMediaTesouro ? 'positive' : taxaAtualTesouro > taxaMediaTesouro ? 'negative' : ''}`}
                    >
                      {taxaAtualTesouro.toFixed(2)}% a.a.
                      {taxaAtualTesouro !== taxaMediaTesouro && (
                        <small>
                          {' '}
                          ({taxaAtualTesouro < taxaMediaTesouro ? '↓' : '↑'}{' '}
                          {Math.abs(taxaAtualTesouro - taxaMediaTesouro).toFixed(2)} p.p.)
                        </small>
                      )}
                    </span>
                  </div>
                  <div className="result-block">
                    <span className="result-label">Duration Modificada média</span>
                    <span className="result-value">{durationModMediaTesouro.toFixed(2)} anos</span>
                  </div>
                  <div className="result-block">
                    <span className="result-label">Data média de compra (pond.)</span>
                    <span className="result-value">{dataMediaTesouro || '—'}</span>
                  </div>
                  <div className="result-block">
                    <span className="result-label">IR médio ponderado</span>
                    <span className="result-value">{aliquotaIrMediaTesouro.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="result-divider" />
                <h4>Análise de Ganho / Perda (MTM)</h4>
                <div className="result-grid">
                  <div
                    className={`result-block ${mtmTotalTesouro > 0 ? 'highlight' : mtmTotalTesouro < 0 ? 'warn' : ''}`}
                  >
                    <span className="result-label">Ganho/Perda de MTM estimado</span>
                    <span className={`result-value ${mtmTotalTesouro >= 0 ? 'positive' : 'negative'}`}>
                      {mtmTotalTesouro >= 0 ? '+' : ''}R${' '}
                      {mtmTotalTesouro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {mtmTotalTesouro > 0 && (
                    <>
                      <div className="result-block">
                        <span className="result-label">
                          Líquido vender hoje (IR {aliquotaIrMediaTesouro.toFixed(1)}%)
                        </span>
                        <span className="result-value positive">
                          +R${' '}
                          {analisesLotes
                            .reduce((s, a) => s + a.ganhoLiquidoHoje, 0)
                            .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="result-block">
                        <span className="result-label">Líquido aguardando IR 15%</span>
                        <span className="result-value positive">
                          +R${' '}
                          {analisesLotes
                            .reduce((s, a) => s + a.ganhoLiquidoIrMin, 0)
                            .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {economiaIrTotal > 0.01 && (
                        <div className="result-block">
                          <span className="result-label">Economia fiscal esperando IR 15%</span>
                          <span className="result-value positive">
                            +R$ {economiaIrTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      <div className="result-block">
                        <span className="result-label">Dias médios para IR 15%</span>
                        <span className="result-value">
                          {diasMediosParaMenorIr === 0 ? 'IR já no mínimo ✓' : `${diasMediosParaMenorIr} dias`}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="result-divider" />

                <div
                  className={`sinal-banner sinal-${decisaoTesouro.sinal.toLowerCase().replace(' ', '-')} forca-${decisaoTesouro.forca}`}
                >
                  <div className="sinal-header">
                    <span className="sinal-badge">{decisaoTesouro.sinal}</span>
                    <span className="sinal-forca">{decisaoTesouro.forca}</span>
                  </div>
                  <p className="sinal-texto">{decisaoTesouro.texto}</p>
                  <p className="sinal-sub">{decisaoTesouro.subTexto}</p>
                </div>
              </article>

              <h3>Registrar novo lote</h3>

              <div className="grid relative">
                {processandoImg && (
                  <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
                    <span className="font-bold text-[#1a73e8] animate-pulse">Extraindo dados da imagem com AI...</span>
                  </div>
                )}
                <label htmlFor="tesouro-data-compra">
                  Data da compra
                  <input
                    id="tesouro-data-compra"
                    name="purchaseDate"
                    type="date"
                    autoComplete="off"
                    value={novoLoteDataCompra}
                    onChange={(e) => setNovoLoteDataCompra(e.target.value)}
                  />
                </label>

                <label htmlFor="tesouro-vencimento">
                  Vencimento do título
                  <select
                    id="tesouro-vencimento"
                    name="maturityDate"
                    value={novoLoteVencimento}
                    onChange={(e) => setNovoLoteVencimento(e.target.value)}
                  >
                    {titulosIpca.length === 0 && <option value="">Carregando vencimentos...</option>}
                    {titulosIpca.map((t) => (
                      <option key={t.vencimento} value={t.vencimento}>
                        IPCA+ {t.vencimento} — {t.taxaCompra.toFixed(2)}% a.a.
                      </option>
                    ))}
                  </select>
                </label>

                <label htmlFor="tesouro-valor-investido">
                  Valor investido (R$)
                  <input
                    id="tesouro-valor-investido"
                    name="investedAmount"
                    type="text"
                    autoComplete="transaction-amount"
                    inputMode="decimal"
                    value={formatBRL(novoLoteValor)}
                    onChange={(e) => setNovoLoteValor(parseBRL(e.target.value))}
                  />
                </label>

                <label htmlFor="tesouro-taxa-contratada">
                  Taxa contratada IPCA+ (% a.a.)
                  <TaxaInput
                    id="tesouro-taxa-contratada"
                    name="contractedTesouroRate"
                    autoComplete="off"
                    value={novoLoteTaxa}
                    onChange={setNovoLoteTaxa}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px', marginBottom: '16px' }}>
                <button
                  onClick={() => void handleAnalisarIa()}
                  type="button"
                  className="btn-ia"
                  disabled={analisandoIa}
                  style={{ width: '100%' }}
                >
                  {analisandoIa ? 'Analisando...' : '✦ Análise Inteligente'}
                </button>
              </div>
              <div className="actions-grid">
                <button onClick={handleAdicionarLote} type="button" className="btn-add">
                  + Adicionar lote
                </button>
                <button onClick={() => setAuthMode('save')} type="button">
                  Salvar Análise
                </button>
                <button
                  onClick={() => setAuthMode('retrieve')}
                  type="button"
                  style={{ border: '1px solid rgba(0,0,0,0.12)' }}
                >
                  Resgatar Análise
                </button>
                <button
                  onClick={() => setAuthMode('delete')}
                  type="button"
                  style={{ border: '1px solid rgba(0,0,0,0.12)', color: '#c62828' }}
                >
                  🗑️ Excluir Meus Dados
                </button>
              </div>

              {analiseIa && (
                <article className="result analise-ia">
                  <div className="analise-ia-header">
                    <span className={`avaliacao-badge ${analiseIa.avaliacao}`}>
                      {analiseIa.avaliacao === 'bom' ? 'BOM' : analiseIa.avaliacao === 'regular' ? 'REGULAR' : 'RUIM'}
                    </span>
                    <h3>{analiseIa.titulo}</h3>
                  </div>
                  <div className="analise-ia-numeros">
                    <div className="numero-item">
                      <span className="result-label">Retorno líquido</span>
                      <span className="result-value">{analiseIa.numerosChave.retornoLiquidoEstimado}</span>
                    </div>
                    <div className="numero-item">
                      <span className="result-label">Ganho real (acima IPCA)</span>
                      <span className="result-value">{analiseIa.numerosChave.ganhoRealAcimaIpca}</span>
                    </div>
                    <div className="numero-item">
                      <span className="result-label">vs Tesouro Selic</span>
                      <span className="result-value">{analiseIa.numerosChave.comparacaoTesouroSelic}</span>
                    </div>
                  </div>
                  <div className="analise-ia-body">
                    {analiseIa.analise
                      .split('\n')
                      .filter((p) => p.trim())
                      .map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                  </div>
                  {analiseIa.ciladas.length > 0 && (
                    <div className="cilada-lista">
                      <strong>⚠ Alertas detectados</strong>
                      <ul>
                        {analiseIa.ciladas.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className={`recomendacao-banner rec-${analiseIa.recomendacao.toLowerCase()}`}>
                    <span className="rec-label">{analiseIa.recomendacao}</span>
                    <span className="rec-timing">{analiseIa.timing}</span>
                  </div>
                  <p className="analise-ia-resumo">"{analiseIa.resumo}"</p>
                </article>
              )}

              <div className="records">
                {tesouroRegistros.length === 0 ? (
                  <p>Nenhum lote registrado ainda.</p>
                ) : (
                  <ul>
                    {tesouroRegistros.map((registro, i) => {
                      const analise = analisesLotes[i];
                      return (
                        <li key={registro.id}>
                          <div className="lot-header">
                            <span className="lot-date">Compra: {registro.dataCompra}</span>
                            <span className={`risk ${registro.sinal}`}>{registro.sinal.toUpperCase()}</span>
                          </div>
                          <div className="lot-grid">
                            <span>
                              Investido:{' '}
                              <strong>
                                R$ {registro.valorInvestido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </strong>
                            </span>
                            <span>
                              Taxa: <strong>{registro.taxaContratada.toFixed(2)}%</strong>
                            </span>
                            {analise && (
                              <>
                                <span>
                                  MD: <strong>{analise.md.toFixed(2)}a</strong>
                                </span>
                                <span>
                                  IR atual: <strong>{analise.aliquotaIrAtual}%</strong>
                                </span>
                                <span className={analise.mtmR$ >= 0 ? 'positive' : 'negative'}>
                                  MTM:{' '}
                                  <strong>
                                    {analise.mtmR$ >= 0 ? '+' : ''}R${' '}
                                    {analise.mtmR$.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </strong>{' '}
                                  ({analise.mtmPct >= 0 ? '+' : ''}
                                  {analise.mtmPct.toFixed(2)}%)
                                </span>
                                <span>
                                  Dias p/ IR 15%:{' '}
                                  <strong>
                                    {analise.diasParaMenorIr === 0 ? '✓ atingido' : analise.diasParaMenorIr}
                                  </strong>
                                </span>
                              </>
                            )}
                          </div>
                          <small className="lot-analise">{registro.analise}</small>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          )}

          <footer className="app-version-footer">
            <div className="footer-actions">
              <button type="button" className="ghost" onClick={() => setShowContato(true)}>
                ✉ Contato
              </button>
              <button type="button" className="ghost" onClick={() => setShowEmailModal(true)}>
                📧 Enviar por E-mail
              </button>
            </div>
            <span>{APP_VERSION}</span>
          </footer>

          {/* ── Floating Scroll FABs ─────────────────────────────────────── */}
          {(showScrollTop || showScrollBottom) && (
            <div className="floating-scroll-btns">
              {showScrollTop && (
                <button
                  type="button"
                  className="floating-scroll-btn"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  title="Voltar ao topo"
                  aria-label="Voltar ao topo"
                >
                  ↑
                </button>
              )}
              {showScrollBottom && (
                <button
                  type="button"
                  className="floating-scroll-btn"
                  onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
                  title="Ir para o final"
                  aria-label="Ir para o final"
                >
                  ↓
                </button>
              )}
            </div>
          )}

          {/* ── Contact Modal ─────────────────────────────────────────────── */}
          {showContato && (
            <div
              className="auth-overlay"
              onClick={() => setShowContato(false)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="contact-title"
            >
              <div className="auth-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                <h3 id="contact-title">Entre em Contato</h3>
                <p>Envie-nos uma mensagem. Responderemos o mais breve possível.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleContatoSubmit();
                  }}
                  autoComplete="on"
                  style={{ display: 'grid', gap: '0.75rem' }}
                >
                  <label htmlFor="contact-name" className="sr-only">
                    Seu Nome
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    name="name"
                    required
                    placeholder="Seu Nome"
                    autoComplete="name"
                    value={contatoForm.name}
                    onChange={(e) => setContatoForm((p) => ({ ...p, name: e.target.value }))}
                  />
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 180px' }}>
                      <label htmlFor="contact-phone" className="sr-only">
                        Telefone
                      </label>
                      <input
                        id="contact-phone"
                        type="tel"
                        name="phone"
                        placeholder="Telefone (Opcional)"
                        autoComplete="tel-national"
                        inputMode="tel"
                        maxLength={16}
                        value={contatoForm.phone}
                        onChange={(e) => setContatoForm((p) => ({ ...p, phone: formatPhone(e.target.value) }))}
                      />
                    </div>
                    <div style={{ flex: '1 1 180px' }}>
                      <label htmlFor="contact-email" className="sr-only">
                        Seu E-mail
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        name="email"
                        required
                        placeholder="Seu E-mail"
                        autoComplete="email"
                        value={contatoForm.email}
                        onChange={(e) => setContatoForm((p) => ({ ...p, email: e.target.value }))}
                      />
                    </div>
                  </div>
                  <label htmlFor="contact-message" className="sr-only">
                    Mensagem
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    required
                    maxLength={500}
                    autoComplete="off"
                    placeholder="Escreva sua mensagem aqui..."
                    value={contatoForm.message}
                    onChange={(e) => setContatoForm((p) => ({ ...p, message: e.target.value }))}
                    style={{ minHeight: '120px', resize: 'vertical' }}
                  />
                  <div
                    style={{
                      textAlign: 'right',
                      fontSize: '11px',
                      color: 500 - contatoForm.message.length < 50 ? '#ea4335' : '#888',
                    }}
                  >
                    {500 - contatoForm.message.length} restantes
                  </div>
                  <div className="auth-actions">
                    <button type="button" className="ghost" onClick={() => setShowContato(false)}>
                      Cancelar
                    </button>
                    <button type="submit" disabled={contatoSending}>
                      {contatoSending ? 'Enviando...' : 'Enviar Mensagem'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ── Email Report Modal ───────────────────────────────────────── */}
          {showEmailModal && (
            <div
              className="auth-overlay"
              onClick={() => setShowEmailModal(false)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="email-report-title"
            >
              <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
                <h3 id="email-report-title">📧 Enviar Análise por E-mail</h3>
                <p>Insira o endereço de e-mail para receber o relatório financeiro completo e a análise da IA.</p>
                <label htmlFor="email-relatorio-dest" className="sr-only">
                  Endereço de E-mail
                </label>
                <input
                  id="email-relatorio-dest"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="usuario@email.com"
                  value={emailDestinoInput}
                  onChange={(e) => setEmailDestinoInput(e.target.value)}
                  disabled={emailSending}
                  onKeyDown={(e) =>
                    e.key === 'Enter' &&
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDestinoInput) &&
                    void dispararEmailRelatorio(emailDestinoInput.trim())
                  }
                />
                <div className="auth-actions">
                  <button type="button" className="ghost" onClick={() => setShowEmailModal(false)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void dispararEmailRelatorio(emailDestinoInput.trim())}
                    disabled={emailSending || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDestinoInput)}
                  >
                    {emailSending ? 'Enviando...' : 'Enviar E-mail'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Auth Modal ────────────────────────────────────────────────── */}
          {authMode && (
            <div
              className="auth-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="oraculo-auth-title"
              onClick={() => {
                setAuthMode(null);
                setAuthStep('email');
                setAuthEmail('');
                setAuthToken('');
              }}
            >
              <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
                <h3 id="oraculo-auth-title">
                  {authMode === 'save'
                    ? '💾 Salvar Análise'
                    : authMode === 'delete'
                      ? '🗑️ Excluir Meus Dados'
                      : '📂 Resgatar Análise'}
                </h3>

                {authStep === 'email' && (
                  <>
                    <p>
                      {authMode === 'save'
                        ? 'Insira seu e-mail para proteger seus dados. Enviaremos um código de verificação.'
                        : authMode === 'delete'
                          ? 'Insira o e-mail vinculado aos dados que deseja excluir permanentemente. Enviaremos um código de confirmação.'
                          : 'Insira o e-mail usado anteriormente para resgatar sua análise.'}
                    </p>
                    <label htmlFor="oraculo-auth-email" className="sr-only">
                      Endereço de e-mail
                    </label>
                    <input
                      id="oraculo-auth-email"
                      name="email"
                      autoComplete="email"
                      type="email"
                      placeholder="seu@email.com"
                      aria-label="Endereço de e-mail"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void handleAuthEmailSubmit()}
                    />
                    <div className="auth-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setAuthMode(null);
                          setAuthEmail('');
                        }}
                      >
                        Cancelar
                      </button>
                      <button type="button" onClick={() => void handleAuthEmailSubmit()} disabled={authLoading}>
                        {authLoading ? 'Enviando...' : 'Enviar código'}
                      </button>
                    </div>
                  </>
                )}

                {authStep === 'token' && (
                  <>
                    <p>
                      Código enviado para <strong>{authEmail}</strong>. Insira abaixo:
                    </p>
                    <label htmlFor="oraculo-auth-token" className="sr-only">
                      Código de verificação
                    </label>
                    <input
                      id="oraculo-auth-token"
                      name="oneTimeCode"
                      autoComplete="one-time-code"
                      className="token-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      aria-label="Código de verificação"
                      value={authToken}
                      onChange={(e) => setAuthToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      onKeyDown={(e) => e.key === 'Enter' && authToken.length === 6 && void handleAuthTokenSubmit()}
                    />
                    <div className="auth-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setAuthMode(null);
                          setAuthStep('email');
                          setAuthToken('');
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAuthTokenSubmit()}
                        disabled={authLoading || authToken.length !== 6}
                      >
                        {authLoading ? 'Verificando...' : 'Verificar'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      ) : (
        <main className="container" style={{ padding: '40px 16px', maxWidth: '1000px', flex: 1, margin: '0 auto' }}>
          <div
            style={{
              background: '#fff',
              padding: '24px',
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            }}
          >
            <LicencasModule />
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '30px', marginBottom: '10px' }}>
              <button
                onClick={() => setShowLicenses(false)}
                type="button"
                style={{
                  background: '#f0f0f0',
                  color: '#333',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Voltar ao Simulador
              </button>
            </div>
          </div>
        </main>
      )}
      <ComplianceBanner onViewLicenses={() => setShowLicenses(true)} />
    </>
  );
}

export default App;
