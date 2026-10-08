import { ApiError, type DropApi, type Order, type Product, type Reservation } from './types';

const HOLD_MS = 30_000; 
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms)); 

const products: Product[] = [
  { 
    id: 'p1', 
    name: 'Fieldnote Radio', 
    description: 'Pocket FM receiver in anodised aluminium.', 
    priceCents: 14900, 
    totalStock: 12, 
    availableStock: 12 

  },
  { 
    id: 'p2', 
    name: 'Pour-Over Set', 
    description: 'Stoneware dripper and two cups.', 
    priceCents: 8900, 
    totalStock: 5, 
    availableStock: 5 
  },
  { 
    id: 'p3', 
    name: 'Brass Desk Lamp', 
    description: 'Spun brass shade, dimmable.', 
    priceCents: 21000, 
    totalStock: 3, 
    availableStock: 3 
  },
];
const reservations: Reservation[] = [];
const orders: Order[] = [];

function sweep() {
  const now = Date.now();
  for (const r of reservations) {
    if (r.status === 'ACTIVE' && Date.parse(r.expiresAt) <= now) {
      r.status = 'EXPIRED';
      products.find((p) => p.id === r.productId)!.availableStock += 1;
    }
  }
}

export const mockApi: DropApi = {
  async listProducts() {
    await delay();
    sweep();
    return products.map((p) => ({ ...p })); 
  },

  async reserve(productId) {
    await delay();
    sweep();
    const product = products.find((p) => p.id === productId);
    if (!product) throw new ApiError('NOT_FOUND', 'Product not found.');
    if (reservations.some((r) => r.productId === productId && r.status === 'ACTIVE'))
      throw new ApiError('ALREADY_RESERVED', 'You already hold this product.');
    if (product.availableStock < 1) throw new ApiError('SOLD_OUT', 'Sold out.');

    product.availableStock -= 1;
    const r: Reservation = {
      id: crypto.randomUUID(),
      productId,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + HOLD_MS).toISOString(),
    };
    reservations.push(r);
    return { ...r };
  },

  async checkout(reservationId) {
    await delay();
    sweep();
    const r = reservations.find((x) => x.id === reservationId);
    if (!r) throw new ApiError('NOT_FOUND', 'Reservation not found.');
    if (r.status !== 'ACTIVE') throw new ApiError('RESERVATION_EXPIRED', 'This hold has expired.');
    r.status = 'COMPLETED';
    const price = products.find((p) => p.id === r.productId)!.priceCents;
    const order: Order = { id: crypto.randomUUID(), reservationId, productId: r.productId, totalCents: price };
    orders.push(order);
    return order;
  },

  async release(reservationId) {
    await delay();
    const r = reservations.find((x) => x.id === reservationId);
    if (r?.status === 'ACTIVE') {
      r.status = 'CANCELLED';
      products.find((p) => p.id === r.productId)!.availableStock += 1;
    }
  },

  async activeReservations() {
    await delay();
    sweep();
    return reservations.filter((r) => r.status === 'ACTIVE').map((r) => ({ ...r }));
  },
};