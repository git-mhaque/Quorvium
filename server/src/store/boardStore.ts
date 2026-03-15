import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { env } from '../env.js';
import {
  Board,
  CreateBoardInput,
  CreateStickyNoteInput,
  StickyNote,
  UpdateStickyNoteInput
} from '../types.js';
import { FirestoreBoardStore } from './firestoreBoardStore.js';
import type { PersistentBoardStore } from './store.types.js';

const WORKSPACE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEFAULT_DATA_DIR = resolve(process.env.DATA_DIR ?? join(WORKSPACE_ROOT, 'data'));
const DEFAULT_DATA_FILE = join(DEFAULT_DATA_DIR, 'boards.json');

async function ensureDataFile(dataFile: string): Promise<void> {
  await fs.mkdir(dirname(dataFile), { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify({ boards: [] }, null, 2), 'utf-8');
  }
}

interface SerializedBoard {
  boards: Board[];
}

export class BoardStore implements PersistentBoardStore {
  private dataFile: string;
  private boards = new Map<string, Board>();
  private isReady = false;

  constructor(dataFile: string = DEFAULT_DATA_FILE) {
    this.dataFile = dataFile;
  }

  async init(): Promise<void> {
    if (this.isReady) {
      return;
    }

    await ensureDataFile(this.dataFile);

    const raw = await fs.readFile(this.dataFile, 'utf-8');
    if (raw) {
      const parsed = JSON.parse(raw) as SerializedBoard;
      parsed.boards.forEach((board) => {
        if (!board.owner) {
          board.owner = {
            id: 'legacy-owner',
            name: 'Legacy Owner'
          };
        }
        this.boards.set(board.id, board);
      });
    }
    this.isReady = true;
  }

  private async persist(): Promise<void> {
    const payload: SerializedBoard = {
      boards: Array.from(this.boards.values())
    };
    await fs.writeFile(this.dataFile, JSON.stringify(payload, null, 2), 'utf-8');
  }

  async createBoard(input: CreateBoardInput): Promise<Board> {
    await this.init();
    const now = new Date().toISOString();
    const board: Board = {
      id: randomUUID(),
      name: input.name,
      owner: input.owner,
      createdAt: now,
      updatedAt: now,
      notes: {}
    };
    this.boards.set(board.id, board);
    await this.persist();
    return board;
  }

  async getBoard(boardId: string): Promise<Board | undefined> {
    await this.init();
    return this.boards.get(boardId);
  }

  async listBoardsByOwner(ownerId: string): Promise<Board[]> {
    await this.init();
    return Array.from(this.boards.values())
      .filter((board) => board.owner?.id === ownerId)
      .sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt).getTime() -
          new Date(a.updatedAt ?? a.createdAt).getTime()
      );
  }

  async deleteBoard(boardId: string): Promise<boolean> {
    await this.init();
    const existed = this.boards.delete(boardId);
    if (existed) {
      await this.persist();
    }
    return existed;
  }

  async renameBoard(boardId: string, name: string): Promise<Board | undefined> {
    const board = await this.getBoard(boardId);
    if (!board) {
      return undefined;
    }

    board.name = name;
    board.updatedAt = new Date().toISOString();
    await this.persist();
    return board;
  }

  async createNote(input: CreateStickyNoteInput): Promise<StickyNote> {
    const board = await this.getBoard(input.boardId);
    if (!board) {
      throw new Error('Board not found');
    }

    const now = new Date().toISOString();
    const note: StickyNote = {
      id: randomUUID(),
      body: input.note.body,
      color: input.note.color ?? '#fde68a',
      x: input.note.x ?? 100,
      y: input.note.y ?? 100,
      createdAt: now,
      updatedAt: now,
      author: input.note.author
    };
    board.notes[note.id] = note;
    board.updatedAt = now;
    await this.persist();
    return note;
  }

  async updateNote(input: UpdateStickyNoteInput): Promise<StickyNote> {
    const board = await this.getBoard(input.boardId);
    if (!board) {
      throw new Error('Board not found');
    }
    const existing = board.notes[input.noteId];
    if (!existing) {
      throw new Error('Note not found');
    }

    const updated: StickyNote = {
      ...existing,
      ...input.patch,
      updatedAt: new Date().toISOString()
    };
    board.notes[input.noteId] = updated;
    board.updatedAt = updated.updatedAt;
    await this.persist();
    return updated;
  }

  async deleteNote(boardId: string, noteId: string): Promise<void> {
    const board = await this.getBoard(boardId);
    if (!board) {
      throw new Error('Board not found');
    }
    if (board.notes[noteId]) {
      delete board.notes[noteId];
      board.updatedAt = new Date().toISOString();
      await this.persist();
    }
  }
}

export function createConfiguredBoardStore(): PersistentBoardStore {
  if (env.dataStore === 'firestore') {
    return new FirestoreBoardStore({
      projectId: env.firestoreProjectId,
      databaseId: env.firestoreDatabaseId,
      boardsCollection: env.firestoreBoardsCollection
    });
  }
  return new BoardStore();
}

export const boardStore: PersistentBoardStore = createConfiguredBoardStore();
