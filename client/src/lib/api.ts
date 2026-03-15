import axios from 'axios';

import { env } from '../env';
import { Board, CreateBoardPayload } from '../types';

export const api = axios.create({
  baseURL: env.apiBaseUrl,
  withCredentials: false,
  timeout: 8000
});

export async function createBoard(payload: CreateBoardPayload) {
  const { data } = await api.post<{ board: Board; shareUrl: string }>('/api/boards', payload);
  return data;
}

export async function fetchBoard(boardId: string) {
  const { data } = await api.get<{ board: Board }>(`/api/boards/${boardId}`);
  return data.board;
}

export async function fetchBoardsByOwner(ownerId: string) {
  const { data } = await api.get<{ boards: Board[] }>('/api/boards', {
    params: { ownerId }
  });
  return data.boards;
}

export async function deleteBoard(boardId: string) {
  await api.delete(`/api/boards/${boardId}`);
}

export interface RenameBoardPayload {
  name: string;
  requesterId: string;
}

export async function renameBoard(boardId: string, payload: RenameBoardPayload) {
  const { data } = await api.patch<{ board: Board }>(`/api/boards/${boardId}`, payload);
  return data.board;
}

export async function verifyGoogleAuth(payload: GoogleAuthPayload) {
  const { data } = await api.post<{ user: AuthUserResponse; tokens?: GoogleAuthTokens }>(
    '/api/auth/verify',
    payload
  );
  return data;
}

export interface AuthUserResponse {
  id: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

export interface GoogleAuthTokens {
  hasRefreshToken: boolean;
}

export interface GoogleAuthPayload {
  code?: string;
  credential?: string;
}
