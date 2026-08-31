import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { MsalProvider, useIsAuthenticated, useMsal } from '@azure/msal-react';
import { EventType, type AuthenticationResult } from '@azure/msal-browser';
import { App } from './App.js';
import { store } from './app/store.js';
import { authMode, loginRequest } from './auth/authConfig.js';
import { getMsalInstance, setActiveMsalInstance } from './auth/tokenProvider.js';
import './styles/app.css';

/**
 * Dev mode: there is no identity provider, so "signing in" is just a local flag
 * and the API trusts the X-Dev-User header. Kept deliberately separate from the
 * MSAL path so no production build can reach it.
 */
function DevAuthApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem('devSignedIn') === 'true',
  );

  return (
    <App
      isAuthenticated={isAuthenticated}
      onSignIn={() => {
        sessionStorage.setItem('devSignedIn', 'true');
        setIsAuthenticated(true);
      }}
      onSignOut={() => {
        sessionStorage.removeItem('devSignedIn');
        setIsAuthenticated(false);
      }}
    />
  );
}

function EntraAuthApp() {
  const { instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    setActiveMsalInstance(instance);
  }, [instance]);

  return (
    <App
      isAuthenticated={isAuthenticated}
      onSignIn={() => void instance.loginRedirect(loginRequest)}
      onSignOut={() => void instance.logoutRedirect()}
    />
  );
}

function mount(children: React.ReactNode) {
  const container = document.getElementById('root');
  if (!container) throw new Error('Root element is missing from index.html');

  createRoot(container).render(
    <StrictMode>
      <Provider store={store}>
        <BrowserRouter>{children}</BrowserRouter>
      </Provider>
    </StrictMode>,
  );
}

async function bootstrap() {
  if (authMode === 'dev') {
    mount(<DevAuthApp />);
    return;
  }

  const instance = getMsalInstance();
  // MSAL must finish initialising and consume any redirect response before
  // React renders, or the first paint flashes the login screen after a return
  // trip from Microsoft.
  await instance.initialize();
  const redirectResult = await instance.handleRedirectPromise();

  const account = redirectResult?.account ?? instance.getAllAccounts()[0];
  if (account) instance.setActiveAccount(account);

  instance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
      instance.setActiveAccount((event.payload as AuthenticationResult).account);
    }
  });

  setActiveMsalInstance(instance);

  mount(
    <MsalProvider instance={instance}>
      <EntraAuthApp />
    </MsalProvider>,
  );
}

void bootstrap();
