'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const FILES = ['meta', 'leaderboard', 'series', 'business', 'drift', 'features'];
let cache = null;

export function loadAll() {
  if (!cache) {
    cache = Promise.all(
      FILES.map((f) =>
        fetch(`/data/${f}.json`).then((r) => {
          if (!r.ok) throw new Error(`Could not load ${f}.json (${r.status})`);
          return r.json();
        }),
      ),
    ).then((arr) => Object.fromEntries(FILES.map((f, i) => [f, arr[i]])));
    cache.catch(() => {
      cache = null; // allow a retry after a failed load
    });
  }
  return cache;
}

export const DataContext = createContext({ data: null, error: null });
export const useData = () => useContext(DataContext);

export function useLoadData() {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let alive = true;
    loadAll()
      .then((data) => alive && setState({ data, error: null }))
      .catch((e) => alive && setState({ data: null, error: e.message }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
