import { startServer } from './generated/server.js';
import dotenv from 'dotenv';

dotenv.config();

const port = parseInt(process.env.PORT || '3000', 10);

startServer(port).catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
