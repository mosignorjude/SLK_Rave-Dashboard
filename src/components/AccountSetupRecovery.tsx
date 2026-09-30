import { useState } from 'react';
import AppFooter from './AppFooter';

type Props = {
  fullName: string;
  email: string;
  busy: boolean;
  submit: (profile: { fullName: string; username: string }) => void;
  logout: () => void;
};

export default function AccountSetupRecovery({ fullName: initialName, email, busy, submit, logout }: Props) {
  const [fullName, setFullName] = useState(initialName);
  const [username, setUsername] = useState('');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit({ fullName: fullName.trim(), username: username.trim().toLowerCase() });
  }

  return (
    <div className="auth-shell recovery-shell">
      <div className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="eyebrow"><span className="pulse" /> SECURE EVENT WORKSPACE</div>
          <h1>Finish setting up your account.</h1>
          <p>Add the profile details needed to complete setup. If your email still needs verification, you’ll be prompted to verify it before finance data loads.</p>
          <form onSubmit={handleSubmit} className="auth-form">
            <label>Full name<input value={fullName} onChange={event => setFullName(event.target.value)} minLength={2} maxLength={100} required /></label>
            <label>Username<input value={username} onChange={event => setUsername(event.target.value)} minLength={3} maxLength={24} pattern="[a-zA-Z0-9_-]{3,24}" autoCapitalize="none" autoCorrect="off" required /></label>
            <label>Email address<input type="email" value={email} readOnly /></label>
            <button disabled={busy} className="btn primary auth-submit">{busy ? 'Please wait…' : 'Complete account setup'}</button>
          </form>
          <div className="auth-switch">Wrong account? <button type="button" className="auth-link" onClick={logout}>Sign out</button></div>
          <AppFooter />
        </div>
      </div>
    </div>
  );
}
