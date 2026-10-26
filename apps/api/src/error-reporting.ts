import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { AbstractHttpAdapter, BaseExceptionFilter } from '@nestjs/core';

type Reporter = (error: unknown) => void;

let reporter: Reporter | null = null;

export const reportError: Reporter = (error) => reporter?.(error);

export async function initErrorReporting(): Promise<Reporter | null> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;
  const Sentry = await import('@sentry/node');
  Sentry.init({ dsn, environment: process.env.NODE_ENV ?? 'development', tracesSampleRate: 0 });
  reporter = (error) => {
    Sentry.captureException(error);
  };
  return reporter;
}

@Catch()
export class ReportingFilter extends BaseExceptionFilter {
  constructor(adapter: AbstractHttpAdapter) {
    super(adapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? (exception as HttpException).getStatus() : 500;
    if (status >= 500) reportError(exception);
    super.catch(exception, host);
  }
}
