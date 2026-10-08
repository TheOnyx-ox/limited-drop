import type { Product, Reservation } from '../api/types';
import { formatPrice } from '../lib/format';
import { HoldPanel, type Busy } from './HoldPanel';
import { StockMeter } from './StockMeter';

interface Props {
  product: Product;
  reservation?: Reservation;
  busy: Busy;
  onReserve: () => void;
  onCheckout: () => void;
  onRelease: () => void;
  onHoldExpired: () => void;
}

export function ProductCard({
  product,
  reservation,
  busy,
  onReserve,
  onCheckout,
  onRelease,
  onHoldExpired,
}: Props) {
  const soldOut = product.availableStock === 0;

  return (
    <li className="piece">
      <div className="piece-top">
        <h2>{product.name}</h2>
        <p className="desc">{product.description}</p>
        <p className="price">{formatPrice(product.priceCents)}</p>
      </div>

      <div className="piece-bottom">
        <StockMeter product={product} />

        {reservation ? (
          <HoldPanel
            key={reservation.id}
            reservation={reservation}
            busy={busy}
            onCheckout={onCheckout}
            onRelease={onRelease}
            onExpired={onHoldExpired}
          />
        ) : (
          <div className="reserve">
            <button
              type="button"
              className="btn btn-primary"
              disabled={soldOut || busy !== null}
              onClick={onReserve}
            >
              {busy === 'reserve' ? 'Reserving…' : soldOut ? 'Sold out' : 'Reserve one'}
            </button>
            {!soldOut && <p className="hint">Held for 30 seconds while you check out.</p>}
          </div>
        )}
      </div>
    </li>
  );
}