import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

type LoginMode = 'success-with-code' | 'success-without-code' | 'error';

const apiMocks = vi.hoisted(() => ({
  createBoard: vi.fn(),
  fetchBoardsByOwner: vi.fn(),
  deleteBoard: vi.fn(),
  fetchBoard: vi.fn()
}));

const clipboardMocks = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn()
}));

const boardUrlMocks = vi.hoisted(() => ({
  buildBoardUrl: vi.fn((boardId: string) => `https://example.com/boards/${boardId}`)
}));

const loginState = vi.hoisted(() => ({
  mode: 'success-with-code' as LoginMode
}));

const authState = vi.hoisted(() => ({
  user: null as
    | null
    | {
        id: string;
        name: string;
        email?: string;
        avatarUrl?: string;
        isGuest?: boolean;
      },
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  isGoogleConfigured: true
}));

vi.mock('../lib/api', () => ({
  __esModule: true,
  createBoard: apiMocks.createBoard,
  fetchBoardsByOwner: apiMocks.fetchBoardsByOwner,
  deleteBoard: apiMocks.deleteBoard,
  fetchBoard: apiMocks.fetchBoard
}));

vi.mock('../lib/clipboard', () => ({
  __esModule: true,
  copyTextToClipboard: clipboardMocks.copyTextToClipboard
}));

vi.mock('../lib/boardUrl', () => ({
  __esModule: true,
  buildBoardUrl: boardUrlMocks.buildBoardUrl
}));

vi.mock('../state/auth', () => ({
  __esModule: true,
  useAuth: () => authState
}));

vi.mock('@react-oauth/google', () => ({
  __esModule: true,
  GoogleOAuthProvider: ({ children }: { children: ReactNode }) => children,
  useGoogleLogin: (config: {
    onSuccess: (response: { code?: string }) => void | Promise<void>;
    onError: () => void;
  }) => {
    return () => {
      if (loginState.mode === 'success-with-code') {
        void config.onSuccess({ code: 'auth-code' });
        return;
      }
      if (loginState.mode === 'success-without-code') {
        void config.onSuccess({});
        return;
      }
      config.onError();
    };
  }
}));

import { HomePage } from './HomePage';

function BoardRoute() {
  const params = useParams();
  return <div data-testid="board-route">{params.boardId}</div>;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/boards/:boardId" element={<BoardRoute />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HomePage behavior', () => {
  afterEach(() => {
    vi.clearAllMocks();
    loginState.mode = 'success-with-code';
    authState.user = null;
    authState.isGoogleConfigured = true;
    apiMocks.fetchBoardsByOwner.mockResolvedValue([]);
    apiMocks.fetchBoard.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Joined Board',
      owner: {
        id: 'owner-1',
        name: 'Owner User'
      },
      createdAt: '2026-03-10T12:00:00.000Z',
      updatedAt: '2026-03-10T12:00:00.000Z',
      notes: {}
    });
  });

  it('shows config hint when Google client is not configured', async () => {
    authState.isGoogleConfigured = false;
    apiMocks.fetchBoardsByOwner.mockResolvedValue([]);

    renderHome();

    expect(
      await screen.findByText('VITE_GOOGLE_CLIENT_ID', {
        selector: 'code'
      })
    ).toBeInTheDocument();
  });

  it('shows join validation for empty value and navigates for valid URL', async () => {
    apiMocks.fetchBoardsByOwner.mockResolvedValue([]);

    renderHome();

    await userEvent.click(screen.getByRole('button', { name: /join board/i }));
    expect(await screen.findByRole('dialog', { name: /can'?t open board/i })).toBeInTheDocument();
    expect(screen.getByText(/Paste a board URL or ID to join/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /can'?t open board/i })).not.toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/https:\/\/quorvium\.app\/boards/i);
    await userEvent.type(input, 'https://quorvium.app/boards/11111111-1111-1111-1111-111111111111?x=1');
    await userEvent.click(screen.getByRole('button', { name: /join board/i }));

    expect(await screen.findByTestId('board-route')).toHaveTextContent(
      '11111111-1111-1111-1111-111111111111'
    );
  });

  it('shows overlay for invalid board id format', async () => {
    apiMocks.fetchBoardsByOwner.mockResolvedValue([]);
    renderHome();

    const input = screen.getByPlaceholderText(/https:\/\/quorvium\.app\/boards/i);
    await userEvent.type(input, 'https://quorvium.app/boards/not-a-valid-id');
    await userEvent.click(screen.getByRole('button', { name: /join board/i }));

    expect(await screen.findByRole('dialog', { name: /can'?t open board/i })).toBeInTheDocument();
    expect(screen.getByText(/board id looks invalid/i)).toBeInTheDocument();
    expect(apiMocks.fetchBoard).not.toHaveBeenCalled();
  });

  it('shows overlay when board does not exist', async () => {
    apiMocks.fetchBoardsByOwner.mockResolvedValue([]);
    apiMocks.fetchBoard.mockRejectedValue({
      response: {
        status: 404
      }
    });

    renderHome();

    const input = screen.getByPlaceholderText(/https:\/\/quorvium\.app\/boards/i);
    await userEvent.type(input, 'https://quorvium.app/boards/11111111-1111-1111-1111-111111111111');
    await userEvent.click(screen.getByRole('button', { name: /join board/i }));

    expect(await screen.findByRole('dialog', { name: /can'?t open board/i })).toBeInTheDocument();
    expect(screen.getByText(/Board not found/i)).toBeInTheDocument();
  });

  it('handles Google sign-in failures from callback and explicit onError', async () => {
    authState.signInWithGoogle.mockRejectedValue(new Error('OAuth failed'));
    apiMocks.fetchBoardsByOwner.mockResolvedValue([]);

    renderHome();

    loginState.mode = 'success-with-code';
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(await screen.findByText('OAuth failed')).toBeInTheDocument();

    loginState.mode = 'success-without-code';
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(await screen.findByText('Google sign-in failed. Try again.')).toBeInTheDocument();

    loginState.mode = 'error';
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
    await waitFor(() => {
      expect(screen.getByText('Google sign-in failed. Try again.')).toBeInTheDocument();
    });
  });

  it('copies board link for signed-in user board row', async () => {
    authState.user = {
      id: 'owner-1',
      name: 'Owner User',
      email: 'owner@example.com',
      isGuest: false
    };
    apiMocks.fetchBoardsByOwner.mockResolvedValue([
      {
        id: 'board-1',
        name: 'Alpha Board',
        owner: authState.user,
        createdAt: '2026-03-10T12:00:00.000Z',
        updatedAt: '2026-03-10T12:00:00.000Z',
        notes: {}
      }
    ]);
    clipboardMocks.copyTextToClipboard.mockResolvedValue(undefined);

    renderHome();

    await screen.findByText('Alpha Board');
    await userEvent.click(screen.getByRole('button', { name: /copy link/i }));

    await waitFor(() => {
      expect(boardUrlMocks.buildBoardUrl).toHaveBeenCalledWith('board-1');
      expect(clipboardMocks.copyTextToClipboard).toHaveBeenCalledWith(
        'https://example.com/boards/board-1'
      );
      expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument();
    });
  });
});
