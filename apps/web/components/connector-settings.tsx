"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/auth-session";
import { EmptyState } from "@/components/ui/empty-state";

type Connector = {
  id: string;
  type: string;
  status: string;
  subdomain: string | null;
  config?: { name?: string } | null;
  last_synced_at: string | null;
  last_error: string | null;
  webhookUrl?: string;
  webhookSecret?: string;
};
export function ConnectorSettings() {
  const { token, role } = useSession();
  const [subdomain, setSubdomain] = useState("");
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [message, setMessage] = useState("");
  const headers = () => ({
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
  });
  const load = async () => {
    if (!token) return;
    const res = await fetch("/api/connectors", { headers: headers() });
    const body = await res.json();
    if (res.ok) setConnectors(body.connectors);
    else setMessage(body.error);
  };
  useEffect(() => {
    void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const connect = async () => {
    setMessage("");
    const res = await fetch("/api/connectors/zendesk/connect", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ subdomain }),
    });
    const body = await res.json();
    if (!res.ok) return setMessage(body.error);
    window.location.assign(body.authorizationUrl);
  };
  const createWebhook = async (type: "typeform" | "generic_webhook") => {
    const res = await fetch("/api/connectors/webhooks", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ type }),
    });
    const body = await res.json();
    setMessage(
      res.ok
        ? `${type === "typeform" ? "Typeform" : "Generic webhook"} endpoint created.`
        : body.error,
    );
    await load();
  };
  const sync = async (id: string) => {
    const res = await fetch(`/api/connectors/${id}/sync`, {
      method: "POST",
      headers: headers(),
    });
    const body = await res.json();
    setMessage(
      res.ok
        ? `Sync complete: ${body.imported} ticket(s) processed.`
        : body.error,
    );
    await load();
  };
  const disconnect = async (id: string) => {
    const res = await fetch(`/api/connectors/${id}`, {
      method: "DELETE",
      headers: headers(),
    });
    const body = await res.json();
    setMessage(res.ok ? "Zendesk disconnected." : body.error);
    await load();
  };
  const canManage = role === "admin";
  const canSync = role === "admin" || role === "editor";
  return (
    <section className="w-full max-w-2xl rounded-xl border bg-white p-6 text-left shadow-sm">
      <h2 className="text-xl font-semibold">Connectors</h2>
      <p className="mt-1 text-sm text-slate-600">
        Connect support tickets or configure signed feedback webhooks. OAuth
        tokens stay in AWS Secrets Manager.
      </p>
      {canManage && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              aria-label="Zendesk subdomain"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="your-company"
              className="rounded-md border px-3 py-2 text-sm"
            />
            <Button onClick={connect} disabled={!token || !subdomain}>
              Connect Zendesk
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => createWebhook("typeform")} disabled={!token}>
              Create Typeform webhook
            </Button>
            <Button
              onClick={() => createWebhook("generic_webhook")}
              disabled={!token}
            >
              Create generic webhook
            </Button>
          </div>
        </>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-slate-700">
          {message}
        </p>
      )}
      <div className="mt-5 space-y-3">
        {!connectors.length ? (
          <EmptyState
            title="Connect your first feedback source"
            description="Start with Zendesk, Typeform, or a generic signed webhook. Once feedback arrives, LOOP will classify it and surface insights."
          />
        ) : (
          connectors.map((connector) => (
            <article key={connector.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {connector.type === "zendesk"
                      ? `${connector.subdomain}.zendesk.com`
                      : connector.type === "typeform"
                        ? "Typeform webhook"
                        : "Generic webhook"}{" "}
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize">
                      {connector.status}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Last sync:{" "}
                    {connector.last_synced_at
                      ? new Date(connector.last_synced_at).toLocaleString()
                      : "Not yet received"}
                  </p>
                  {connector.last_error && (
                    <p className="mt-2 text-sm text-red-700">
                      {connector.last_error}
                    </p>
                  )}
                  {connector.webhookUrl && (
                    <details className="mt-3 text-xs text-slate-600">
                      <summary className="cursor-pointer font-medium">
                        Webhook setup
                      </summary>
                      <p className="mt-1 break-all">
                        URL: {connector.webhookUrl}
                      </p>
                      <p className="mt-1 break-all">
                        Signing secret: {connector.webhookSecret}
                      </p>
                    </details>
                  )}
                </div>
                <div className="flex gap-2">
                  {connector.type === "zendesk" && canSync && (
                    <Button
                      onClick={() => sync(connector.id)}
                      disabled={connector.status !== "connected"}
                    >
                      Sync now
                    </Button>
                  )}
                  {canManage && (
                    <Button onClick={() => disconnect(connector.id)}>
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
