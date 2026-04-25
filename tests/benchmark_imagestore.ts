// Benchmark to measure performance of array reassignment vs spread push

const ITEM_COUNT = 100000;
const ITERATIONS = 100;

function runSpreadPushBenchmark() {
  console.log(`\n--- Running Spread Push Benchmark (${ITERATIONS} iterations, ${ITEM_COUNT} items) ---`);
  const times: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const arr = Array.from({ length: ITEM_COUNT }, (_, i) => ({ id: i, hash: `hash-${i}` }));
    const hashToRemove = `hash-${Math.floor(ITEM_COUNT / 2)}`;

    const start = performance.now();

    const filteredStore = arr.filter(item => item.hash !== hashToRemove);
    arr.length = 0;
    arr.push(...filteredStore);

    const end = performance.now();
    times.push(end - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`Average time: ${avg.toFixed(4)} ms`);
  return avg;
}

function runReassignmentBenchmark() {
  console.log(`\n--- Running Reassignment Benchmark (${ITERATIONS} iterations, ${ITEM_COUNT} items) ---`);
  const times: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    let arr = Array.from({ length: ITEM_COUNT }, (_, i) => ({ id: i, hash: `hash-${i}` }));
    const hashToRemove = `hash-${Math.floor(ITEM_COUNT / 2)}`;

    const start = performance.now();

    const filteredStore = arr.filter(item => item.hash !== hashToRemove);
    arr = filteredStore; // Reassignment

    const end = performance.now();
    times.push(end - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`Average time: ${avg.toFixed(4)} ms`);
  return avg;
}

try {
  const spreadTime = runSpreadPushBenchmark();
  const reassignTime = runReassignmentBenchmark();

  console.log(`\n=== RESULTS ===`);
  console.log(`Spread Push: ${spreadTime.toFixed(4)} ms`);
  console.log(`Reassignment: ${reassignTime.toFixed(4)} ms`);
  console.log(`Improvement: ${((spreadTime - reassignTime) / spreadTime * 100).toFixed(2)}% faster`);
  console.log(`Speedup: ${(spreadTime / reassignTime).toFixed(2)}x faster`);
} catch (e) {
  console.error("Error during benchmark:", e);
}
