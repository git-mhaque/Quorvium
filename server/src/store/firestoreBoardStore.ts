import { Firestore, type CollectionReference } from '@google-cloud/firestore';
import { randomUUID } from 'crypto';

import type {
  Board,
  CreateBoardInput,
  CreateStickyNoteInput,
  Participant,
  StickyNote,
  UpdateStickyNoteInput
} from '../types.js';
import type { PersistentBoardStore } from './store.types.js';

interface FirestoreBoardDocument {
  name: string;
  owner: Participant;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

interface FirestoreNoteDocument {
  body: string;
  color: string;
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
  author?: Participant;
}

export interface FirestoreBoardStoreOptions {
  projectId?: string;
  databaseId?: string;
  boardsCollection?: string;
}

const DEFAULT_NOTES_COLLECTION = 'notes';
const DEFAULT_BOARDS_COLLECTION = 'boards';
const DEFAULT_NOTE_COLOR = '#fde68a';

export class FirestoreBoardStore implements PersistentBoardStore {
  private firestore: Firestore;
  private boardsCollection: CollectionReference<FirestoreBoardDocument>;

  constructor(options: FirestoreBoardStoreOptions = {}) {
    this.firestore = new Firestore({
      projectId: options.projectId || undefined,
      databaseId: options.databaseId || undefined
    });
    this.boardsCollection = this.firestore.collection(
      options.boardsCollection ?? DEFAULT_BOARDS_COLLECTION
    ) as CollectionReference<FirestoreBoardDocument>;
  }

  private notesCollection(boardId: string): CollectionReference<FirestoreNoteDocument> {
    return this.boardsCollection
      .doc(boardId)
      .collection(DEFAULT_NOTES_COLLECTION) as CollectionReference<FirestoreNoteDocument>;
  }

  private toBoard(
    boardId: string,
    boardData: FirestoreBoardDocument,
    notes: Record<string, StickyNote>
  ): Board {
    return {
      id: boardId,
      name: boardData.name,
      owner:
        boardData.owner ??
        ({
          id: boardData.ownerId ?? 'legacy-owner',
          name: 'Legacy Owner'
        } as Participant),
      createdAt: boardData.createdAt,
      updatedAt: boardData.updatedAt,
      notes
    };
  }

  private toNote(noteId: string, data: FirestoreNoteDocument): StickyNote {
    return {
      id: noteId,
      body: data.body,
      color: data.color,
      x: data.x,
      y: data.y,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      author: data.author
    };
  }

  private async fetchNotes(boardId: string): Promise<Record<string, StickyNote>> {
    const notesSnapshot = await this.notesCollection(boardId).get();
    const notes: Record<string, StickyNote> = {};
    for (const noteDoc of notesSnapshot.docs) {
      notes[noteDoc.id] = this.toNote(noteDoc.id, noteDoc.data());
    }
    return notes;
  }

  async createBoard(input: CreateBoardInput): Promise<Board> {
    const boardId = randomUUID();
    const now = new Date().toISOString();
    const boardDoc: FirestoreBoardDocument = {
      name: input.name,
      owner: input.owner,
      ownerId: input.owner.id,
      createdAt: now,
      updatedAt: now
    };
    await this.boardsCollection.doc(boardId).set(boardDoc);
    return this.toBoard(boardId, boardDoc, {});
  }

  async getBoard(boardId: string): Promise<Board | undefined> {
    const boardSnapshot = await this.boardsCollection.doc(boardId).get();
    if (!boardSnapshot.exists) {
      return undefined;
    }
    const boardData = boardSnapshot.data() as FirestoreBoardDocument;
    const notes = await this.fetchNotes(boardId);
    return this.toBoard(boardId, boardData, notes);
  }

