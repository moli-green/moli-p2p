import { test, expect } from "bun:test";

test("benchmark cached array vs uncached max 50 items", () => {
  const map = new Map();
  for (let i = 0; i < 50; i++) {
    map.set(i.toString(), i);
  }

  const startUncached = performance.now();
  for (let i = 0; i < 10000; i++) {
    const keys = Array.from(map.keys());
  }
  const endUncached = performance.now();
  const timeUncached = endUncached - startUncached;

  let cached: string[] | null = null;
  const startCached = performance.now();
  for (let i = 0; i < 10000; i++) {
    if (cached === null) {
      cached = Array.from(map.keys());
    }
    const keys = cached;
  }
  const endCached = performance.now();
  const timeCached = endCached - startCached;

  console.log(`Uncached Time: ${timeUncached.toFixed(2)}ms`);
  console.log(`Cached Time: ${timeCached.toFixed(2)}ms`);
  console.log(`Improvement: ${(timeUncached / timeCached).toFixed(2)}x`);
});
