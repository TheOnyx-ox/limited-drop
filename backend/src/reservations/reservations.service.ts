import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { isUniqueViolation, rowsOf } from '../common/db';
import { config } from '../config';
import {
  type CheckoutView,
  type OrderView,
  type ReservationStatus,
  type ReservationView,
} from './dto';

interface ReservationRow {
  id: string;
  product_id: string;
  user_id: string;
  quantity: number;
  status: ReservationStatus;
  expires_at: Date;
  created_at: Date;
  server_time: Date;
  is_expired?: boolean;
}

type ReserveAttempt =
  | { kind: 'ok'; row: ReservationRow }
  | { kind: 'sold_out' }
  | { kind: 'duplicate' };

/**
 * Rules of this service::
 *  - Stock changes only through atomic conditional UPDATEs (Postgres locks the row).
 *  - Every time comparison uses the database clock (now()), never the app's.
 *  - Lock order is always: product row first then reservation row.
 *  - Events are logged after the transaction commits, so a rolled-back
 *    transaction never claims something happened
 */

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}


  async reserve(productId: string, userId: string, quantity = 1): Promise<ReservationView> {
    let attempt = await this.tryReserve(productId, userId, quantity);

    if (attempt.kind !== 'ok') {
      await this.releaseExpired();
      attempt = await this.tryReserve(productId, userId, quantity);
    }

    if (attempt.kind === 'duplicate') {
      this.logger.warn(`reserve rejected: already holds product=${productId} user=${userId}`);
      throw new ConflictException({
        code: 'ALREADY_RESERVED',
        message: 'You already hold a reservation for this product.',
      });
    }
    if (attempt.kind === 'sold_out') {
      const exists = rowsOf(
        await this.dataSource.query(`SELECT 1 FROM products WHERE id = $1`, [productId]),
      );
      if (exists.length === 0) {
        this.logger.warn(`reserve rejected: unknown product=${productId} user=${userId}`);
        throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
      }
      this.logger.debug(`reserve rejected: sold out product=${productId} user=${userId}`);
      throw new ConflictException({
        code: 'SOLD_OUT',
        message: 'Not enough stock left. Another buyer got there first.',
      });
    }

    this.logger.log(
      `reserved reservation=${attempt.row.id} product=${productId} user=${userId} qty=${quantity}`,
    );
    return this.toView(attempt.row);
  }

  private async tryReserve(
    productId: string,
    userId: string,
    quantity: number,
  ): Promise<ReserveAttempt> {
    try {
      return await this.dataSource.transaction(async (tx): Promise<ReserveAttempt> => {
        const taken = rowsOf(
          await tx.query(
            `UPDATE products
                SET available_stock = available_stock - $2
              WHERE id = $1 AND available_stock >= $2
          RETURNING id`,
            [productId, quantity],
          ),
        );
        if (taken.length === 0) return { kind: 'sold_out' };

        const inserted = rowsOf<ReservationRow>(
          await tx.query(
            `INSERT INTO reservations (product_id, user_id, quantity, status, expires_at)
             VALUES ($1, $2, $3, 'ACTIVE', now() + ($4::int * interval '1 millisecond'))
          RETURNING *, now() AS server_time`,
            [productId, userId, quantity, config.reservationTtlMs],
          ),
        );
        return { kind: 'ok', row: inserted[0] };
      });
    } catch (err) {
      if (isUniqueViolation(err)) return { kind: 'duplicate' };
      throw err;
    }
  }

  async get(id: string, userId: string): Promise<ReservationView> {
    const rows = rowsOf<ReservationRow>(
      await this.dataSource.query(
        `SELECT *, now() AS server_time, (expires_at <= now()) AS is_expired
           FROM reservations WHERE id = $1`,
        [id],
      ),
    );
    const row = rows[0];
    if (!row || row.user_id !== userId) throw this.notFound();
    return this.toView(row);
  }

  async listActive(userId: string): Promise<ReservationView[]> {
    const rows = rowsOf<ReservationRow>(
      await this.dataSource.query(
        `SELECT *, now() AS server_time, false AS is_expired
           FROM reservations
          WHERE user_id = $1 AND status = 'ACTIVE' AND expires_at > now()
          ORDER BY created_at`,
        [userId],
      ),
    );
    return rows.map((r) => this.toView(r));
  }


  async checkout(id: string, userId: string): Promise<CheckoutView> {
    const result = await this.dataSource.transaction(async (tx) => {
      const rows = rowsOf<ReservationRow>(
        await tx.query(
          `SELECT *, now() AS server_time, (expires_at <= now()) AS is_expired
             FROM reservations WHERE id = $1 FOR UPDATE`,
          [id],
        ),
      );
      const r = rows[0];
      if (!r || r.user_id !== userId) throw this.notFound();

      if (r.status === 'COMPLETED') {
        return { order: await this.orderForReservation(tx, id), reservation: this.toView(r) };
      }

      if (r.status !== 'ACTIVE' || r.is_expired) {
        throw new GoneException({
          code: 'RESERVATION_EXPIRED',
          message:
            r.status === 'CANCELLED'
              ? 'This reservation was released.'
              : 'This reservation expired and the stock went back on sale.',
        });
      }

      const [product] = rowsOf<{ price_cents: number }>(
        await tx.query(`SELECT price_cents FROM products WHERE id = $1`, [r.product_id]),
      );


      await tx.query(`UPDATE reservations SET status = 'COMPLETED' WHERE id = $1`, [id]);
      const [orderRow] = rowsOf<any>(
        await tx.query(
          `INSERT INTO orders (reservation_id, user_id, product_id, quantity, total_cents)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [id, userId, r.product_id, r.quantity, product.price_cents * r.quantity],
        ),
      );
      return {
        order: this.toOrderView(orderRow),
        reservation: this.toView({ ...r, status: 'COMPLETED' }),
      };
    });

    this.logger.log(`checkout reservation=${id} order=${result.order.id} user=${userId}`);
    return result;
  }


  async cancel(id: string, userId: string): Promise<ReservationView> {
    const [peek] = rowsOf<{ product_id: string }>(
      await this.dataSource.query(
        `SELECT product_id FROM reservations WHERE id = $1 AND user_id = $2`,
        [id, userId],
      ),
    );
    if (!peek) throw this.notFound();

    const view = await this.dataSource.transaction(async (tx) => {
      await tx.query(`SELECT id FROM products WHERE id = $1 FOR UPDATE`, [peek.product_id]);
      const [r] = rowsOf<ReservationRow>(
        await tx.query(
          `SELECT *, now() AS server_time, (expires_at <= now()) AS is_expired
             FROM reservations WHERE id = $1 FOR UPDATE`,
          [id],
        ),
      );
      if (r.status === 'ACTIVE') {
        await tx.query(`UPDATE reservations SET status = 'CANCELLED' WHERE id = $1`, [id]);
        await tx.query(
          `UPDATE products SET available_stock = available_stock + $2 WHERE id = $1`,
          [r.product_id, r.quantity],
        );
        return this.toView({ ...r, status: 'CANCELLED' });
      }
      if (r.status === 'COMPLETED') {
        throw new ConflictException({
          code: 'ALREADY_COMPLETED',
          message: 'This reservation has already been checked out.',
        });
      }
      return this.toView(r); 
    });

    this.logger.log(`release reservation=${id} user=${userId} status=${view.status}`);
    return view;
  }


  async releaseExpired(): Promise<number> {
    const products = rowsOf<{ product_id: string }>(
      await this.dataSource.query(
        `SELECT DISTINCT product_id FROM reservations
          WHERE status = 'ACTIVE' AND expires_at <= now()`,
      ),
    );

    let released = 0;
    for (const { product_id } of products) {
      released += await this.dataSource.transaction((tx) => this.releaseForProduct(tx, product_id));
    }
    if (released > 0) this.logger.log(`Released ${released} unit(s) from expired reservations`);
    return released;
  }

  private async releaseForProduct(tx: EntityManager, productId: string): Promise<number> {
    await tx.query(`SELECT id FROM products WHERE id = $1 FOR UPDATE`, [productId]);

    const [{ released }] = rowsOf<{ released: number }>(
      await tx.query(
        `WITH expired AS (
           UPDATE reservations SET status = 'EXPIRED'
            WHERE id IN (
              SELECT id FROM reservations
               WHERE product_id = $1 AND status = 'ACTIVE' AND expires_at <= now()
                 FOR UPDATE SKIP LOCKED)  -- skip rows a checkout is holding right now
        RETURNING quantity)
         SELECT COALESCE(SUM(quantity), 0)::int AS released FROM expired`,
        [productId],
      ),
    );
    if (released > 0) {
      await tx.query(
        `UPDATE products SET available_stock = available_stock + $2 WHERE id = $1`,
        [productId, released],
      );
    }
    return released;
  }


  private async orderForReservation(tx: EntityManager, reservationId: string): Promise<OrderView> {
    const [row] = await tx.query(`SELECT * FROM orders WHERE reservation_id = $1`, [reservationId]);
    return this.toOrderView(row);
  }

  private notFound() {
    return new NotFoundException({
      code: 'RESERVATION_NOT_FOUND',
      message: 'Reservation not found.',
    });
  }

  private toView(r: ReservationRow): ReservationView {
    const status: ReservationStatus =
      r.status === 'ACTIVE' && r.is_expired ? 'EXPIRED' : r.status;
    return {
      id: r.id,
      productId: r.product_id,
      quantity: r.quantity,
      status,
      expiresAt: new Date(r.expires_at).toISOString(),
      createdAt: new Date(r.created_at).toISOString(),
      serverTime: new Date(r.server_time).toISOString(),
    };
  }

  private toOrderView(o: any): OrderView {
    return {
      id: o.id,
      reservationId: o.reservation_id,
      productId: o.product_id,
      quantity: o.quantity,
      totalCents: o.total_cents,
      createdAt: new Date(o.created_at).toISOString(),
    };
  }
}