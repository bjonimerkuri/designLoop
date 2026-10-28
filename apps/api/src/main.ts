import './env';
import 'reflect-metadata';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ReportingFilter, initErrorReporting } from './error-reporting';
import { securityHeaders } from './security';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  const proxy = process.env.TRUST_PROXY;
  if (proxy) app.set('trust proxy', /^\d+$/.test(proxy) ? Number(proxy) : proxy === 'true' ? true : proxy);
  if (await initErrorReporting()) {
    app.useGlobalFilters(new ReportingFilter(app.get(HttpAdapterHost).httpAdapter));
  }
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'content-type',
      'authorization',
      'x-llm-provider',
      'x-llm-api-key',
      'x-llm-model',
      'x-llm-price-in',
      'x-llm-price-out'
    ]
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 4000));
}

bootstrap();
