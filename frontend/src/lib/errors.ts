import { ApiError } from '../api/types';

export function describeError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Try again.';
  switch (err.code) {
    case 'SOLD_OUT':
      return 'Sold out. Someone else got the last unit.';
    case 'ALREADY_RESERVED':
      return 'You already hold this product. Check out or release it first.';
    case 'RESERVATION_EXPIRED':
      return 'Your hold ran out and the unit went back on sale.';
    case 'ALREADY_COMPLETED':
      return 'This reservation has already been checked out.';
    case 'NOT_FOUND':
      return 'We could not find that item.';
    case 'NETWORK':
    case 'UNKNOWN':
      return err.message; // already written for a human
  }
}