import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Client } from "pg";
import { NextRequest } from "next/server";

process.env.JWT_SECRET ||= "route-test-secret-that-is-at-least-thirty-two-characters-long";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://loop:loop_local_password@localhost:5432/loop";
process.env.DATABASE_URL = databaseUrl;
delete process.env.BLOB_READ_WRITE_TOKEN;
const request = (path, { method = "GET", token, body } = {}) =>
  new NextRequest(`http://loop.test${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("analytics can be scoped to one uploaded file and deleting the file removes its analytics", async () => {
  const [{ POST: signup }, ingestions, ingestion, trend, channels, themes] = await Promise.all([
    import("../app/api/auth/signup/route.ts"),
    import("../app/api/ingestions/route.ts"),
    import("../app/api/ingestions/[jobId]/route.ts"),
    import("../app/api/analytics/trend/route.ts"),
    import("../app/api/analytics/channels/route.ts"),
    import("../app/api/analytics/themes/route.ts"),
  ]);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  let tenantId;
  let userId;
  try {
    const signupResponse = await signup(request("/api/auth/signup", { method: "POST", body: { email: `dataset-test-${randomUUID()}@example.test`, password: "route-test-password", organizationName: "Dataset Test" } }));
    assert.equal(signupResponse.status, 201);
    const { accessToken, user } = await signupResponse.json();
    tenantId = user.tenantId;
    userId = user.id;

    const createJob = async (filename) => {
      const response = await ingestions.POST(request("/api/ingestions", { method: "POST", token: accessToken, body: { filename, sizeBytes: 100 } }));
      assert.equal(response.status, 201);
      return (await response.json()).job.id;
    };
    const jobA = await createJob("a.csv");
    const jobB = await createJob("b.csv");

    const theme = (await client.query("INSERT INTO themes (tenant_id, name, normalized_name, centroid) VALUES ($1, 'Billing', 'billing', array_fill(0, ARRAY[1536])::vector) RETURNING id", [tenantId])).rows[0].id;
    const addFeedback = async (jobId, source, sentiment, count) => {
      for (let i = 0; i < count; i++) {
        const id = (await client.query("INSERT INTO feedback_items (tenant_id, ingestion_job_id, source, raw_text, sentiment) VALUES ($1, $2, $3, $4, $5) RETURNING id", [tenantId, jobId, source, `text ${randomUUID()}`, sentiment])).rows[0].id;
        await client.query("INSERT INTO feedback_item_themes (feedback_item_id, theme_id, tenant_id) VALUES ($1, $2, $3)", [id, theme, tenantId]);
      }
    };
    await addFeedback(jobA, "csv-a", "positive", 2);
    await addFeedback(jobB, "csv-b", "negative", 3);

    const get = async (route, path, jobId) => {
      const response = await route.GET(request(`${path}${jobId ? `?jobId=${jobId}` : ""}`, { token: accessToken }));
      assert.equal(response.status, 200);
      return (await response.json()).data;
    };
    const total = (rows) => rows.reduce((sum, row) => sum + row.total_count, 0);

    assert.equal(total(await get(trend, "/api/analytics/trend")), 5, "all files");
    assert.equal(total(await get(trend, "/api/analytics/trend", jobA)), 2, "file A only");
    const bTrend = await get(trend, "/api/analytics/trend", jobB);
    assert.equal(total(bTrend), 3);
    assert.equal(bTrend[0].negative_count, 3);
    assert.deepEqual((await get(channels, "/api/analytics/channels", jobA)).map((row) => row.source), ["csv-a"]);
    assert.equal((await get(themes, "/api/analytics/themes", jobB))[0].total_count, 3);
    assert.equal((await get(themes, "/api/analytics/themes"))[0].total_count, 5);
    assert.equal((await trend.GET(request("/api/analytics/trend?jobId=not-a-uuid", { token: accessToken }))).status, 400);

    const deleted = await ingestion.DELETE(request(`/api/ingestions/${jobB}`, { method: "DELETE", token: accessToken }), { params: Promise.resolve({ jobId: jobB }) });
    assert.equal(deleted.status, 200);

    assert.equal(total(await get(trend, "/api/analytics/trend")), 2, "file B analytics removed from all-files view");
    assert.equal(total(await get(trend, "/api/analytics/trend", jobB)), 0);
    assert.deepEqual((await get(channels, "/api/analytics/channels")).map((row) => row.source), ["csv-a"]);
    assert.equal((await get(themes, "/api/analytics/themes"))[0].total_count, 2);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM feedback_items WHERE ingestion_job_id = $1", [jobB])).rows[0].n, 0);

    const deletedA = await ingestion.DELETE(request(`/api/ingestions/${jobA}`, { method: "DELETE", token: accessToken }), { params: Promise.resolve({ jobId: jobA }) });
    assert.equal(deletedA.status, 200);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM themes WHERE tenant_id = $1", [tenantId])).rows[0].n, 0, "empty themes are cleaned up");
    assert.equal((await get(themes, "/api/analytics/themes")).length, 0);
  } finally {
    if (tenantId) await client.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
    if (userId) await client.query("DELETE FROM users WHERE id = $1", [userId]);
    await client.end();
  }
});
