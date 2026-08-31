import { authMode, devUserEmail } from './authConfig.js';

interface LoginScreenProps {
  onSignIn: () => void;
  error?: string | undefined;
  isBusy?: boolean;
}

export function LoginScreen({ onSignIn, error, isBusy = false }: LoginScreenProps) {
  return (
    <div className="login">
      <div className="login__card">
        <h1>Admin Console</h1>
        <p>
          {authMode === 'entra'
            ? 'Sign in with your Microsoft work account to manage tenants and users.'
            : 'Development mode: sign-in is simulated and no Microsoft account is required.'}
        </p>

        {error && (
          <div className="banner banner--error" role="alert" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button type="button" className="primary" onClick={onSignIn} disabled={isBusy}>
          {isBusy ? 'Signing in...' : authMode === 'entra' ? 'Sign in with Microsoft' : 'Continue'}
        </button>

        {authMode === 'dev' && (
          <p className="mono muted" style={{ marginTop: 16, marginBottom: 0 }}>
            {devUserEmail}
          </p>
        )}
      </div>
    </div>
  );
}
