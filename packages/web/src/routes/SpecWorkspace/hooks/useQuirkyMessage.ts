import { useState, useEffect, useRef } from 'react';
import { QUIRKY_MESSAGES } from '../constants';

interface UseQuirkyMessageOptions {
  isActive: boolean;
  intervalMs?: number;
}

/**
 * Hook to rotate through quirky loading messages
 */
export function useQuirkyMessage({ isActive, intervalMs = 3000 }: UseQuirkyMessageOptions) {
  const [message, setMessage] = useState<typeof QUIRKY_MESSAGES[0] | null>(null);
  const lastIndexRef = useRef<number>(-1);

  useEffect(() => {
    if (!isActive) {
      setMessage(null);
      return;
    }

    const pickRandom = () => {
      let newIndex: number;
      do {
        newIndex = Math.floor(Math.random() * QUIRKY_MESSAGES.length);
      } while (newIndex === lastIndexRef.current && QUIRKY_MESSAGES.length > 1);
      
      lastIndexRef.current = newIndex;
      setMessage(QUIRKY_MESSAGES[newIndex]);
    };

    pickRandom();
    const interval = setInterval(pickRandom, intervalMs);
    
    return () => clearInterval(interval);
  }, [isActive, intervalMs]);

  return message;
}
