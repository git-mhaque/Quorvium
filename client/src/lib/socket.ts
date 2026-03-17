import { io, Socket } from 'socket.io-client';

import { env } from '../env';
import type { Board, Participant, StickyNote } from '../types';

type Ack = (response: { ok: true } | { ok: false; error: string }) => void;

interface ServerToClientEvents {
  'board:state': (payload: { board: Board }) => void;
  'board:presence': (payload: { boardId: string; participants: number }) => void;
  'board:user_joined': (payload: {
    boardId: string;
    user: Participant;
    joinedAt: string;
  }) => void;
  'note:created': (payload: { boardId: string; note: StickyNote }) => void;
  'note:updated': (payload: { boardId: string; note: StickyNote }) => void;
  'note:deleted': (payload: { boardId: string; noteId: string }) => void;
}

interface ClientToServerEvents {
  'board:join': (payload: { boardId: string; user?: Participant }, ack?: Ack) => void;
  'note:create': (
    payload: {
      boardId: string;
      note: Omit<StickyNote, 'id' | 'createdAt' | 'updatedAt'>;
    },
    ack?: Ack
  ) => void;
  'note:update': (
    payload: {
      boardId: string;
      noteId: string;
      patch: Partial<Pick<StickyNote, 'body' | 'color' | 'x' | 'y'>>;
    },
    ack?: Ack
  ) => void;
  'note:delete': (payload: { boardId: string; noteId: string }, ack?: Ack) => void;
}

export type BoardSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createBoardSocket() {
  return io(env.apiBaseUrl, {
    transports: ['websocket'],
    path: '/socket.io',
    autoConnect: false
  }) as BoardSocket;
}
