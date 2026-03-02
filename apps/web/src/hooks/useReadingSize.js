import { useContext } from 'react';
import { ReadingSizeContext } from '../contexts/reading-size-context';

export default function useReadingSize() {
  const context = useContext(ReadingSizeContext);
  if (!context) throw new Error('useReadingSize must be used within a ReadingSizeProvider');
  return context;
}
