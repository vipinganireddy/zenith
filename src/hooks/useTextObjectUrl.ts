import { useEffect, useMemo } from 'react';

/**
 * Wraps text output (an AI summary, a translation) in a blob: URL so it can be
 * handed to components that take a download URL, such as SaveToDriveButton.
 * The URL is revoked when the text changes or the component unmounts.
 */
export function useTextObjectUrl(text: string | null, mimeType = 'text/plain;charset=utf-8'): string | null {
  const url = useMemo(
    () => (text ? URL.createObjectURL(new Blob([text], { type: mimeType })) : null),
    [text, mimeType],
  );
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}
