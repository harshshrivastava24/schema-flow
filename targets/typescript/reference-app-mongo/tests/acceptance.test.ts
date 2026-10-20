import { test } from 'node:test';
import assert from 'node:assert';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB, disconnectDB } from '../src/generated/db.js';
import { createApp } from '../src/generated/server.js';
import { runAcceptanceSuite } from '@schemaflow/acceptance-suite';

test('TypeScript Express 5 + Mongoose reference app passes full shared HTTP acceptance suite', async () => {
  let mongod: MongoMemoryServer | null = null;
  let server: Server | null = null;

  try {
    // 1. Initialize MongoDB in-memory server
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();

    // 2. Connect reference app database
    await connectDB(mongoUri);

    // 3. Start Express 5 application on dynamic ephemeral port
    const app = createApp();
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });

    const address = server.address() as AddressInfo;
    const baseUrl = `http://localhost:${address.port}`;

    // 4. Execute language-agnostic shared acceptance runner
    const report = await runAcceptanceSuite({
      baseUrl,
      verbose: false,
      throwOnError: false
    });

    if (!report.passed) {
      const failureList = report.steps
        .filter((s) => !s.passed)
        .map((s) => `[${s.name}]: ${s.error}`)
        .join('\n');
      assert.fail(`Acceptance suite failed with ${report.failedCount} errors:\n${failureList}`);
    }

    assert.strictEqual(report.passed, true);
    assert.strictEqual(report.failedCount, 0);
    assert.strictEqual(report.total, 10);
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await disconnectDB();
    if (mongod) {
      await mongod.stop();
    }
  }
});
