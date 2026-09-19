// Project 5 — registration with useActionState: a form action, pending state and field errors.
import { useActionState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import type { Session } from '../../auth/tokenStore';

interface FormState {
  formError: string | null;
  fieldErrors: { name?: string; email?: string; password?: string };
}

const initialState: FormState = { formError: null, fieldErrors: {} };

interface ApiErrorBody {
  message?: string;
  errors?: { name?: string; email?: string; password?: string };
}

export function RegisterPage() {
  const { adoptSession } = useAuth();
  const navigate = useNavigate();

  const [state, submit, isPending] = useActionState(async (_previous: FormState, formData: FormData): Promise<FormState> => {
    const body = {
      name: String(formData.get('name') ?? ''),
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
    };

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.status === 201) {
        const session = (await response.json()) as Session;
        adoptSession(session);                       // the registration response *is* a login
        void navigate('/', { replace: true });
        return initialState;
      }

      if (response.status === 409) {
        return { formError: null, fieldErrors: { email: 'That email is already registered. Sign in instead?' } };
      }

      const errorBody = (await response.json().catch(() => ({}))) as ApiErrorBody;
      return {
        formError: errorBody.message ?? `Registration failed (${response.status}).`,
        fieldErrors: errorBody.errors ?? {},
      };
    } catch {
      return { formError: 'Network error — check your connection and try again.', fieldErrors: {} };
    }
  }, initialState);

  return (
    <form>
      <h1>Create an account</h1>

      {state.formError !== null && <p role="alert">{state.formError}</p>}

      <label htmlFor="name">Name</label>
      <input id="name" name="name" autoComplete="name" aria-invalid={state.fieldErrors.name !== undefined} />
      {state.fieldErrors.name !== undefined && <p role="alert">{state.fieldErrors.name}</p>}

      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" aria-invalid={state.fieldErrors.email !== undefined} />
      {state.fieldErrors.email !== undefined && <p role="alert">{state.fieldErrors.email}</p>}

      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="new-password" />
      {state.fieldErrors.password !== undefined && <p role="alert">{state.fieldErrors.password}</p>}

      <button type="submit" formAction={submit} disabled={isPending}>
        {isPending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
