import { useEffect, useMemo, useState } from 'react';
import { ReadingSizeContext } from './reading-size-context';

const STORAGE_KEY = 'diless-reading-size';
const DEFAULT_SIZE = 'small';

function getInitialReadingSize() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'large' || stored === 'small') return stored;
  } catch {
    // Ignore storage failures
  }
  return DEFAULT_SIZE;
}

export function ReadingSizeProvider({ children }) {
  const [readingSize, setReadingSize] = useState(getInitialReadingSize);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, readingSize);
    } catch {
      // Ignore storage failures
    }
    document.documentElement.dataset.readingSize = readingSize;
  }, [readingSize]);

  const value = useMemo(() => ({
    readingSize,
    setReadingSize,
    toggleReadingSize: () => setReadingSize((prev) => (prev === 'small' ? 'large' : 'small')),
    isLargeReading: readingSize === 'large',
  }), [readingSize]);

  return <ReadingSizeContext.Provider value={value}>{children}</ReadingSizeContext.Provider>;
}
