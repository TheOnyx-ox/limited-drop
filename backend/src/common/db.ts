import { QueryFailedError } from 'typeorm';


export function rowsOf<T = Record<string, any>>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return (result as T[]) ?? [];
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof QueryFailedError && (err as any).driverError?.code === '23505';
}