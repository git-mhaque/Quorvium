export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard support is unavailable.');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'absolute';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('Failed to copy board link. Try again.');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}
