import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';

import App from './App';
import { AuthProvider } from './state/auth';

describe('App', () => {
  it('renders the welcome headline', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByText(/Welcome to Quorvium/i)).toBeInTheDocument();
  });

  it('hides board creation until a user signs in', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.queryByRole('button', { name: /create board/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Use your Google account to create new boards/i)
    ).toBeInTheDocument();
  });

  it('renders the app build version in the footer', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByLabelText(/application version/i)).toHaveTextContent(/version/i);
  });
});
