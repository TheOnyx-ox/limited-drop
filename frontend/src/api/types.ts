export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  totalStock: number;
  availableStock: number;
}

export interface Reservation {
  id: string;
  productId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string; 
}

export interface Order {
  id: string;
  reservationId: string;
  productId: string;
  totalCents: number;
}

export type ApiErrorCode =
  | 'SOLD_OUT'
  | 'ALREADY_RESERVED'
  | 'RESERVATION_EXPIRED'
  | 'ALREADY_COMPLETED'
  | 'NOT_FOUND'
  | 'NETWORK'
  | 'UNKNOWN';

  
export class ApiError extends Error {
  code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface DropApi {
  listProducts(): Promise<Product[]>;
  reserve(productId: string): Promise<Reservation>;
  checkout(reservationId: string): Promise<Order>;
  release(reservationId: string): Promise<void>;
  activeReservations(): Promise<Reservation[]>;
}