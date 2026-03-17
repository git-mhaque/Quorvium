import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  fetchBoard: vi.fn(),
  renameBoard: vi.fn()
}));

const authState = vi.hoisted(() => ({
  user: {
    id: 'owner-1',
    name: 'Owner User',
    email: 'owner@example.com',
    isGuest: false
  }
}));

const socketState = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  type HandlerMap = Map<string, Set<Handler>>;
  interface AckResponse {
    ok: boolean;
    error?: string;
  }
  interface MockSocket {
    emitted: Array<{ event: string; payload: unknown }>;
    on: (event: string, handler: Handler) => MockSocket;
    off: (event: string, handler: Handler) => MockSocket;
    removeAllListeners: () => MockSocket;
    connect: () => MockSocket;
    disconnect: () => MockSocket;
    emit: (
      event: string,
      payload: unknown,
      ack?: (response: { ok: boolean; error?: string }) => void
    ) => MockSocket;
    dispatch: (event: string, payload?: unknown) => void;
    setAck: (event: string, response: AckResponse) => void;
  }

  const sockets: MockSocket[] = [];
  const defaultAckByEvent = new Map<string, AckResponse>();

  function createSocket() {
    const handlers: HandlerMap = new Map();
    const ackByEvent = new Map<string, AckResponse>();

    const dispatch = (event: string, payload?: unknown) => {
      const listeners = handlers.get(event);
      if (!listeners) {
        return;
      }
      for (const listener of listeners) {
        listener(payload as never);
      }
    };

    const socket = {
      emitted: [] as Array<{ event: string; payload: unknown }>,
      on(event: string, handler: Handler) {
        const existing = handlers.get(event) ?? new Set<Handler>();
        existing.add(handler);
        handlers.set(event, existing);
        return socket;
      },
      off(event: string, handler: Handler) {
        handlers.get(event)?.delete(handler);
        return socket;
      },
      removeAllListeners() {
        handlers.clear();
        return socket;
      },
      connect() {
        dispatch('connect');
        return socket;
      },
      disconnect() {
        dispatch('disconnect');
        return socket;
      },
      emit(event: string, payload: unknown, ack?: (response: { ok: boolean; error?: string }) => void) {
        socket.emitted.push({ event, payload });
        ack?.(ackByEvent.get(event) ?? defaultAckByEvent.get(event) ?? { ok: true });
        return socket;
      },
      dispatch,
      setAck(event: string, response: AckResponse) {
        ackByEvent.set(event, response);
      }
    };

    sockets.push(socket);
    return socket;
  }

  return {
    createBoardSocket: vi.fn(createSocket),
    sockets,
    setDefaultAck(event: string, response: AckResponse) {
      defaultAckByEvent.set(event, response);
    },
    clearDefaultAcks() {
      defaultAckByEvent.clear();
    }
  };
});

vi.mock('../lib/api', () => ({
  __esModule: true,
  fetchBoard: apiMocks.fetchBoard,
  renameBoard: apiMocks.renameBoard
}));

vi.mock('../lib/socket', () => ({
  __esModule: true,
  createBoardSocket: socketState.createBoardSocket
}));

vi.mock('../state/auth', () => ({
  __esModule: true,
  useAuth: () => authState
}));

import { BoardPage } from './BoardPage';

function renderBoard(path = '/boards/11111111-1111-1111-1111-111111111111') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/boards/:boardId" element={<BoardPage />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function getActiveSocket() {
  const joined =
    socketState.sockets.find((candidate) =>
      candidate.emitted.some((entry: { event: string }) => entry.event === 'board:join')
    ) ?? socketState.sockets[0];
  return joined;
}

function getZoomPercentValue() {
  const rawValue = screen.getByTestId('zoom-value').textContent ?? '0%';
  return Number(rawValue.replace('%', '').trim());
}

async function dragPaletteColorToBoard(clientX = 320, clientY = 220, colorIndex = 0) {
  const swatches = screen.getAllByRole('button', { name: /drag sticky note color/i });
  const swatch = swatches[colorIndex];
  fireEvent.pointerDown(swatch, {
    pointerId: 27,
    clientX: 26,
    clientY: 120,
    pageX: 26,
    pageY: 120,
    screenX: 26,
    screenY: 120
  });

  await waitFor(() => {
    expect(document.body.style.cursor).toBe('copy');
  });

  fireEvent.pointerUp(window, {
    pointerId: 27,
    clientX,
    clientY,
    pageX: clientX,
    pageY: clientY,
    screenX: clientX,
    screenY: clientY
  });
}

