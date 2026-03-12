const buf = new Uint8Array(32);
crypto.getRandomValues(buf);

const hashBuffer = buf.buffer;

function oldWay(hashBuffer: ArrayBuffer) {
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const HEX_STRINGS = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
function newWay(hashBuffer: ArrayBuffer) {
    const uint8Array = new Uint8Array(hashBuffer);
    let hash = '';
    for (let i = 0; i < uint8Array.length; i++) {
        hash += HEX_STRINGS[uint8Array[i]];
    }
    return hash;
}

// Warmup
for (let i = 0; i < 10000; i++) {
    oldWay(hashBuffer);
    newWay(hashBuffer);
}

const ITERATIONS = 100000;

const startOld = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    oldWay(hashBuffer);
}
const endOld = performance.now();
const oldTime = endOld - startOld;

const startNew = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    newWay(hashBuffer);
}
const endNew = performance.now();
const newTime = endNew - startNew;

console.log(`Array.from().map().join('') (Old): ${oldTime.toFixed(2)} ms`);
console.log(`Lookup table (New): ${newTime.toFixed(2)} ms`);
console.log(`Improvement: ${((oldTime - newTime) / oldTime * 100).toFixed(2)}% (${(oldTime / newTime).toFixed(2)}x faster)`);
