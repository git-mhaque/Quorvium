import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { env } from '../env';
import type { InternalAxiosRequestConfig } from 'axios';

const apiMocks = vi.hoisted(() => ({
  verifyGoogleAuth: vi.fn()
}));

vi.mock('../lib/api', () => ({
  __esModule: true,
  verifyGoogleAuth: apiMocks.verifyGoogleAuth
}));

import { AuthProvider, useAuth } from './auth';

function AuthHarness() {
  const auth = useAuth();
  const [error, setError] = useState<string>('');

  return (
    <div>
      <div data-testid="name">{auth.user?.name ?? 'none'}</div>
      <div data-testid="is-google-configured">{String(auth.isGoogleConfigured)}</div>
      <button
        type="button"
        onClick={() => {
          auth.signInAsGuest('   ');
        }}
      >
        Sign guest
      </button>
      <button
        type="button"
        onClick={() => {
          void auth
            .signInWithGoogle({ code: 'code-123' })
            .then(() => setError(''))
            .catch((err: Error) => setError(err.message));
        }}
      >
        Sign google
      </button>
      <button
        type="button"
        onClick={() => {
          auth.signOut();
        }}
      >
        Sign out
      </button>
      <div data-testid="error">{error}</div>
    </div>
  );
}

function WithoutProvider() {
  useAuth();
  return null;
}

describe('AuthProvider / useAuth', () => {
  const originalGoogleClientId = env.googleClientId;
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    localStorage.clear();
    env.googleClientId = originalGoogleClientId;
    vi.stubGlobal('crypto', originalCrypto);
    apiMocks.verifyGoogleAuth.mockReset();
    vi.restoreAllMocks();
  });

  it('throws when useAuth is used without provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const suppressWindowError = (event: Event) => event.preventDefault();
    window.addEventListener('error', suppressWindowError);
    expect(() => render(<WithoutProvider />)).toThrow('useAuth must be used within AuthProvider');
    window.removeEventListener('error', suppressWindowError);
  });

  it('supports guest sign-in and sign-out, and persists state', async () => {
    env.googleClientId = 'google-client-id.apps.googleusercontent.com';

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    );

    expect(screen.getByTestId('is-google-configured')).toHaveTextContent('true');
    expect(screen.getByTestId('name')).toHaveTextContent('none');

    await userEvent.click(screen.getByRole('button', { name: /sign guest/i }));

    await waitFor(() => {
      expect(screen.getByTestId('name')).toHaveTextContent('Guest');
    });
    expect(localStorage.getItem('quorvium:user')).toContain('"name":"Guest"');

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => {
      expect(screen.getByTestId('name')).toHaveTextContent('none');
    });
    expect(localStorage.getItem('quorvium:user')).toBeNull();
  });

  it('falls back to generated guest id when crypto.randomUUID is unavailable', async () => {
    vi.stubGlobal('crypto', {} as Crypto);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /sign guest/i }));

    const raw = localStorage.getItem('quorvium:user');
    expect(raw).not.toBeNull();
    expect(raw).toContain('"id":"guest-4fzzzxjy"');
    randomSpy.mockRestore();
  });

  it('loads null user when local storage contains malformed JSON', () => {
    localStorage.setItem('quorvium:user', '{not-json');

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    );

    expect(screen.getByTestId('name')).toHaveTextContent('none');
  });

  it('signs in with Google profile on successful verify', async () => {
    apiMocks.verifyGoogleAuth.mockResolvedValue({
      user: {
        id: 'google-1',
        name: 'Google User',
        email: 'google@example.com',
        avatarUrl: 'https://example.com/avatar.png'
      }
    });

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /sign google/i }));

    await waitFor(() => {
      expect(screen.getByTestId('name')).toHaveTextContent('Google User');
    });
    expect(apiMocks.verifyGoogleAuth).toHaveBeenCalledWith({ code: 'code-123' });
  });

  it('returns friendly error for 501 Google OAuth configuration issue', async () => {
    const axiosError = new axios.AxiosError(
      'Not configured',
      undefined,
      undefined,
      undefined,
      {
        status: 501,
        statusText: 'Not Implemented',
        headers: {},
        config: {
          headers: new axios.AxiosHeaders()
        } as InternalAxiosRequestConfig,
        data: {}
      }
    );
    apiMocks.verifyGoogleAuth.mockRejectedValue(axiosError);

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /sign google/i }));

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent(
        'Server is not configured for Google OAuth. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
      );
    });
  });

  it('surfaces non-501 Google auth errors unchanged', async () => {
    apiMocks.verifyGoogleAuth.mockRejectedValue(new Error('google verify failed'));

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /sign google/i }));

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('google verify failed');
    });
  });
});
