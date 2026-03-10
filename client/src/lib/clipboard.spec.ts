import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyTextToClipboard } from './clipboard';

describe('copyTextToClipboard', () => {
  const originalClipboard = navigator.clipboard;
  const originalExecCommand = document.execCommand;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: originalExecCommand
    });
    vi.restoreAllMocks();
  });

  it('uses navigator.clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    await copyTextToClipboard('https://quorvium.example/boards/abc');

    expect(writeText).toHaveBeenCalledWith('https://quorvium.example/boards/abc');
  });

  it('falls back to document.execCommand when navigator.clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });

    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand
    });

    await copyTextToClipboard('fallback-text');

    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});
