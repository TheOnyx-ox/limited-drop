import { getUserId } from '../lib/identity';
import {
  ApiError,
  type ApiErrorCode,
  type DropApi,
  type Order,
  type Product,
  type Reservation,
} from './types';

const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

function toCode(backendCode: unknown): ApiErrorCode {
  switch (backendCode) {
    case 'SOLD_OUT':
    case 'ALREADY_RESERVED':
    case 'RESERVATION_EXPIRED':
    case 'ALREADY_COMPLETED':
      return backendCode;
    case 'PRODUCT_NOT_FOUND':
    case 'RESERVATION_NOT_FOUND':
      return 'NOT_FOUND';
    default:
      return 'UNKNOWN';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': getUserId(),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('NETWORK', "Can't reach the server. Check your connection and try again.");
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new ApiError(toCode(body?.code), message ?? 'Something went wrong.');
  }
  return body as T;
}

export const realApi: DropApi = {
  listProducts: () => request<Product[]>('/products'),

  reserve: (productId) =>
    request<Reservation>('/reservations', {
      method: 'POST',
      body: JSON.stringify({ productId }),
    }),

  activeReservations: () => request<Reservation[]>('/reservations/active'),

  checkout: async (reservationId) =>
    (await request<{ order: Order }>(`/reservations/${reservationId}/checkout`, { method: 'POST' })).order,

  release: async (reservationId) => {
    await request(`/reservations/${reservationId}`, { method: 'DELETE' });
  },
};