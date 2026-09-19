import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from './AuthContext';

interface LocationState { from?: string }

export function LoginPage() {
  const { login, error, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    const ok = await login(email, password);
    setSubmitting(false);
    if (ok) {
      const state = location.state as LocationState | null;
      navigate(state?.from ?? '/', { replace: true });     // return-to behaviour
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1>Sign in</h1>
      {status === 'authenticated' && <p role="status">Already signed in.</p>}
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      {error !== null && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
