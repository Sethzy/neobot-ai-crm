/**
 * Returns a debounced version of a value after the provided delay.
 * @module hooks/use-debounced-value
 */
"use client";

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [delay, value]);

  return debouncedValue;
}
