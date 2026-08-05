import { afterEach, describe, expect, it, vi } from 'vitest'

import worker from './index'

const CSV_FIXTURE = [
  'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha',
  'Tesouro IPCA+;15/08/2040;01/08/2026;7,16;7,28;1724,41;1696,38',
].join('\n')

describe('taxaipca-motor ingress containment', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('rejects HTTP without downloading data or touching D1', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const bind = vi.fn(() => ({ run }))
    const prepare = vi.fn(() => ({ bind }))
    const outboundFetch = vi.fn().mockResolvedValue(
      new Response(CSV_FIXTURE, {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      }),
    )
    vi.stubGlobal('fetch', outboundFetch)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const httpHandler: (request: Request, env: { BIGDATA_DB: unknown }) => Response = worker.fetch
    const response = await httpHandler(new Request('https://taxaipca.invalid/manual'), {
      BIGDATA_DB: { prepare },
    })

    expect(response.status).toBe(404)
    expect(outboundFetch).not.toHaveBeenCalled()
    expect(prepare).not.toHaveBeenCalled()
  })

  it('keeps scheduled processing and D1 persistence active', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const bind = vi.fn(() => ({ run }))
    const prepare = vi.fn(() => ({ bind }))
    const outboundFetch = vi.fn().mockResolvedValue(
      new Response(CSV_FIXTURE, {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      }),
    )
    const pending: Promise<unknown>[] = []
    const waitUntil = vi.fn((promise: Promise<unknown>) => pending.push(promise))
    vi.stubGlobal('fetch', outboundFetch)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await worker.scheduled(
      { scheduledTime: Date.UTC(2026, 7, 1, 5), cron: '0 5 * * *' },
      { BIGDATA_DB: { prepare } },
      { waitUntil, passThroughOnException: vi.fn() },
    )
    await Promise.all(pending)

    expect(waitUntil).toHaveBeenCalledOnce()
    expect(outboundFetch).toHaveBeenCalledOnce()
    expect(prepare).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledOnce()
  })
})
