import { useEffect, useState } from 'react';

export function useCountdown(expiresAt: string): number {
  const deadline = Date.parse(expiresAt);
  const [remaining, setRemaining] = useState(() => deadline - Date.now());

  useEffect(() => {
    const tick = () => setRemaining(deadline - Date.now());
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id); 
  }, [deadline]);

  return remaining;
}