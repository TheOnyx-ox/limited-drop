import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { config } from './config';
import { ProductsModule } from './products/products.module';
import { ReservationsModule } from './reservations/reservations.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres' as const,
        url: config.databaseUrl,
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        migrationsRun: true, 
        synchronize: false,  
      }),
    }),
    ProductsModule,
    ReservationsModule,
  ],
})
export class AppModule {}