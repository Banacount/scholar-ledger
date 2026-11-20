import express from 'express';
import path from 'node:path';
import { createApiApp } from './server/app.ts';
import { getDbConnectionSummary, initDatabase } from './server/db.ts';

async function startServer() {
  await initDatabase();

  const app = createApiApp();
  const PORT = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ScholarLedger SMS running on http://0.0.0.0:${PORT} (${getDbConnectionSummary()})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
