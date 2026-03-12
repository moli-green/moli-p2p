const iterations = 1000000;
const items = [];
for(let i = 0; i < 50; i++) {
  items.push({ id: `id_${i}`, hash: `hash_${i}`, data: `data_${i}` });
}

// Baseline: Array.find
let startTime = performance.now();
let found = null;
for(let i = 0; i < iterations; i++) {
  found = items.find(item => item.hash === 'hash_49');
}
let baselineTime = performance.now() - startTime;
console.log(`Baseline (Array.find): ${baselineTime.toFixed(2)} ms`);

// Optimized: Map.get
const map = new Map();
items.forEach(item => map.set(item.hash, item));

startTime = performance.now();
for(let i = 0; i < iterations; i++) {
  found = map.get('hash_49');
}
let optimizedTime = performance.now() - startTime;
console.log(`Optimized (Map.get): ${optimizedTime.toFixed(2)} ms`);
console.log(`Improvement: ${(baselineTime / optimizedTime).toFixed(2)}x faster`);
