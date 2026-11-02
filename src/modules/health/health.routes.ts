import { Request, Response, Router } from 'express';
import { DataSource } from 'typeorm';

export function createHealthRouter(dataSource: DataSource): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    let database = 'up';
    try {
      await dataSource.query('SELECT 1');
    } catch {
      database = 'down';
    }
    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
