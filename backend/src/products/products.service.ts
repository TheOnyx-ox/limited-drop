import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { config } from '../config';

export interface ProductView {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  totalStock: number;
  availableStock: number;
}

interface ProductRow {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  total_stock: number;
  available_stock: number;
}

@Injectable()
export class ProductsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProductsService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(): Promise<ProductView[]> {
    const rows: ProductRow[] = await this.dataSource.query(
      `SELECT id, name, description, price_cents, total_stock, available_stock
         FROM products ORDER BY created_at, name`,
    );
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priceCents: p.price_cents,
      totalStock: p.total_stock,
      availableStock: p.available_stock,
    }));
  }

  async onApplicationBootstrap() {
    if (!config.seedOnBoot) return;
    const [{ count }] = await this.dataSource.query(`SELECT COUNT(*)::int AS count FROM products`);
    if (count > 0) return;

    const demo = [
      ['Fieldnote Radio', 'Pocket FM receiver in anodised aluminium.', 14900, 12],
      ['Pour-Over Set', 'Stoneware dripper and two cups.', 8900, 5],
      ['Brass Desk Lamp', 'Spun brass shade, dimmable.', 21000, 3],
    ] as const;
    for (const [name, description, price, stock] of demo) {
      await this.dataSource.query(
        `INSERT INTO products (name, description, price_cents, total_stock, available_stock)
         VALUES ($1, $2, $3, $4, $4)`,
        [name, description, price, stock],
      );
    }
    this.logger.log(`Seeded ${demo.length} demo products`);
  }
}