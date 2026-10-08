import type { Product } from '../api/types';

export function StockMeter({ product }: { product: Product }) {
  const { totalStock, availableStock } = product;
  const taken = totalStock - availableStock;

  return (
    <figure className="meter">
      <div
        className="dots"
        role="img"
        aria-label={`Edition of ${totalStock}: ${availableStock} available, ${taken} taken`}
      >
        {Array.from({ length: totalStock }, (_, i) => (
          <span key={i} className={`dot ${i < taken ? 'dot-taken' : 'dot-free'}`} aria-hidden="true" />
        ))}
      </div>
      <figcaption className="legend">
        {availableStock === 0 ? 'Every one has found a home.' : <><b>{availableStock}</b> of {totalStock} left</>}
      </figcaption>
    </figure>
  );
}