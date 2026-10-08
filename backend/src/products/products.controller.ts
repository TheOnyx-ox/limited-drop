import { Controller, Get } from '@nestjs/common';
import { ProductsService, ProductView } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  list(): Promise<ProductView[]> {
    return this.service.list();
  }
}