function startPaletteDrag(colorIndex = 0) {
  const swatches = screen.getAllByRole('button', { name: /drag sticky note color/i });
  const swatch = swatches[colorIndex];
  fireEvent.pointerDown(swatch, {
    pointerId: 27,
    clientX: 26,
    clientY: 120,
    pageX: 26,
    pageY: 120,
    screenX: 26,
    screenY: 120
  });
}

const baseBoard = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Roadmap',
  owner: {
    id: 'owner-1',
    name: 'Owner User'
  },
  createdAt: '2026-03-10T12:00:00.000Z',
  updatedAt: '2026-03-10T12:00:00.000Z',
  notes: {
    'note-1': {
      id: 'note-1',
      body: 'North star',
      color: '#fde68a',
      x: 100,
      y: 100,
      createdAt: '2026-03-10T12:00:00.000Z',
      updatedAt: '2026-03-10T12:00:00.000Z'
    }
  }
};

describe('BoardPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    socketState.sockets.length = 0;
    socketState.clearDefaultAcks();
    vi.useRealTimers();
    authState.user = {
      id: 'owner-1',
      name: 'Owner User',
      email: 'owner@example.com',
      isGuest: false
    };
  });

  it('loads board, joins socket, and auto-fits to show all cards', async () => {
    apiMocks.fetchBoard.mockResolvedValue({
      ...baseBoard,
      notes: {
        ...baseBoard.notes,
        'note-2': {
          id: 'note-2',
          body: 'Far note',
          color: '#bfdbfe',
          x: 12000,
          y: 12000,
          createdAt: '2026-03-10T12:00:00.000Z',
          updatedAt: '2026-03-10T12:00:00.000Z'
        }
      }
    });

    renderBoard();

    await screen.findByRole('heading', { name: 'Roadmap' });

    await waitFor(() => {
      expect(getZoomPercentValue()).toBeLessThanOrEqual(10);
    });
    expect(getZoomPercentValue()).toBeGreaterThanOrEqual(2);

    const socket = socketState.sockets[0];
    expect(socket).toBeDefined();
    expect(socket.emitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'board:join',
          payload: expect.objectContaining({
            boardId: '11111111-1111-1111-1111-111111111111'
          })
        })
      ])
    );
  });

  it('reset view returns to the best-fit zoom for all cards', async () => {
    apiMocks.fetchBoard.mockResolvedValue({
      ...baseBoard,
      notes: {
        ...baseBoard.notes,
        'note-2': {
          id: 'note-2',
          body: 'Far note',
          color: '#bfdbfe',
          x: 12000,
          y: 12000,
          createdAt: '2026-03-10T12:00:00.000Z',
          updatedAt: '2026-03-10T12:00:00.000Z'
        }
      }
    });

    renderBoard();
    await screen.findByRole('heading', { name: 'Roadmap' });

    await waitFor(() => {
      expect(getZoomPercentValue()).toBeLessThanOrEqual(10);
    });
    const fitZoom = getZoomPercentValue();

    await userEvent.click(screen.getByRole('button', { name: /zoom in/i }));
    expect(getZoomPercentValue()).toBeGreaterThan(fitZoom);

    await userEvent.click(screen.getByRole('button', { name: /reset view/i }));
    expect(getZoomPercentValue()).toBe(fitZoom);
  });

  it('redirects to home when board id param is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/boards']}>
        <Routes>
          <Route path="/boards" element={<BoardPage />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Home');
    expect(apiMocks.fetchBoard).not.toHaveBeenCalled();
    expect(socketState.sockets[0].emitted).toEqual([]);
  });

  it('creates note via socket and allows creator to rename board inline', async () => {
    apiMocks.fetchBoard.mockResolvedValue(baseBoard);
    apiMocks.renameBoard.mockResolvedValue({
      ...baseBoard,
      name: 'Roadmap Q2'
    });

    renderBoard();

    await screen.findByRole('heading', { name: 'Roadmap' });

    await dragPaletteColorToBoard();

    const socket = getActiveSocket();
    await waitFor(() => {
      expect(socket.emitted).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'note:create',
            payload: expect.objectContaining({
              boardId: baseBoard.id
            })
          })
        ])
      );
    });

    await userEvent.click(screen.getByRole('heading', { name: 'Roadmap' }));
    const input = screen.getByRole('textbox', { name: /board name/i });
    await userEvent.clear(input);
    await userEvent.type(input, 'Roadmap Q2{Enter}');

    await waitFor(() => {
      expect(apiMocks.renameBoard).toHaveBeenCalledWith(baseBoard.id, {
        name: 'Roadmap Q2',
        requesterId: 'owner-1'
      });
    });

    await screen.findByRole('heading', { name: 'Roadmap Q2' });
  });

  it('creates dragged note using the selected color and drop position', async () => {
    apiMocks.fetchBoard.mockResolvedValue({
      ...baseBoard,
      notes: {}
    });

    renderBoard();
    await screen.findByRole('heading', { name: 'Roadmap' });

    await dragPaletteColorToBoard(400, 300, 2);

    const socket = getActiveSocket();
    const createEmit = socket.emitted.find((entry: { event: string }) => entry.event === 'note:create');
    expect(createEmit).toBeDefined();

    const payload = createEmit?.payload as {
      boardId: string;
      note: { color: string; x: number; y: number };
    };
    expect(payload.boardId).toBe(baseBoard.id);
    expect(payload.note.color).toBe('#bfdbfe');
    expect(Number.isFinite(payload.note.x)).toBe(true);
    expect(Number.isFinite(payload.note.y)).toBe(true);
  });

  it('handles inline rename validation, escape cancel, and server error feedback', async () => {
    apiMocks.fetchBoard.mockResolvedValue(baseBoard);
    apiMocks.renameBoard.mockRejectedValue({
      response: {
        data: {
          error: 'Only owner can rename'
        }
      }
    });

    renderBoard();
    await screen.findByRole('heading', { name: 'Roadmap' });

    await userEvent.click(screen.getByRole('heading', { name: 'Roadmap' }));
    const input = screen.getByRole('textbox', { name: /board name/i });
    await userEvent.clear(input);
    await userEvent.type(input, '{Enter}');
    expect(await screen.findByText('Board name cannot be empty.')).toBeInTheDocument();

    await userEvent.type(input, 'Roadmap{Enter}');
    expect(apiMocks.renameBoard).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: /board name/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('heading', { name: 'Roadmap' }));
    const inputAgain = screen.getByRole('textbox', { name: /board name/i });
    await userEvent.type(inputAgain, '{Escape}');
    expect(screen.queryByRole('textbox', { name: /board name/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('heading', { name: 'Roadmap' }));
    const retryInput = screen.getByRole('textbox', { name: /board name/i });
    await userEvent.clear(retryInput);
    await userEvent.type(retryInput, 'Roadmap Final{Enter}');

    expect(await screen.findByText('Only owner can rename')).toBeInTheDocument();
  });

  it('does not allow inline rename for non-creator users', async () => {
    authState.user = {
      id: 'viewer-1',
      name: 'Viewer User',
      email: 'viewer@example.com',
      isGuest: false
    };
    apiMocks.fetchBoard.mockResolvedValue(baseBoard);

    renderBoard();

    await screen.findByRole('heading', { name: 'Roadmap' });
    await userEvent.click(screen.getByRole('heading', { name: 'Roadmap' }));
    expect(screen.queryByRole('textbox', { name: /board name/i })).not.toBeInTheDocument();
  });

  it('applies socket state, presence, and note lifecycle events', async () => {
    apiMocks.fetchBoard.mockResolvedValue(baseBoard);

    renderBoard();
    await screen.findByRole('heading', { name: 'Roadmap' });

    const socket = getActiveSocket();

    act(() => {
      socket.dispatch('board:state', {
        board: {
          ...baseBoard,
          name: 'Roadmap Live',
          notes: {}
        }
      });
    });
    await screen.findByRole('heading', { name: 'Roadmap Live' });

    const created = {
      id: 'note-2',
      body: 'New from socket',
      color: '#bfdbfe',
      x: 300,
      y: 240,
      createdAt: '2026-03-10T12:00:00.000Z',
      updatedAt: '2026-03-10T12:00:00.000Z'
    };

    act(() => {
      socket.dispatch('note:created', { boardId: baseBoard.id, note: created });
    });
    await screen.findByText('New from socket');

    act(() => {
      socket.dispatch('note:updated', {
        boardId: baseBoard.id,
        note: {
          ...created,
          body: 'Updated by socket'
        }
      });
    });
    await screen.findByText('Updated by socket');

    act(() => {
      socket.dispatch('note:deleted', { boardId: baseBoard.id, noteId: 'note-2' });
    });
    await waitFor(() => {
      expect(screen.queryByText('Updated by socket')).not.toBeInTheDocument();
    });

    expect(screen.getByText(/1 active collaborator/i)).toBeInTheDocument();
    act(() => {
      socket.dispatch('board:presence', {
        boardId: baseBoard.id,
        participants: 2
      });
    });
    expect(screen.getByText(/2 active collaborators/i)).toBeInTheDocument();

    act(() => {
      socket.dispatch('board:presence', {
        boardId: '00000000-0000-0000-0000-000000000000',
        participants: 9
      });
    });
    expect(screen.getByText(/2 active collaborators/i)).toBeInTheDocument();
  });

  it('shows operation errors for create update and delete note actions', async () => {
    apiMocks.fetchBoard.mockResolvedValue(baseBoard);

    renderBoard();
    await screen.findByRole('heading', { name: 'Roadmap' });

    const socket = getActiveSocket();
    socket.setAck('note:create', { ok: false, error: 'Create failed' });
    await dragPaletteColorToBoard();
    expect(await screen.findByText('Create failed')).toBeInTheDocument();

    socket.setAck('note:update', { ok: false, error: 'Update failed' });
    const textArea = screen.getByDisplayValue('North star');
    fireEvent.change(textArea, { target: { value: 'North star revised' } });
    fireEvent.blur(textArea);
    expect(await screen.findByText('Update failed')).toBeInTheDocument();

    socket.setAck('note:delete', { ok: false, error: 'Delete failed' });
    await userEvent.click(screen.getByRole('button', { name: /×/i }));
    expect(await screen.findByText('Delete failed')).toBeInTheDocument();
  });

  it('cleans up drag state on pointer cancel without creating a note', async () => {
    apiMocks.fetchBoard.mockResolvedValue(baseBoard);

    renderBoard();
    await screen.findByRole('heading', { name: 'Roadmap' });

    startPaletteDrag(3);
    expect(document.body.style.cursor).toBe('copy');

    fireEvent.pointerCancel(window, {
      pointerId: 27,
      clientX: 260,
      clientY: 180
    });

    expect(document.body.style.cursor).toBe('');
    const socket = getActiveSocket();
    expect(socket.emitted.some((entry: { event: string }) => entry.event === 'note:create')).toBe(false);
  });

  it('updates connection badge and resets empty-board zoom to 100%', async () => {
    apiMocks.fetchBoard.mockResolvedValue({
      ...baseBoard,
      notes: {}
    });

    renderBoard();
    await screen.findByRole('heading', { name: 'Roadmap' });

    const socket = getActiveSocket();
    expect(screen.getByText(/connected/i)).toBeInTheDocument();

    act(() => {
      socket.dispatch('disconnect');
    });
    await waitFor(() => {
      expect(screen.getByText(/connecting/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /zoom in/i }));
    expect(getZoomPercentValue()).toBe(110);

    await userEvent.click(screen.getByRole('button', { name: /reset view/i }));
    expect(getZoomPercentValue()).toBe(100);

    act(() => {
      socket.dispatch('connect');
    });
    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });
  });

  it('supports ctrl + wheel zoom in and out', async () => {
    apiMocks.fetchBoard.mockResolvedValue({
      ...baseBoard,
      notes: {}
    });

    const { container } = renderBoard();
    await screen.findByRole('heading', { name: 'Roadmap' });

    const boardViewport = container.firstElementChild as HTMLDivElement;
    expect(getZoomPercentValue()).toBe(100);

    fireEvent.wheel(boardViewport, {
      ctrlKey: true,
      deltaY: -120,
      clientX: 300,
      clientY: 240
    });
    expect(getZoomPercentValue()).toBe(110);

    fireEvent.wheel(boardViewport, {
      ctrlKey: true,
      deltaY: 120,
      clientX: 300,
      clientY: 240
    });
    expect(getZoomPercentValue()).toBe(100);

    fireEvent.wheel(boardViewport, {
      ctrlKey: false,
      deltaY: -120,
      clientX: 300,
      clientY: 240
    });
    expect(getZoomPercentValue()).toBe(100);
  });

  it('shows join failure message when socket join is rejected', async () => {
    apiMocks.fetchBoard.mockResolvedValue(baseBoard);
    socketState.setDefaultAck('board:join', { ok: false, error: 'Join denied' });

    renderBoard();
    expect(await screen.findByText('Join denied')).toBeInTheDocument();
  });

  it('shows generic message when board fetch fails with non-http error', async () => {
    apiMocks.fetchBoard.mockRejectedValue(new Error('network'));

    renderBoard();
    expect(await screen.findByText('Failed to load board.')).toBeInTheDocument();
  });

  it('shows not found message when board fetch fails', async () => {
    const notFoundError = Object.assign(new Error('not found'), {
      response: { status: 404 }
    });
    apiMocks.fetchBoard.mockRejectedValue(notFoundError);

    renderBoard();

    expect(await screen.findByText('Board not found.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go back home/i })).toBeInTheDocument();
  });
});
