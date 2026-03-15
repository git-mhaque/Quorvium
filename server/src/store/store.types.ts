import type {
  Board,
  CreateBoardInput,
  CreateStickyNoteInput,
  StickyNote,
  UpdateStickyNoteInput
} from '../types.js';

export interface PersistentBoardStore {
  createBoard(input: CreateBoardInput): Promise<Board>;
  getBoard(boardId: string): Promise<Board | undefined>;
  listBoardsByOwner(ownerId: string): Promise<Board[]>;
  deleteBoard(boardId: string): Promise<boolean>;
  renameBoard(boardId: string, name: string): Promise<Board | undefined>;
  createNote(input: CreateStickyNoteInput): Promise<StickyNote>;
  updateNote(input: UpdateStickyNoteInput): Promise<StickyNote>;
  deleteNote(boardId: string, noteId: string): Promise<void>;
}
