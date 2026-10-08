import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { config } from '../config';

export type ReservationStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';

export class CreateReservationDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(config.maxQuantityPerReservation)
  quantity?: number;
}

export interface ReservationView {
  id: string;
  productId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  createdAt: string;
  serverTime: string;
}

export interface OrderView {
  id: string;
  reservationId: string;
  productId: string;
  quantity: number;
  totalCents: number;
  createdAt: string;
}

export interface CheckoutView {
  order: OrderView;
  reservation: ReservationView;
}