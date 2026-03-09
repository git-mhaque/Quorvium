import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  createBoard: vi.fn(),
  fetchBoardsByOwner: vi.fn(),
  deleteBoard: vi.fn()
}));

const authState = vi.hoisted(() => ({
  user: {
    id: 'owner-1',
    name: 'Owner User',
    email: 'owner@example.com',
    isGuest: false
  },
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  isGoogleConfigured: true
}));

vi.mock('../lib/api', () => ({
  __esModule: true,
  createBoard: apiMocks.createBoard,
  fetchBoardsByOwner: apiMocks.fetchBoardsByOwner,
  deleteBoard: apiMocks.deleteBoard
}));

vi.mock('../state/auth', () => ({
  __esModule: true,
  useAuth: () => authState
}));

import { HomePage } from './HomePage';

const baseBoard = {
  id: 'board-1',
  name: 'Alpha Board',
  owner: authState.user,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
  notes: {}
};

describe('HomePage modals', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens the create board overlay and submits successfully', async () => {
    apiMocks.fetchBoardsByOwner
      .mockResolvedValueOnce([baseBoard])
      .mockResolvedValueOnce([baseBoard]);
    apiMocks.createBoard.mockResolvedValue({
      board: {
        ...baseBoard,
        id: 'board-2',
        name: 'Vision Sync'
      }
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await screen.findByText('Alpha Board');

    await userEvent.click(screen.getByRole('button', { name: /create board/i }));
    expect(screen.getByRole('dialog', { name: /create a new board/i })).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: /board name/i });
    await userEvent.clear(input);
    await userEvent.type(input, 'Vision Sync');

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(apiMocks.createBoard).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Vision Sync'
        })
      );
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /create a new board/i })).not.toBeInTheDocument();
    });
  });

  it('shows a delete confirmation overlay and deletes the board', async () => {
    apiMocks.fetchBoardsByOwner.mockResolvedValueOnce([baseBoard]).mockResolvedValueOnce([]);
    apiMocks.deleteBoard.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await screen.findByText('Alpha Board');

    const rowDeleteButton = screen.getAllByRole('button', { name: /^delete$/i })[0];
    await userEvent.click(rowDeleteButton);

    const deleteDialog = screen.getByRole('dialog', { name: /delete board/i });
    await userEvent.click(within(deleteDialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(apiMocks.deleteBoard).toHaveBeenCalledWith('board-1');
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /delete board/i })).not.toBeInTheDocument();
    });
  });
});
