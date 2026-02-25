'use client';

/**
 * Hook for persisting state to localStorage.
 * @module hooks/use-local-storage
 */
import { useState, useCallback } from "react";

/**
 * Persist state to localStorage with JSON serialization.
 * Falls back to initialValue if localStorage is empty or invalid.
 *
 * @param key - localStorage key
 * @param initialValue - Default value when localStorage is empty
 * @returns Tuple of [value, setValue] similar to useState
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T) => {
      setStoredValue(value);
      localStorage.setItem(key, JSON.stringify(value));
    },
    [key]
  );

  return [storedValue, setValue];
}
