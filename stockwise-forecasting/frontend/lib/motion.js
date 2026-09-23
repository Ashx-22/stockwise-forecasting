'use client';

import { useEffect, useRef, useState } from 'react';

// Width of an element, kept in sync with ResizeObserver (falls back to a fixed width where unavailable).
export function useWidth(initial = 720) {
  const ref = useRef(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      if (width > 0) setW(Math.round(width));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
