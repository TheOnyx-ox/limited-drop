import 'dotenv/config';

export const config = {
  get port() { 
    return Number(process.env.PORT ?? 3000); 
  },
  get databaseUrl() { 
    return process.env.DATABASE_URL ?? ''; 
  },
  get reservationTtlMs() { 
    return Number(process.env.RESERVATION_TTL_MS ?? 120_000); 
  },
  maxQuantityPerReservation: 2,
  get sweeperEnabled() { 
    return (process.env.SWEEPER_ENABLED ?? 'true') === 'true'; 
  },
  get sweepIntervalMs() { 
    return Number(process.env.SWEEP_INTERVAL_MS ?? 5_000); 
  },
  get corsOrigins() { 
    return (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()); 
  },
  get seedOnBoot() { 
    return (process.env.SEED_ON_BOOT ?? 'true') === 'true'; 
  },
};