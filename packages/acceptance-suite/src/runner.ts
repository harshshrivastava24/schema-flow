export interface AcceptanceOptions {
  baseUrl: string;
  verbose?: boolean;
  timeoutMs?: number;
  throwOnError?: boolean;
}

export interface TestStepResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface AcceptanceReport {
  baseUrl: string;
  passed: boolean;
  total: number;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  steps: TestStepResult[];
}

function normalizeUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

async function requestJson(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<{ status: number; body: any; headers: Headers }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {})
      }
    });

    const text = await res.text();
    let body: any = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    return { status: res.status, body, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

export async function runAcceptanceSuite(options: AcceptanceOptions): Promise<AcceptanceReport> {
  const { baseUrl, verbose = false, timeoutMs = 10000, throwOnError = false } = options;
  const startTime = Date.now();
  const steps: TestStepResult[] = [];

  const log = (msg: string) => {
    if (verbose) {
      // eslint-disable-next-line no-console
      console.log(`[acceptance-suite] ${msg}`);
    }
  };

  async function executeStep(
    name: string,
    fn: () => Promise<Record<string, unknown> | void>
  ): Promise<boolean> {
    const stepStart = Date.now();
    try {
      log(`Starting step: ${name}`);
      const details = (await fn()) || {};
      const durationMs = Date.now() - stepStart;
      steps.push({ name, passed: true, durationMs, details });
      log(`PASS: ${name} (${durationMs}ms)`);
      return true;
    } catch (err: any) {
      const durationMs = Date.now() - stepStart;
      const errorMsg = err?.message || String(err);
      steps.push({ name, passed: false, durationMs, error: errorMsg });
      log(`FAIL: ${name} (${durationMs}ms) - ${errorMsg}`);
      return false;
    }
  }

  let authToken = '';
  let createdUserId = '';
  const runId = Math.random().toString(36).substring(2, 8);
  const authEmail = `acceptance.admin.${runId}@example.com`;
  const crudUserEmail = `acceptance.user.${runId}@example.com`;
  const password = 'Password123!Secure';

  // 1. GET /healthz -> 200 OK
  await executeStep('1. Health Check (GET /healthz)', async () => {
    const target = normalizeUrl(baseUrl, '/healthz');
    const { status, body } = await requestJson(target, { method: 'GET' }, timeoutMs);
    if (status !== 200) {
      throw new Error(`Expected HTTP 200 from /healthz, got ${status}. Body: ${JSON.stringify(body)}`);
    }
    if (!body || (typeof body === 'object' && body.status && body.status !== 'ok')) {
      throw new Error(`Unexpected body format from /healthz: ${JSON.stringify(body)}`);
    }
    return { status, body };
  });

  // 2. POST /api/auth/register -> returns valid JWT token
  await executeStep('2. Auth Registration (POST /api/auth/register)', async () => {
    const target = normalizeUrl(baseUrl, '/api/auth/register');
    const payload = {
      email: authEmail,
      password,
      name: 'Acceptance Admin',
      role: 'ADMIN'
    };
    const { status, body } = await requestJson(
      target,
      { method: 'POST', body: JSON.stringify(payload) },
      timeoutMs
    );
    if (status !== 201 && status !== 200) {
      throw new Error(`Expected HTTP 201/200 from /api/auth/register, got ${status}. Body: ${JSON.stringify(body)}`);
    }
    const token = body?.token || body?.accessToken || body?.data?.token;
    if (!token || typeof token !== 'string') {
      throw new Error(`Missing token in register response: ${JSON.stringify(body)}`);
    }
    if (token.split('.').length !== 3) {
      throw new Error(`Token does not match JWT format (header.payload.signature): ${token}`);
    }
    authToken = token;
    return { status, hasToken: true };
  });

  // 3. POST /api/auth/login -> returns valid JWT token
  await executeStep('3. Auth Login (POST /api/auth/login)', async () => {
    const target = normalizeUrl(baseUrl, '/api/auth/login');
    const payload = { email: authEmail, password };
    const { status, body } = await requestJson(
      target,
      { method: 'POST', body: JSON.stringify(payload) },
      timeoutMs
    );
    if (status !== 200) {
      throw new Error(`Expected HTTP 200 from /api/auth/login, got ${status}. Body: ${JSON.stringify(body)}`);
    }
    const token = body?.token || body?.accessToken || body?.data?.token;
    if (!token || typeof token !== 'string') {
      throw new Error(`Missing token in login response: ${JSON.stringify(body)}`);
    }
    if (token.split('.').length !== 3) {
      throw new Error(`Token does not match JWT format: ${token}`);
    }
    // Update authToken to the freshly issued login token
    authToken = token;
    return { status, hasToken: true };
  });

  // 4. Schema Validation on Bad Input -> 400 Bad Request
  await executeStep('4. Input Validation (POST /api/users with invalid payload -> 400)', async () => {
    const target = normalizeUrl(baseUrl, '/api/users');
    const invalidPayload = {
      email: 'not-an-email-at-all',
      // missing required 'name' field
      role: 'INVALID_ROLE'
    };
    const { status, body } = await requestJson(
      target,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(invalidPayload)
      },
      timeoutMs
    );
    if (status !== 400) {
      throw new Error(
        `Expected HTTP 400 validation error for bad payload, got ${status}. Body: ${JSON.stringify(body)}`
      );
    }
    return { status, errorCaught: true };
  });

  // 5. POST /api/users -> 201 Created (Create entity)
  await executeStep('5. Create Entity (POST /api/users -> 201)', async () => {
    const target = normalizeUrl(baseUrl, '/api/users');
    const payload = {
      email: crudUserEmail,
      name: 'Acceptance Standard User',
      role: 'USER',
      password: 'UserPass123!'
    };
    const { status, body } = await requestJson(
      target,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(payload)
      },
      timeoutMs
    );
    if (status !== 201) {
      throw new Error(`Expected HTTP 201 from /api/users, got ${status}. Body: ${JSON.stringify(body)}`);
    }
    const user = body?.data || body;
    const id = user?.id || user?._id;
    if (!id || typeof id !== 'string') {
      throw new Error(`Created entity is missing valid id/_id property: ${JSON.stringify(body)}`);
    }
    createdUserId = id;
    if (user.email !== crudUserEmail) {
      throw new Error(`Created entity email mismatch. Expected ${crudUserEmail}, got ${user.email}`);
    }
    return { status, createdUserId: id };
  });

  // 6. GET /api/users (List entities)
  await executeStep('6. List Entities (GET /api/users -> 200)', async () => {
    const target = normalizeUrl(baseUrl, '/api/users');
    const { status, body } = await requestJson(
      target,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` }
      },
      timeoutMs
    );
    if (status !== 200) {
      throw new Error(`Expected HTTP 200 from GET /api/users, got ${status}. Body: ${JSON.stringify(body)}`);
    }
    const list = Array.isArray(body) ? body : (body?.data || body?.items || []);
    if (!Array.isArray(list)) {
      throw new Error(`Expected array of entities from GET /api/users, got: ${JSON.stringify(body)}`);
    }
    const match = list.find((u: any) => (u.id || u._id) === createdUserId);
    if (!match) {
      throw new Error(
        `Created user with id ${createdUserId} was not found in GET /api/users list (${list.length} items)`
      );
    }
    return { status, count: list.length };
  });

  // 7. GET /api/users/:id (Get entity by ID)
  await executeStep('7. Get Entity By ID (GET /api/users/:id -> 200)', async () => {
    const target = normalizeUrl(baseUrl, `/api/users/${createdUserId}`);
    const { status, body } = await requestJson(
      target,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` }
      },
      timeoutMs
    );
    if (status !== 200) {
      throw new Error(`Expected HTTP 200 from GET /api/users/${createdUserId}, got ${status}. Body: ${JSON.stringify(body)}`);
    }
    const user = body?.data || body;
    const id = user?.id || user?._id;
    if (id !== createdUserId) {
      throw new Error(`ID mismatch. Expected ${createdUserId}, got ${id}`);
    }
    if (user.name !== 'Acceptance Standard User') {
      throw new Error(`User name mismatch. Expected 'Acceptance Standard User', got '${user.name}'`);
    }
    return { status, user };
  });

  // 8. PATCH /api/users/:id (Update entity)
  await executeStep('8. Update Entity (PATCH /api/users/:id -> 200)', async () => {
    const target = normalizeUrl(baseUrl, `/api/users/${createdUserId}`);
    const updatePayload = {
      name: 'Updated Acceptance Name'
    };
    const { status, body } = await requestJson(
      target,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(updatePayload)
      },
      timeoutMs
    );
    if (status !== 200) {
      throw new Error(`Expected HTTP 200 from PATCH /api/users/${createdUserId}, got ${status}. Body: ${JSON.stringify(body)}`);
    }
    const updated = body?.data || body;
    if (updated.name !== 'Updated Acceptance Name') {
      throw new Error(`Updated user name mismatch. Expected 'Updated Acceptance Name', got '${updated.name}'`);
    }
    return { status, updated };
  });

  // 9. DELETE /api/users/:id (Delete entity)
  await executeStep('9. Delete Entity (DELETE /api/users/:id -> 204/200)', async () => {
    const target = normalizeUrl(baseUrl, `/api/users/${createdUserId}`);
    const { status, body } = await requestJson(
      target,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` }
      },
      timeoutMs
    );
    if (status !== 204 && status !== 200) {
      throw new Error(`Expected HTTP 204 or 200 from DELETE /api/users/${createdUserId}, got ${status}. Body: ${JSON.stringify(body)}`);
    }
    return { status };
  });

  // 10. GET /api/users/:id post-delete -> 404
  await executeStep('10. Verify Deletion (GET /api/users/:id post-delete -> 404)', async () => {
    const target = normalizeUrl(baseUrl, `/api/users/${createdUserId}`);
    const { status, body } = await requestJson(
      target,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` }
      },
      timeoutMs
    );
    if (status !== 404) {
      throw new Error(`Expected HTTP 404 for deleted entity, got ${status}. Body: ${JSON.stringify(body)}`);
    }
    return { status, verifiedDeleted: true };
  });

  const total = steps.length;
  const passedCount = steps.filter((s) => s.passed).length;
  const failedCount = total - passedCount;
  const passed = failedCount === 0;
  const durationMs = Date.now() - startTime;

  const report: AcceptanceReport = {
    baseUrl,
    passed,
    total,
    passedCount,
    failedCount,
    durationMs,
    steps
  };

  if (!passed && throwOnError) {
    const failedSteps = steps
      .filter((s) => !s.passed)
      .map((s) => `${s.name}: ${s.error}`)
      .join('\n');
    throw new Error(`Acceptance suite failed with ${failedCount} errors:\n${failedSteps}`);
  }

  return report;
}
