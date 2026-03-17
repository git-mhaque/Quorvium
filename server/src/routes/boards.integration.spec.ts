import cors from 'cors';
import express from 'express';
import { mkdtempSync, rmSync } from 'fs';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

// Set up isolated storage for the board store before loading application modules.
const tempDataDir = mkdtempSync(join(tmpdir(), 'quorvium-int-'));
process.env.DATA_DIR = tempDataDir;
process.env.CLIENT_ORIGIN = 'http://localhost:5173';

const { boardsRouter } = await import('../routes/boards.js');
const { authRouter } = await import('../routes/auth.js');
const { createSocketServer } = await import('../socket.js');
const { boardStore } = await import('../store/boardStore.js');
const { io: createClient } = await import('socket.io-client');

describe('Boards API and socket collaboration', () => {
  const app = express();
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN,
      credentials: true
    })
  );
  app.use(express.json());
  app.use('/api/boards', boardsRouter);
  app.use('/api/auth', authRouter);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid request payload', details: err.flatten() });
    }
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  });

  const agent = request(app);

  let httpServer: ReturnType<typeof createServer>;
  let port: number;

  beforeAll(async () => {
    httpServer = createServer(app);
    createSocketServer(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    rmSync(tempDataDir, { recursive: true, force: true });
  });

  it('creates a board and syncs notes across participants', async () => {
    const createResponse = await agent
      .post('/api/boards')
      .send({
        name: 'Integration Board',
        owner: { id: 'auth-user', name: 'Auth User', email: 'auth@example.com' }
      })
      .expect(201);

    const { board, shareUrl } = createResponse.body;
    expect(board).toBeDefined();
    expect(board.id).toMatch(
      /^[0-9a-fA-F-]{36}$/
    );
    expect(board.owner).toMatchObject({
      id: 'auth-user',
      name: 'Auth User',
      email: 'auth@example.com'
    });
    expect(shareUrl).toContain(board.id);

    const clientA = createClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true
    });
    const clientB = createClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true
    });

    try {
      const boardState = await new Promise<{ board: typeof board }>((resolve, reject) => {
        clientA.once('board:state', resolve);
        clientA.emit(
          'board:join',
          {
            boardId: board.id,
            user: { id: 'tester-a', name: 'Tester A' }
          },
          (ack: { ok: boolean; error?: string }) => {
            if (!ack.ok) {
              reject(new Error(ack.error ?? 'Join failed'));
            }
          }
        );
      });

      expect(boardState.board.id).toBe(board.id);

      const userJoined = new Promise((resolve) => {
        clientA.once('board:user_joined', resolve);
      });

      await new Promise<void>((resolve, reject) => {
        clientB.emit(
          'board:join',
          {
            boardId: board.id,
            user: { id: 'tester-b', name: 'Tester B' }
          },
          (ack: { ok: boolean; error?: string }) => {
            if (!ack.ok) {
              reject(new Error(ack.error ?? 'Join failed'));
              return;
            }
            resolve();
          }
        );
      });

      await userJoined;

      const noteCreated = new Promise<{ boardId: string; note: (typeof board)['notes'][string] }>(
        (resolve, reject) => {
          clientB.once('note:created', resolve);
          clientA.emit(
            'note:create',
            {
              boardId: board.id,
              note: {
                body: 'Integration test note',
                x: 200,
                y: 120,
                color: '#fde68a'
              }
            },
            (ack: { ok: boolean; error?: string }) => {
              if (!ack.ok) {
                reject(new Error(ack.error ?? 'Note creation failed'));
              }
            }
          );
        }
      );

      const payload = await noteCreated;
      expect(payload.boardId).toBe(board.id);
      expect(payload.note.body).toBe('Integration test note');

      const persisted = await boardStore.getBoard(board.id);
      expect(persisted?.notes).toHaveProperty(payload.note.id);
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });

  it('emits room presence updates when an anonymous participant joins', async () => {
    const createResponse = await agent
      .post('/api/boards')
      .send({
        name: 'Presence Board',
        owner: { id: 'presence-owner', name: 'Presence Owner', email: 'presence-owner@example.com' }
      })
      .expect(201);

    const boardId = createResponse.body.board.id as string;

    const clientA = createClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true
    });
    const clientB = createClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true
    });

    try {
      await new Promise<void>((resolve, reject) => {
        clientA.once('board:state', () => resolve());
        clientA.emit(
          'board:join',
          {
            boardId,
            user: { id: 'presence-a', name: 'Presence A' }
          },
          (ack: { ok: boolean; error?: string }) => {
            if (!ack.ok) {
              reject(new Error(ack.error ?? 'Join failed'));
            }
          }
        );
      });

      const presenceUpdate = new Promise<{ boardId: string; participants: number }>((resolve) => {
        clientA.on('board:presence', (payload: { boardId: string; participants: number }) => {
          if (payload.boardId === boardId && payload.participants === 2) {
            resolve(payload);
          }
        });
      });

      await new Promise<void>((resolve, reject) => {
        clientB.emit(
          'board:join',
          {
            boardId
          },
          (ack: { ok: boolean; error?: string }) => {
            if (!ack.ok) {
              reject(new Error(ack.error ?? 'Join failed'));
              return;
            }
            resolve();
          }
        );
      });

      await expect(presenceUpdate).resolves.toMatchObject({
        boardId,
        participants: 2
      });
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });

  it('rejects board creation without an authenticated owner', async () => {
    await agent.post('/api/boards').send({ name: 'Missing Owner' }).expect(400);
  });

  it('allows only the board creator to rename a board', async () => {
    const owner = { id: 'rename-owner', name: 'Rename Owner', email: 'rename-owner@example.com' };
    const otherUser = { id: 'rename-other', name: 'Rename Other', email: 'rename-other@example.com' };

    const createResponse = await agent
      .post('/api/boards')
      .send({
        name: 'Original Name',
        owner
      })
      .expect(201);

    const boardId = createResponse.body.board.id as string;

    await agent
      .patch(`/api/boards/${boardId}`)
      .send({
        name: 'Blocked Rename',
        requesterId: otherUser.id
      })
      .expect(403);

    const renameResponse = await agent
      .patch(`/api/boards/${boardId}`)
      .send({
        name: 'Renamed Board',
        requesterId: owner.id
      })
      .expect(200);

    expect(renameResponse.body.board.name).toBe('Renamed Board');
    expect(renameResponse.body.board.id).toBe(boardId);

    const persistedBoard = await boardStore.getBoard(boardId);
    expect(persistedBoard?.name).toBe('Renamed Board');
  });

  it('lists boards for an owner and supports deletion', async () => {
    const owner = { id: 'owner-user', name: 'Owner User', email: 'owner@example.com' };
    const otherOwner = { id: 'another-user', name: 'Another User', email: 'other@example.com' };

    const createFirst = await agent
      .post('/api/boards')
      .send({
        name: 'First Board',
        owner
      })
      .expect(201);

    const createSecond = await agent
      .post('/api/boards')
      .send({
        name: 'Second Board',
        owner
      })
      .expect(201);

    await agent
      .post('/api/boards')
      .send({
        name: 'Unrelated Board',
        owner: otherOwner
      })
      .expect(201);

    const listResponse = await agent.get('/api/boards').query({ ownerId: owner.id }).expect(200);
    expect(Array.isArray(listResponse.body.boards)).toBe(true);
    expect(listResponse.body.boards).toHaveLength(2);
    const ids = listResponse.body.boards.map((b: { id: string }) => b.id);
    expect(ids).toEqual(
      expect.arrayContaining([createFirst.body.board.id, createSecond.body.board.id])
    );

    await agent.delete(`/api/boards/${createFirst.body.board.id}`).expect(204);
    await agent.delete('/api/boards/non-existent').expect(404);

    const listAfterDelete = await agent.get('/api/boards').query({ ownerId: owner.id }).expect(200);
    expect(listAfterDelete.body.boards).toHaveLength(1);
    expect(listAfterDelete.body.boards[0].id).toBe(createSecond.body.board.id);
  });
});
