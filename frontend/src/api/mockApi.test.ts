import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function freshApi() {
  vi.resetModules();
  return (await import('./mockApi')).mockApi;
}

async function run<T>(promise: Promise<T>): Promise<T> {
  const [result] = await Promise.all([promise, vi.advanceTimersByTimeAsync(300)]);
  return result;
}

const stockOf = async (api: Awaited<ReturnType<typeof freshApi>>, id: string) =>
  (await run(api.listProducts())).find((p) => p.id === id)!.availableStock;

describe('mockApi', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reserving takes one unit out of stock', async () => {
    const api = await freshApi();
    await run(api.reserve('p3'));
    expect(await stockOf(api, 'p3')).toBe(2);
  });

  it('refuses a second hold on the same product', async () => {
    const api = await freshApi();
    await run(api.reserve('p3'));
    await expect(run(api.reserve('p3'))).rejects.toMatchObject({ code: 'ALREADY_RESERVED' });
  });

  it('reports SOLD_OUT once every unit is bought', async () => {
    const api = await freshApi();
    for (let i = 0; i < 3; i++) {
      const r = await run(api.reserve('p3')); 
      await run(api.checkout(r.id));
    }
    expect(await stockOf(api, 'p3')).toBe(0);
    await expect(run(api.reserve('p3'))).rejects.toMatchObject({ code: 'SOLD_OUT' });
  });

  it('releasing a hold returns the unit', async () => {
    const api = await freshApi();
    const r = await run(api.reserve('p3'));
    await run(api.release(r.id));
    expect(await stockOf(api, 'p3')).toBe(3);
  });

  it('rejects checkout after the hold expires and restores the stock', async () => {
    const api = await freshApi();
    const r = await run(api.reserve('p3'));
    await vi.advanceTimersByTimeAsync(31_000); 
    await expect(run(api.checkout(r.id))).rejects.toMatchObject({ code: 'RESERVATION_EXPIRED' });
    expect(await stockOf(api, 'p3')).toBe(3);
  });

  it('does not expose internal state to callers', async () => {
    const api = await freshApi();
    const list = await run(api.listProducts());
    list[0].availableStock = 999;
    expect(await stockOf(api, list[0].id)).not.toBe(999);
  });
});