import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.routes.js';
import { userRouter } from './routes/user.routes.js';
import { postRouter } from './routes/post.routes.js';
import { connectDB } from './db.js';

export function createApp(): Application {
  const app: Application = express();

  app.use(cors());
  app.use(express.json());

  // Health check endpoint
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/posts', postRouter);

  // 404 Not Found Handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Global Error Handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error'
    });
  });

  return app;
}

export async function startServer(port = 3000) {
  await connectDB();
  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
  return { app, server };
}
