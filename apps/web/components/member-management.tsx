"use client";

import { useEffect, useState } from "react";
import { useSession, type Role } from "@/components/auth-session";
import { useNotification } from "@/components/notification";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";

type Member = {
  id: string;
  email: string;
  display_name: string | null;
  role: Role;
  status: "active" | "pending" | "revoked";
};
type Confirmation = {
  title: string;
  description: string;
  label: string;
  action: () => Promise<void>;
};

export function MemberManagement() {
  const { token, role } = useSession();
  const { notify } = useNotification();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("viewer");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [loading, setLoading] = useState(true);
  const headers = {
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  const load = async () => {
    if (!token || role !== "admin") return;
    setLoading(true);
    try {
      const response = await fetch("/api/members", { headers });
      const body = (await response.json()) as {
        members?: Member[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error ?? "Unable to load members.");
      setMembers(body.members ?? []);
    } catch (error) {
      notify(
        "failure",
        error instanceof Error ? error.message : "Unable to load members.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, role]);
  if (role !== "admin") return null;
  const invite = async () => {
    const response = await fetch("/api/members", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, role: inviteRole }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok)
      return notify("failure", body.error ?? "Unable to deliver invitation.");
    setEmail("");
    notify("success", "Secure invitation email sent.");
    await load();
  };
  const performRoleUpdate = async (member: Member, nextRole: Role) => {
    const response = await fetch(`/api/members/${member.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        role: nextRole,
        confirmAdminDemotion: member.role === "admin" && nextRole !== "admin",
      }),
    });
    const body = (await response.json()) as { error?: string };
    notify(
      response.ok ? "success" : "failure",
      response.ok ? "Role updated." : (body.error ?? "Unable to update role."),
    );
    await load();
  };
  const updateRole = (member: Member, nextRole: Role) => {
    if (member.role === "admin" && nextRole !== "admin") {
      setConfirmation({
        title: "Demote administrator?",
        description: `${member.email} will lose user-management access.`,
        label: "Demote admin",
        action: () => performRoleUpdate(member, nextRole),
      });
    } else void performRoleUpdate(member, nextRole);
  };
  const revoke = (member: Member) =>
    setConfirmation({
      title: "Revoke workspace access?",
      description: `${member.email} will no longer be able to access this workspace.`,
      label: "Revoke access",
      action: async () => {
        const response = await fetch(`/api/members/${member.id}`, {
          method: "DELETE",
          headers,
        });
        const body = (await response.json()) as { error?: string };
        notify(
          response.ok ? "success" : "failure",
          response.ok
            ? "Member access revoked."
            : (body.error ?? "Unable to revoke access."),
        );
        await load();
      },
    });
  return (
    <section className="w-full max-w-6xl rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">User management</h2>
      <p className="mt-1 text-sm text-slate-600">
        Invite additional admins, editors, and viewers by secure email.
        Invitation links are never exposed in the workspace.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Input
          aria-label="Invite email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="colleague@company.com"
          className="min-w-64 rounded-md border px-3 py-2 text-sm"
        />
        <Select
          aria-label="Invite role"
          value={inviteRole}
          onChange={(event) => setInviteRole(event.target.value as Role)}
          className="rounded-md border px-3 py-2 text-sm"
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </Select>
        <Button onClick={() => void invite()} disabled={!email}>
          Send invitation
        </Button>
      </div>
      <div className="mt-5">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Member</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Role</TableHeaderCell>
              <TableHeaderCell>Access</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            ) : (
              members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <p className="font-medium">
                      {member.display_name ?? member.email}
                    </p>
                    <p className="text-slate-500">{member.email}</p>
                  </TableCell>
                  <TableCell className="capitalize">{member.status}</TableCell>
                  <TableCell>
                    <Select
                      aria-label={`${member.email} role`}
                      value={member.role}
                      onChange={(event) =>
                        updateRole(member, event.target.value as Role)
                      }
                      disabled={member.status !== "active"}
                      className="rounded border px-2 py-1"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      onClick={() => revoke(member)}
                      disabled={member.status !== "active"}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {confirmation && (
        <ConfirmDialog
          open
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.label}
          onClose={() => setConfirmation(null)}
          onConfirm={confirmation.action}
        />
      )}
    </section>
  );
}
