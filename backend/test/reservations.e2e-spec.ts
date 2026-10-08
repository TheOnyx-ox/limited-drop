import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { ReservationsService } from '../src/reservations/reservations.service';

describe('Limited drop', () => {
  let app: INestApplication;
  let db: DataSource;
  let reservations: ReservationsService;


  const newUser = () => `user_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const http = () => request(app.getHttpServer());

  async function seedProduct(stock: number, priceCents = 1000): Promise<string> {
    const [row] = await db.query(
      `INSERT INTO products (name, description, price_cents, total_stock, available_stock)
       VALUES ('Test item', '', $1, $2, $2) RETURNING id`,
      [priceCents, stock],
    );
    return row.id;
  }

  const reserve = (productId: string, userId: string, quantity?: number) =>
    http().post('/reservations').set('x-user-id', userId).send({ productId, quantity });

  const checkout = (id: string, userId: string) =>
    http().post(`/reservations/${id}/checkout`).set('x-user-id', userId);

  const expireNow = (reservationId: string) =>
    db.query(`UPDATE reservations SET expires_at = now() - interval '1 second' WHERE id = $1`, [reservationId]);

  async function stockOf(productId: string) {
    const [p] = await db.query(`SELECT available_stock, total_stock FROM products WHERE id = $1`, [productId]);
    const [r] = await db.query(
      `SELECT COALESCE(SUM(quantity),0)::int AS n FROM reservations WHERE product_id=$1 AND status='ACTIVE'`,
      [productId],
    );
    const [o] = await db.query(
      `SELECT COALESCE(SUM(quantity),0)::int AS n FROM orders WHERE product_id=$1`,
      [productId],
    );
    return {
      available: p.available_stock as number,
      total: p.total_stock as number,
      held: r.n as number,
      sold: o.n as number,
    };
  }

  const expectConserved = async (productId: string) => {
    const s = await stockOf(productId);
    expect(s.available + s.held + s.sold).toBe(s.total);
  };


  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useLogger(['error', 'warn']);
    await app.listen(0); // real socket, so supertest reuses it
    db = app.get(DataSource);
    reservations = app.get(ReservationsService);
  });

  beforeEach(async () => {
    await db.query(`TRUNCATE orders, reservations, products RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await app.close();
  });


  describe('overselling protection', () => {
    it('50 simultaneous buyers, 5 units: exactly 5 win, 45 get SOLD_OUT, stock ends at 0', async () => {
      const productId = await seedProduct(5);

      const results = await Promise.all(Array.from({ length: 50 }, () => reserve(productId, newUser())));

      expect(results.filter((r) => r.status === 201)).toHaveLength(5);
      const losses = results.filter((r) => r.status === 409);
      expect(losses).toHaveLength(45);
      expect(new Set(losses.map((r) => r.body.code))).toEqual(new Set(['SOLD_OUT']));

      const s = await stockOf(productId);
      expect(s.available).toBe(0);
      expect(s.held).toBe(5);
      await expectConserved(productId);
    });

    it('the same user firing 8 requests at once gets one hold; stock drops once', async () => {
      const productId = await seedProduct(10);
      const user = newUser();
      const results = await Promise.all(Array.from({ length: 8 }, () => reserve(productId, user)));

      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409 && r.body.code === 'ALREADY_RESERVED')).toHaveLength(7);
      expect((await stockOf(productId)).available).toBe(9);
      await expectConserved(productId);
    });

    it('multi-unit reservations cannot take more than what is left', async () => {
      const productId = await seedProduct(3);
      const results = await Promise.all(Array.from({ length: 10 }, () => reserve(productId, newUser(), 2)));
      const units = results.filter((r) => r.status === 201).length * 2;
      expect(units).toBeLessThanOrEqual(3);
      expect((await stockOf(productId)).available).toBe(3 - units);
      await expectConserved(productId);
    });
  });


  describe('checkout', () => {
    it('turns a reservation into an order and keeps the unit out of stock', async () => {
      const productId = await seedProduct(2, 2500);
      const user = newUser();
      const { body: res } = await reserve(productId, user, 2).expect(201);

      const { body } = await checkout(res.id, user).expect(200);
      expect(body.order).toMatchObject({ quantity: 2, totalCents: 5000, productId });
      expect(await stockOf(productId)).toMatchObject({ available: 0, held: 0, sold: 2 });
      await expectConserved(productId);
    });

    it('is idempotent: 5 parallel checkouts give one order with one id', async () => {
      const productId = await seedProduct(1);
      const user = newUser();
      const { body: res } = await reserve(productId, user).expect(201);

      const results = await Promise.all(Array.from({ length: 5 }, () => checkout(res.id, user)));
      results.forEach((r) => expect(r.status).toBe(200));
      expect(new Set(results.map((r) => r.body.order.id)).size).toBe(1);
      const [{ count }] = await db.query(`SELECT COUNT(*)::int AS count FROM orders`);
      expect(count).toBe(1);
    });

    it("hides other users' reservations (404)", async () => {
      const productId = await seedProduct(1);
      const { body: res } = await reserve(productId, newUser()).expect(201);
      await checkout(res.id, newUser()).expect(404);
    });

    it('rejects checkout after the deadline with 410, even before any sweeper runs', async () => {
      const productId = await seedProduct(1);
      const user = newUser();
      const { body: res } = await reserve(productId, user).expect(201);
      await expireNow(res.id);

      const r = await checkout(res.id, user).expect(410);
      expect(r.body.code).toBe('RESERVATION_EXPIRED');
      const [{ count }] = await db.query(`SELECT COUNT(*)::int AS count FROM orders`);
      expect(count).toBe(0);
    });
  });


  describe('expiry', () => {
    it('the sweeper returns expired stock and leaves completed purchases alone', async () => {
      const productId = await seedProduct(3);
      const buyer = newUser();
      const flaker = newUser();
      const { body: bought } = await reserve(productId, buyer).expect(201);
      const { body: abandoned } = await reserve(productId, flaker).expect(201);
      await checkout(bought.id, buyer).expect(200);

      await expireNow(bought.id);
      await expireNow(abandoned.id);

      expect(await reservations.releaseExpired()).toBe(1);
      expect(await stockOf(productId)).toMatchObject({ available: 2, held: 0, sold: 1 });
      await expectConserved(productId);
    });

    it('running the sweeper many times at once never double-releases', async () => {
      const productId = await seedProduct(4);
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        const { body } = await reserve(productId, newUser()).expect(201);
        ids.push(body.id);
      }
      await Promise.all(ids.map(expireNow));
      await Promise.all(Array.from({ length: 6 }, () => reservations.releaseExpired()));

      expect((await stockOf(productId)).available).toBe(4);
      await expectConserved(productId);
    });

    it('a sold-out product reopens as soon as a hold lapses (no sweeper needed)', async () => {
      const productId = await seedProduct(1);
      const { body: res } = await reserve(productId, newUser()).expect(201);
      await reserve(productId, newUser()).expect(409);

      await expireNow(res.id);
      await reserve(productId, newUser()).expect(201);
      await expectConserved(productId);
    });

    it('a user can reserve again after their own hold expired', async () => {
      const productId = await seedProduct(2);
      const user = newUser();
      const { body: first } = await reserve(productId, user).expect(201);
      await expireNow(first.id);
      const { body: second } = await reserve(productId, user).expect(201);
      expect(second.id).not.toBe(first.id);
      await expectConserved(productId);
    });

    it('checkout racing the sweeper on an expired hold: no order, stock fully restored', async () => {
      const productId = await seedProduct(1);
      const user = newUser();
      const { body: res } = await reserve(productId, user).expect(201);
      await expireNow(res.id);

      const [co] = await Promise.all([checkout(res.id, user), reservations.releaseExpired()]);
      expect(co.status).toBe(410);
      await reservations.releaseExpired();
      expect(await stockOf(productId)).toMatchObject({ available: 1, held: 0, sold: 0 });
    });
  });


  describe('cancel, reads and validation', () => {
    it('release returns the unit immediately and is idempotent', async () => {
      const productId = await seedProduct(1);
      const user = newUser();
      const { body: res } = await reserve(productId, user).expect(201);

      await http().delete(`/reservations/${res.id}`).set('x-user-id', user).expect(200);
      await http().delete(`/reservations/${res.id}`).set('x-user-id', user).expect(200);
      expect(await stockOf(productId)).toMatchObject({ available: 1, held: 0, sold: 0 });
    });

    it('cannot release a purchase that was already checked out', async () => {
      const productId = await seedProduct(1);
      const user = newUser();
      const { body: res } = await reserve(productId, user).expect(201);
      await checkout(res.id, user).expect(200);
      await http().delete(`/reservations/${res.id}`).set('x-user-id', user).expect(409);
    });

    it("GET /reservations/active returns only the caller's live holds", async () => {
      const productId = await seedProduct(5);
      const me = newUser();
      await reserve(productId, me).expect(201);
      await reserve(productId, newUser()).expect(201);

      const { body } = await http().get('/reservations/active').set('x-user-id', me).expect(200);
      expect(body).toHaveLength(1);
      expect(new Date(body[0].expiresAt).getTime()).toBeGreaterThan(new Date(body[0].serverTime).getTime());
    });

    it('an overdue hold reads as EXPIRED before the sweeper runs', async () => {
      const productId = await seedProduct(1);
      const user = newUser();
      const { body: res } = await reserve(productId, user).expect(201);
      await expireNow(res.id);
      const { body } = await http().get(`/reservations/${res.id}`).set('x-user-id', user).expect(200);
      expect(body.status).toBe('EXPIRED');
    });

    it('validates input: bad ids, bad quantities, missing identity, unknown products', async () => {
      const productId = await seedProduct(1);
      await reserve('not-a-uuid', newUser()).expect(400);
      await reserve(productId, newUser(), 0).expect(400);
      await reserve(productId, newUser(), 99).expect(400);
      await http().post('/reservations').send({ productId }).expect(400); // no x-user-id
      await reserve(randomUUID(), newUser()).expect(404);
    });

    it('CHECK constraints reject impossible stock even if app code is wrong', async () => {
      const productId = await seedProduct(1);
      await expect(db.query(`UPDATE products SET available_stock = -1 WHERE id = $1`, [productId])).rejects.toThrow();
      await expect(db.query(`UPDATE products SET available_stock = 2 WHERE id = $1`, [productId])).rejects.toThrow();
    });
  });
});