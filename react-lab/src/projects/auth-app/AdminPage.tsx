// Project 5 — a role-gated page that reads from a protected endpoint.
import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { tokenStore } from '../../auth/tokenStore';

interface Member {
  id: string;
  name: string;
  email: string;
  roles: string[];
}

export function AdminPage() {
  const { session } = useAuth();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const token = tokenStore.read()?.token ?? session?.token;

    fetch('/api/admin/users', { signal: controller.signal, headers: token === undefined ? {} : { authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (response.status === 403) throw new Error('Your account does not have admin access.');
        if (!response.ok) throw new Error(`Could not load members (${response.status}).`);
        return (await response.json()) as Member[];
      })
      .then(setMembers)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Could not load members.');
      });

    return () => controller.abort();
  }, [session]);

  return (
    <section>
      <h1>Team</h1>
      {error !== null && <p role="alert">{error}</p>}
      {error === null && members === null && <p role="status">Loading members…</p>}
      {members !== null && (
        <ul>
          {members.map((member) => (
            <li key={member.id}>{member.name} — {member.email} ({member.roles.join(', ')})</li>
          ))}
        </ul>
      )}
    </section>
  );
}
