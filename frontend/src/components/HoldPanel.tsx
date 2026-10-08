import { useEffect, useRef } from 'react';
import type { Reservation } from '../api/types';
import { useCountdown } from '../hooks/useCountdown';
import { formatRemaining } from '../lib/format';

export type Busy = 'reserve' | 'checkout' | 'release' | null;

interface Props {
  reservation: Reservation;
  busy: Busy;
  onCheckout: () => void;
  onRelease: () => void;
  onExpired: () => void;
}

export function HoldPanel({ reservation, busy, onCheckout, onRelease, onExpired }: Props) {
  const remaining = useCountdown(reservation.expiresAt);
  const expired = remaining <= 0;
  const urgent = !expired && remaining < 10_000;

  const notified = useRef(false);
  useEffect(() => {
    if (expired && !notified.current) {
      notified.current = true;
      onExpired();
    }
  }, [expired, onExpired]);

  return (
    <div className="hold" data-urgent={urgent || undefined}>
      <p className="hold-label">{expired ? 'This hold has ended' : 'Set aside for you'}</p>
      <strong className="clock" aria-hidden="true">
        {formatRemaining(remaining)}
      </strong>
      <span className="sr-only">
        {expired ? 'Your hold has expired.' : `About ${Math.ceil(remaining / 1000)} seconds left to check out.`}
      </span>
      <div className="actions">
        <button type="button" className="btn btn-primary" disabled={expired || busy !== null} onClick={onCheckout}>
          {busy === 'checkout' ? 'Placing order…' : 'Check out'}
        </button>
        <button type="button" className="btn btn-quiet" disabled={expired || busy !== null} onClick={onRelease}>
          {busy === 'release' ? 'Releasing…' : 'Release'}
        </button>
      </div>
    </div>
  );
}