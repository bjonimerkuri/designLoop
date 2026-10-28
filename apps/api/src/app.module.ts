import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { EvalsController } from './evals.controller';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

@Module({
  controllers: [RunsController, EvalsController, HealthController, ConfigController],
  providers: [PrismaService, RunsService]
})
export class AppModule {}
