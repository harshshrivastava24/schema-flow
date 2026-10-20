import { test } from 'node:test';
import assert from 'node:assert';
import { createServer, type Server } from 'node:http';
import { runAcceptanceSuite } from './runner.js';

test('acceptance runner verifies passing mock server', async () => {
  let createdUser: any = null;
  const mockToken = 'mock.jwt.token123';

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname;
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');

      if (path === '/healthz' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (path === '/api/auth/register' && req.method === 'POST') {
        res.writeHead(201);
        res.end(JSON.stringify({ token: mockToken, user: { id: 'u1' } }));
        return;
      }

      if (path === '/api/auth/login' && req.method === 'POST') {
        res.writeHead(200);
        res.end(JSON.stringify({ token: mockToken }));
        return;
      }

      if (path === '/api/users' && req.method === 'POST') {
        const parsed = JSON.parse(body || '{}');
        if (!parsed.name || !parsed.email || !parsed.email.includes('@')) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Validation failed' }));
          return;
        }
        createdUser = { id: 'user_mock_123', email: parsed.email, name: parsed.name, role: parsed.role || 'USER' };
        res.writeHead(201);
        res.end(JSON.stringify(createdUser));
        return;
      }

      if (path === '/api/users' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify(createdUser ? [createdUser] : []));
        return;
      }

      if (path.startsWith('/api/users/') && req.method === 'GET') {
        const id = path.split('/').pop();
        if (createdUser && createdUser.id === id) {
          res.writeHead(200);
          res.end(JSON.stringify(createdUser));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        }
        return;
      }

      if (path.startsWith('/api/users/') && (req.method === 'PATCH' || req.method === 'PUT')) {
        const id = path.split('/').pop();
        if (createdUser && createdUser.id === id) {
          const parsed = JSON.parse(body || '{}');
          createdUser = { ...createdUser, ...parsed };
          res.writeHead(200);
          res.end(JSON.stringify(createdUser));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        }
        return;
      }

      if (path.startsWith('/api/users/') && req.method === 'DELETE') {
        const id = path.split('/').pop();
        if (createdUser && createdUser.id === id) {
          createdUser = null;
          res.writeHead(204);
          res.end();
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        }
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}`;

  try {
    const report = await runAcceptanceSuite({ baseUrl, verbose: false });
    assert.strictEqual(report.passed, true);
    assert.strictEqual(report.failedCount, 0);
    assert.strictEqual(report.total, 10);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
