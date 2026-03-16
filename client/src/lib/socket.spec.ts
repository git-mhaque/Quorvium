import { afterEach, describe, expect, it, vi } from 'vitest';

const ioMock = vi.hoisted(() => vi.fn(() => ({ mocked: true })));

vi.mock('socket.io-client', () => ({
  __esModule: true,
  io: ioMock
}));

import { env } from '../env';
import { createBoardSocket } from './socket';

describe('createBoardSocket', () => {
  afterEach(() => {
    ioMock.mockClear();
  });

  it('creates socket with expected options', () => {
    createBoardSocket();

    expect(ioMock).toHaveBeenCalledWith(env.apiBaseUrl, {
      transports: ['websocket'],
      path: '/socket.io',
      autoConnect: false
    });
  });
});