  async listBoardsByOwner(ownerId: string): Promise<Board[]> {
    const snapshot = await this.boardsCollection.where('ownerId', '==', ownerId).get();
    const boards = snapshot.docs.map((doc) => this.toBoard(doc.id, doc.data(), {}));
    boards.sort(
      (a, b) =>
        new Date(b.updatedAt ?? b.createdAt).getTime() -
        new Date(a.updatedAt ?? a.createdAt).getTime()
    );
    return boards;
  }

  private async deleteAllNotes(boardId: string): Promise<void> {
    const notesCollection = this.notesCollection(boardId);
    let hasMore = true;
    while (hasMore) {
      const snapshot = await notesCollection.limit(300).get();
      if (snapshot.empty) {
        hasMore = false;
        continue;
      }

      const batch = this.firestore.batch();
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();

      hasMore = snapshot.size === 300;
    }
  }

  async deleteBoard(boardId: string): Promise<boolean> {
    const boardRef = this.boardsCollection.doc(boardId);
    const boardSnapshot = await boardRef.get();
    if (!boardSnapshot.exists) {
      return false;
    }

    await this.deleteAllNotes(boardId);
    await boardRef.delete();
    return true;
  }

  async renameBoard(boardId: string, name: string): Promise<Board | undefined> {
    const boardRef = this.boardsCollection.doc(boardId);
    const boardSnapshot = await boardRef.get();
    if (!boardSnapshot.exists) {
      return undefined;
    }

    await boardRef.update({
      name,
      updatedAt: new Date().toISOString()
    });
    return this.getBoard(boardId);
  }

  async createNote(input: CreateStickyNoteInput): Promise<StickyNote> {
    const boardRef = this.boardsCollection.doc(input.boardId);
    const boardSnapshot = await boardRef.get();
    if (!boardSnapshot.exists) {
      throw new Error('Board not found');
    }

    const noteId = randomUUID();
    const now = new Date().toISOString();
    const noteDoc: FirestoreNoteDocument = {
      body: input.note.body,
      color: input.note.color ?? DEFAULT_NOTE_COLOR,
      x: input.note.x ?? 100,
      y: input.note.y ?? 100,
      createdAt: now,
      updatedAt: now,
      author: input.note.author
    };

    const batch = this.firestore.batch();
    batch.set(this.notesCollection(input.boardId).doc(noteId), noteDoc);
    batch.update(boardRef, { updatedAt: now });
    await batch.commit();

    return this.toNote(noteId, noteDoc);
  }

  async updateNote(input: UpdateStickyNoteInput): Promise<StickyNote> {
    const boardRef = this.boardsCollection.doc(input.boardId);
    const noteRef = this.notesCollection(input.boardId).doc(input.noteId);

    return this.firestore.runTransaction(async (transaction) => {
      const [boardSnapshot, noteSnapshot] = await Promise.all([
        transaction.get(boardRef),
        transaction.get(noteRef)
      ]);

      if (!boardSnapshot.exists) {
        throw new Error('Board not found');
      }
      if (!noteSnapshot.exists) {
        throw new Error('Note not found');
      }

      const existing = noteSnapshot.data() as FirestoreNoteDocument;
      const now = new Date().toISOString();
      const updated: FirestoreNoteDocument = {
        ...existing,
        ...input.patch,
        updatedAt: now
      };

      transaction.set(noteRef, updated);
      transaction.update(boardRef, { updatedAt: now });
      return this.toNote(input.noteId, updated);
    });
  }

  async deleteNote(boardId: string, noteId: string): Promise<void> {
    const boardRef = this.boardsCollection.doc(boardId);
    const noteRef = this.notesCollection(boardId).doc(noteId);

    await this.firestore.runTransaction(async (transaction) => {
      const [boardSnapshot, noteSnapshot] = await Promise.all([
        transaction.get(boardRef),
        transaction.get(noteRef)
      ]);

      if (!boardSnapshot.exists) {
        throw new Error('Board not found');
      }
      if (!noteSnapshot.exists) {
        return;
      }

      const now = new Date().toISOString();
      transaction.delete(noteRef);
      transaction.update(boardRef, { updatedAt: now });
    });
  }
}
