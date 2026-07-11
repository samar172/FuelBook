import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';

import { errorHandler, appErrorHandler } from './middleware/error';
import { bigIntJson } from './middleware/serialize';

import authRoutes from './routes/auth';
import shiftRoutes from './routes/shifts';
import setupRoutes from './routes/setup';
import creditRoutes from './routes/credit';
import userRoutes from './routes/users';
import dashboardRoutes from './routes/dashboard';
import tankerRoutes from './routes/tankerReceipts';
import exportRoutes from './routes/exports';
import employeeRoutes from './routes/employees';

const app = express();

app.use(helmet());

// CORS allow-list. Each entry is either an exact origin
// (e.g. `https://fuelbook.vercel.app`) or a wildcard suffix
// like `*.vercel.app` which matches any subdomain.
const allowList = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isOriginAllowed = (origin: string): boolean => {
  for (const entry of allowList) {
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(1); // ".vercel.app"
      try {
        const host = new URL(origin).hostname;
        if (host === suffix.slice(1) || host.endsWith(suffix)) return true;
      } catch {
        // ignore malformed origin
      }
    } else if (origin === entry) {
      return true;
    }
  }
  return false;
};

app.use(
  cors({
    origin: (origin, cb) => {
      // Server-to-server / curl / mobile apps send no Origin — allow.
      if (!origin) return cb(null, true);
      if (isOriginAllowed(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(bigIntJson);

app.get('/', (_req, res) => res.json({ name: 'FuelBook API', version: '0.1.0', ok: true }));
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/credit', creditRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tanker-receipts', tankerRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/employees', employeeRoutes);

app.use(appErrorHandler);
app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '4000', 10);
app.listen(PORT, () => {
  console.log(`[fuelbook-api] listening on http://localhost:${PORT}`);
});
