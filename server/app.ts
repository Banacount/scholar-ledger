import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { initDatabase } from './db.ts';
import { apiRouter } from './routes.ts';

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      await initDatabase();
      next();
    } catch (err) {
      next(err);
    }
  });

  app.use('/api', apiRouter);

  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('API Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error.';
    res.status(500).json({ error: message });
  });

  return app;
}
