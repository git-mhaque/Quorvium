import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Board, CreateBoardPayload } from '../types';
import {
  api,
  createBoard,
  deleteBoard,
  fetchBoard,
  fetchBoardsByOwner,
  renameBoard,
  verifyGoogleAuth
} from './api';

const baseBoard: Board = {
  id: 'board-1',
  name: 'Roadmap',
  owner: { id: 'owner-1', name: 'Owner' },
  createdAt: '2026-03-10T12:00:00.000Z',
  updatedAt: '2026-03-10T12:00:00.000Z',
  notes: {}
};

describe('api helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a board and returns the API payload', async () => {
    const payload: CreateBoardPayload = {
      name: 'Roadmap',
      owner: { id: 'owner-1', name: 'Owner' }
    };
    const response = {
      data: {
        board: baseBoard,
        shareUrl: 'https://example.com/boards/board-1'
      }
    };
    vi.spyOn(api, 'post').mockResolvedValue(response as never);

    await expect(createBoard(payload)).resolves.toEqual(response.data);
    expect(api.post).toHaveBeenCalledWith('/api/boards', payload);
  });

  it('fetches board by id', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { board: baseBoard } } as never);

    await expect(fetchBoard('board-1')).resolves.toEqual(baseBoard);
    expect(api.get).toHaveBeenCalledWith('/api/boards/board-1');
  });

  it('fetches boards by owner id', async () => {
    const boards: Board[] = [baseBoard];
    vi.spyOn(api, 'get').mockResolvedValue({ data: { boards } } as never);

    await expect(fetchBoardsByOwner('owner-1')).resolves.toEqual(boards);
    expect(api.get).toHaveBeenCalledWith('/api/boards', {
      params: { ownerId: 'owner-1' }
    });
  });

  it('deletes board by id', async () => {
    vi.spyOn(api, 'delete').mockResolvedValue({} as never);

    await expect(deleteBoard('board-1')).resolves.toBeUndefined();
    expect(api.delete).toHaveBeenCalledWith('/api/boards/board-1');
  });

  it('renames board and returns updated board', async () => {
    const board: Board = { ...baseBoard, name: 'Renamed' };
    const payload = { name: 'Renamed', requesterId: 'owner-1' };
    vi.spyOn(api, 'patch').mockResolvedValue({ data: { board } } as never);

    await expect(renameBoard('board-1', payload)).resolves.toEqual(board);
    expect(api.patch).toHaveBeenCalledWith('/api/boards/board-1', payload);
  });

  it('verifies Google auth', async () => {
    const response = {
      data: {
        user: { id: 'google-1', name: 'Google User' },
        tokens: { hasRefreshToken: true }
      }
    };
    vi.spyOn(api, 'post').mockResolvedValue(response as never);

    await expect(verifyGoogleAuth({ code: 'auth-code' })).resolves.toEqual(response.data);
    expect(api.post).toHaveBeenCalledWith('/api/auth/verify', { code: 'auth-code' });
  });
});
