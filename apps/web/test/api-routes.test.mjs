import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Client } from "pg";
import { NextRequest } from "next/server";

process.env.JWT_SECRET ||=
  "route-test-secret-that-is-at-least-thirty-two-characters-long";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://loop:loop_local_password@localhost:5432/loop";
process.env.DATABASE_URL = databaseUrl;
const request = (path, { method = "GET", token, body, headers = {} } = {}) =>
  new NextRequest(`http://loop.test${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });

test("protected membership, ingestion, Q&A, and scheduling routes execute with tenant-scoped credentials", async () => {
  const [{ POST: signup }, members, ingestions, schedule, qa] =
    await Promise.all([
      import("../app/api/auth/signup/route.ts"),
      import("../app/api/members/route.ts"),
      import("../app/api/ingestions/route.ts"),
      import("../app/api/report-schedule/route.ts"),
      import("../app/api/qa/retrieve/route.ts"),
    ]);
  const email = `route-test-${randomUUID()}@example.test`;
  let tenantId;
  let userId;
  try {
    const signupResponse = await signup(
      request("/api/auth/signup", {
        method: "POST",
        body: {
          email,
          password: "route-test-password",
          organizationName: "Route Test Workspace",
        },
      }),
    );
    assert.equal(signupResponse.status, 201);
    const signupBody = await signupResponse.json();
    const accessToken = signupBody.accessToken;
    tenantId = signupBody.user.tenantId;
    userId = signupBody.user.id;
    assert.ok(accessToken);

    assert.equal(
      (await members.GET(request("/api/members"))).status,
      401,
      "members requires an access token",
    );
    const membersResponse = await members.GET(
      request("/api/members", { token: accessToken }),
    );
    assert.equal(membersResponse.status, 200);
    assert.equal((await membersResponse.json()).members.length, 1);

    const ingestionResponse = await ingestions.POST(
      request("/api/ingestions", {
        method: "POST",
        token: accessToken,
        body: {
          filename: "feedback.csv",
          sizeBytes: 42,
          columnMapping: { text: "review" },
        },
      }),
    );
    assert.equal(ingestionResponse.status, 201);
    assert.ok((await ingestionResponse.json()).uploadUrl);

    const roleClient = new Client({ connectionString: databaseUrl });
    await roleClient.connect();
    try {
      await roleClient.query(
        "UPDATE memberships SET role = 'editor' WHERE tenant_id = $1 AND user_id = $2",
        [tenantId, userId],
      );
      assert.equal(
        (
          await ingestions.POST(
            request("/api/ingestions", {
              method: "POST",
              token: accessToken,
              body: { filename: "editor.csv", sizeBytes: 1 },
            }),
          )
        ).status,
        403,
        "only administrators can start CSV uploads",
      );
      await roleClient.query(
        "UPDATE memberships SET role = 'admin' WHERE tenant_id = $1 AND user_id = $2",
        [tenantId, userId],
      );
    } finally {
      await roleClient.end();
    }

    const scheduleResponse = await schedule.PUT(
      request("/api/report-schedule", {
        method: "PUT",
        token: accessToken,
        body: { cadence: "weekly", enabled: true },
      }),
    );
    assert.equal(scheduleResponse.status, 200);
    assert.equal(
      (
        await schedule.GET(
          request("/api/report-schedule", { token: accessToken }),
        )
      ).status,
      200,
    );

    assert.equal(
      (
        await qa.POST(
          request("/api/qa/retrieve", {
            method: "POST",
            body: { question: "test" },
          }),
        )
      ).status,
      401,
      "Q&A requires an access token",
    );
    assert.equal(
      (
        await qa.POST(
          request("/api/qa/retrieve", {
            method: "POST",
            token: accessToken,
            body: { question: "" },
          }),
        )
      ).status,
      400,
      "Q&A validates requests after authorization",
    );
  } finally {
    if (tenantId || userId) {
      const client = new Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        if (tenantId)
          await client.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
        if (userId)
          await client.query("DELETE FROM users WHERE id = $1", [userId]);
      } finally {
        await client.end();
      }
    }
  }
});
