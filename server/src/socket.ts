import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { z } from 'zod';

import { env } from './env.js';
import { boardStore } from './store/boardStore.js';

const participantSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    avatarUrl: z.string().url().optional()
  })
  .optional();

const joinSchema = z.object({
  boardId: z.string().uuid(),
  user: participantSchema
});

const createNoteSchema = z.object({
  boardId: z.string().uuid(),
  note: z.object({
    body: z.string().min(1),
    color: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    author: participantSchema
  })
});

const updateNoteSchema = z.object({
  boardId: z.string().uuid(),
  noteId: z.string().uuid(),
  patch: z
    .object({
      body: z.string().optional(),
      color: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional()
    })
    .refine((obj) => Object.keys(obj).length > 0, {
      message: 'Update payload cannot be empty.'
    })
});

const deleteNoteSchema = z.object({
  boardId: z.string().uuid(),
  noteId: z.string().uuid()
});

type Ack = (response: { ok: true } | { ok: false; error: string }) => void;

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigin,
      methods: ['GET', 'POST']
    }
  });

  const getRoomParticipantCount = (boardId: string) => io.sockets.adapter.rooms.get(boardId)?.size ?? 0;

  const emitBoardPresence = (boardId: string, overrideParticipants?: number) => {
    io.to(boardId).emit('board:presence', {
      boardId,
      participants:
        overrideParticipants === undefined
          ? getRoomParticipantCount(boardId)
          : Math.max(0, overrideParticipants)
    });
  };

  io.on('connection', (socket) => {
    socket.on('board:join', async (rawPayload, ack?: Ack) => {
      try {
        const payload = joinSchema.parse(rawPayload);
        const board = await boardStore.getBoard(payload.boardId);
        if (!board) {
          ack?.({ ok: false, error: 'Board not found' });
          return;
        }

        const currentBoardId = socket.data.boardId as string | undefined;
        if (currentBoardId && currentBoardId !== payload.boardId) {
          socket.leave(currentBoardId);
          emitBoardPresence(currentBoardId);
        }

        socket.join(payload.boardId);
        socket.data.boardId = payload.boardId;
        socket.emit('board:state', { board });
        if (payload.user) {
          socket.to(payload.boardId).emit('board:user_joined', {
            user: payload.user,
            boardId: payload.boardId,
            joinedAt: new Date().toISOString()
          });
        }
        emitBoardPresence(payload.boardId);
        ack?.({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to join board';
        ack?.({ ok: false, error: message });
      }
    });

    socket.on('disconnecting', () => {
      const boardId = socket.data.boardId as string | undefined;
      if (!boardId) {
        return;
      }
      const roomSize = getRoomParticipantCount(boardId);
      emitBoardPresence(boardId, roomSize - 1);
    });

    socket.on('note:create', async (rawPayload, ack?: Ack) => {
      try {
        const payload = createNoteSchema.parse(rawPayload);
        const note = await boardStore.createNote(payload);
        io.to(payload.boardId).emit('note:created', {
          boardId: payload.boardId,
          note
        });
        ack?.({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create note';
        ack?.({ ok: false, error: message });
      }
    });

    socket.on('note:update', async (rawPayload, ack?: Ack) => {
      try {
        const payload = updateNoteSchema.parse(rawPayload);
        const note = await boardStore.updateNote(payload);
        io.to(payload.boardId).emit('note:updated', {
          boardId: payload.boardId,
          note
        });
        ack?.({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update note';
        ack?.({ ok: false, error: message });
      }
    });

    socket.on('note:delete', async (rawPayload, ack?: Ack) => {
      try {
        const payload = deleteNoteSchema.parse(rawPayload);
        await boardStore.deleteNote(payload.boardId, payload.noteId);
        io.to(payload.boardId).emit('note:deleted', {
          boardId: payload.boardId,
          noteId: payload.noteId
        });
        ack?.({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete note';
        ack?.({ ok: false, error: message });
      }
    });
  });

  return io;
}
