import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1791441379633 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
         await queryRunner.query(`
      CREATE TABLE products (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name            text        NOT NULL,
        description     text        NOT NULL DEFAULT '',
        price_cents     integer     NOT NULL CHECK (price_cents >= 0),
        total_stock     integer     NOT NULL CHECK (total_stock >= 0),
        available_stock integer     NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT stock_in_range CHECK (available_stock >= 0 AND available_stock <= total_stock)
      )`);

    await queryRunner.query(`
      CREATE TABLE reservations (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id  uuid        NOT NULL REFERENCES products(id),
        user_id     text        NOT NULL,
        quantity    integer     NOT NULL CHECK (quantity > 0),
        status      text        NOT NULL CHECK (status IN ('ACTIVE','COMPLETED','EXPIRED','CANCELLED')),
        expires_at  timestamptz NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`CREATE INDEX reservations_active_expiry_idx ON reservations (expires_at) WHERE status = 'ACTIVE'`);
    await queryRunner.query(`CREATE UNIQUE INDEX reservations_one_active_per_user_idx ON reservations (product_id, user_id) WHERE status = 'ACTIVE'`);

    await queryRunner.query(`
      CREATE TABLE orders (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reservation_id uuid        NOT NULL UNIQUE REFERENCES reservations(id),
        user_id        text        NOT NULL,
        product_id     uuid        NOT NULL REFERENCES products(id),
        quantity       integer     NOT NULL CHECK (quantity > 0),
        total_cents    integer     NOT NULL CHECK (total_cents >= 0),
        created_at     timestamptz NOT NULL DEFAULT now()
      )`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE orders`);
        await queryRunner.query(`DROP TABLE reservations`);
        await queryRunner.query(`DROP TABLE products`);
    }

}
