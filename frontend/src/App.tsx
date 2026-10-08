import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { Product, Reservation } from './api/types';
import type { Busy } from './components/HoldPanel';
import { ProductCard } from './components/ProductCard';
import { useToast } from './hooks/toast';
import {
  keys,
  useActiveReservations,
  useCheckout,
  useProducts,
  useRelease,
  useReserve,
} from './hooks/queries';

export default function App() {
  const qc = useQueryClient();
  const toast = useToast();
  const products = useProducts();
  const active = useActiveReservations();
  const reserve = useReserve();
  const checkout = useCheckout();
  const release = useRelease();

  // productId -> this user's live hold
  const holdByProduct = useMemo(
    () => new Map((active.data ?? []).map((r) => [r.productId, r])),
    [active.data],
  );

  const onHoldExpired = useCallback(
    (name: string) => {
      toast('error', `Your hold on ${name} expired. The unit is back on sale.`);
      qc.invalidateQueries({ queryKey: keys.products });
      qc.invalidateQueries({ queryKey: keys.active });
    },
    [qc, toast],
  );

  function busyFor(p: Product, r?: Reservation): Busy {
    if (reserve.isPending && reserve.variables === p.id) return 'reserve';
    if (r && checkout.isPending && checkout.variables === r.id) return 'checkout';
    if (r && release.isPending && release.variables === r.id) return 'release';
    return null;
  }

  return (
    <>
<header className="masthead">
  <h1>Limited Drop</h1>
  <p>Limited drops, made once. Reserve a piece, then check out before the clock runs out.</p>
</header>

      <main>
        {products.isPending && <p className="state">Loading the drop…</p>}

        {products.isError && (
          <div className="state" role="alert">
            <p>We could not load the products.</p>
            <button type="button" className="btn btn-primary" onClick={() => products.refetch()}>
              Try again
            </button>
          </div>
        )}

        {products.data && (
          <ul className="shelf">
            {products.data.map((p) => {
              const r = holdByProduct.get(p.id);
              return (
                <ProductCard
                  key={p.id}
                  product={p}
                  reservation={r}
                  busy={busyFor(p, r)}
                  onReserve={() =>
                    reserve.mutate(p.id, {
                      onSuccess: () => toast('success', `${p.name} is held for you.`),
                    })
                  }
                  onCheckout={() =>
                    r &&
                    checkout.mutate(r.id, {
                      onSuccess: () => toast('success', `Order placed: ${p.name}.`),
                    })
                  }
                  onRelease={() =>
                    r &&
                    release.mutate(r.id, {
                      onSuccess: () => toast('info', `Released ${p.name}. It is back on sale.`),
                    })
                  }
                  onHoldExpired={() => onHoldExpired(p.name)}
                />
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}