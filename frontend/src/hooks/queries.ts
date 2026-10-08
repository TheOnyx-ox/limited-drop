import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { describeError } from '../lib/errors';
import { useToast } from './toast';

export const keys = {
  products: ['products'] as const,
  active: ['reservations', 'active'] as const,
};

export const useProducts = () =>
  useQuery({
    queryKey: keys.products,
    queryFn: () => api.listProducts(),
    refetchInterval: 3000, 
  });

export const useActiveReservations = () =>
  useQuery({ queryKey: keys.active, queryFn: () => api.activeReservations() });

function useRefresh() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.products }),
      qc.invalidateQueries({ queryKey: keys.active }),
    ]);
}

export function useReserve() {
  const refresh = useRefresh();
  const toast = useToast();
  return useMutation({
    mutationFn: (productId: string) => api.reserve(productId),
    onError: (err) => toast('error', describeError(err)),
    onSettled: refresh, 
  });
}

export function useCheckout() {
  const refresh = useRefresh();
  const toast = useToast();
  return useMutation({
    mutationFn: (reservationId: string) => api.checkout(reservationId),
    onError: (err) => toast('error', describeError(err)),
    onSettled: refresh,
  });
}

export function useRelease() {
  const refresh = useRefresh();
  const toast = useToast();
  return useMutation({
    mutationFn: (reservationId: string) => api.release(reservationId),
    onError: (err) => toast('error', describeError(err)),
    onSettled: refresh,
  });
}