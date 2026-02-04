import './style.css';
import { P2PNetwork } from './P2PNetwork';
import { PeerSession } from './PeerSession';
import * as jdenticon from 'jdenticon';
import { Vault } from './lib/vault';

declare global {
  interface Window {
    moliAPI: {
      connect: () => { status: string; id: string };
      upload: (blob: Blob, name?: string) => Promise<{ success: boolean; reason?: string }>;
      getLatestImages: () => { id: string; hash: string; caption?: string; timestamp: number }[];
      getPublicKey: () => string | null;
      getImageContent: (hash: string) => Promise<string | null>;
    };
  }
}

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div id="app-container">
    <div class="glass-panel header-compact">
      <div class="header-row-primary">
        <div>
        <h1 style="margin:0; line-height:1.2;">Moli P2P</h1>
          <p style="margin:2px 0 0 0; opacity: 0.7; font-size: 0.8rem;">
            Autonomous Distributed Gallery <span id="peer-count" class="peer-count" style="font-size:0.8em">...</span>
          </p>
        </div>

        <div class="identity-section">
          <span id="my-id-icon" class="id-icon"></span>
          <span id="my-id" class="id-text">...</span>
          <button id="id-burn-btn" class="burn-tiny-btn">🔥</button>
          <button id="help-btn" class="help-btn" title="Manual / Help">?</button>
        </div>
      </div>

      <div class="header-row-secondary">
        <div class="stats-group">
          <div id="buffer-indicator" class="buffer-indicator">
            <span>PENDING</span>
            <span id="buffer-count" class="buffer-count">0</span>
          </div>
          <span style="font-size: 0.8em; opacity: 0.5; margin-left: 10px;">
            <span id="discovered-count">0</span> Items
          </span>
        </div>

        <div class="controls-group">
          <div class="ticker-controls-compact">
            <button id="ticker-pause" class="ticker-btn">Pause</button>
            <input type="range" id="speed-slider" class="speed-slider" min="500" max="5000" step="500" value="2000" title="Speed" />
          </div>
          <button id="broadcast-soul-btn" class="broadcast-compact-btn">✨ Broadcast</button>
        </div>
      </div>
    </div>

      <div id="gallery"></div>

      <div id="debug-container" class="collapsed">
        <div class="debug-header" id="debug-toggle">System Logs (Click to toggle)</div>
        <div id="debug-log"></div>
      </div>

      <div id="toast-container"></div>
      <div id="lightbox" class="lightbox"></div>
    </div>
  `;

const discoveredCountSpan = document.getElementById('discovered-count')!;
const lightbox = document.getElementById('lightbox')!;
const debugContainer = document.getElementById('debug-container')!;
const debugToggle = document.getElementById('debug-toggle')!;

debugToggle.onclick = () => debugContainer.classList.toggle('collapsed');

lightbox.onclick = () => {
  lightbox.style.display = 'none';
  lightbox.innerHTML = '';
};

function showToast(message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
  const container = document.getElementById('toast-container')!;
  const toast = document.createElement('div');
  toast.className = `toast ${type} `;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

const myIdSpan = document.getElementById('my-id')!;
const myIdIcon = document.getElementById('my-id-icon')!;
const peerCountSpan = document.getElementById('peer-count')!;
const gallery = document.getElementById('gallery')!;
const debugLog = document.getElementById('debug-log')!;

// Override Console Log
function logToScreen(msg: string, color: string = '#0f0') {
  const line = document.createElement('div');
  line.style.color = color;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg} `;
  debugLog.appendChild(line);
  debugLog.scrollTop = debugLog.scrollHeight;
}

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => {
  originalLog(...args);
  logToScreen(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), '#0f0');
};
console.warn = (...args) => {
  originalWarn(...args);
  logToScreen(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), '#ff0');
};
console.error = (...args) => {
  originalError(...args);
  logToScreen(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), '#f00');
};

// --- Blacklist Logic ---
const BLACKLIST_DB_NAME = 'moli_blacklist_db';
const BLACKLIST_STORE = 'hashes';

async function initBlacklist(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.open(BLACKLIST_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(BLACKLIST_STORE);
    };
    request.onsuccess = async () => {
      const db = request.result;
      const tx = db.transaction(BLACKLIST_STORE, 'readonly');
      const store = tx.objectStore(BLACKLIST_STORE);
      const requestAll = store.getAllKeys();
      requestAll.onsuccess = () => {
        const hashes = requestAll.result as string[];
        hashes.forEach(h => network.addToBlacklist(h));
        console.log(`[Blacklist] Loaded ${hashes.length} persistent burn items.`);
        resolve();
      };
    };
    request.onerror = () => resolve();
  });
}

// Vault Initialization & Loading
async function initVaultAndLoad(): Promise<void> {
  await Vault.init();
  const pinnedItems = await Vault.loadAll();

  if (pinnedItems.length > 0) {
    console.log(`[Vault] Restoring ${pinnedItems.length} pinned souls...`);
    for (const item of pinnedItems) {
      // Check if already exists (e.g. from network or upload just now)
      if (!imageStore.some(i => i.hash === item.hash)) {
        await addImageToGallery(
          item.blob,
          true, // isLocal=true (We possess this)
          undefined, // no remote peer
          true, // isPinned=true (It's from the Vault)
          item.name,
        );
      }
    }
  }
}

async function persistToBlacklist(hash: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.open(BLACKLIST_DB_NAME, 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(BLACKLIST_STORE, 'readwrite');
      const store = tx.objectStore(BLACKLIST_STORE);
      store.put(true, hash);
      tx.oncomplete = () => resolve();
    };
  });
}

function removeImageFromGallery(hash: string) {
  const items = imageStore.filter(i => i.hash === hash);
  items.forEach(item => {
    const index = imageStore.findIndex(i => i.id === item.id);
    if (index > -1) {
      if (gallery.contains(item.element)) {
        gallery.removeChild(item.element);
      }
      URL.revokeObjectURL(item.url);
      imageStore.splice(index, 1);
    }
  });
}

interface ImageItem {
  id: string;
  hash: string;
  url: string;
  isPinned: boolean;
  isLocal: boolean;
  timestamp: number;
  element: HTMLElement;
  holderBadge: HTMLElement;
  caption?: string;
}

const imageStore: ImageItem[] = [];
const holderMap = new Map<string, Set<string>>(); // hash -> Set of peerIds
const MAX_IMAGES = 50;
// const IS_DEBUG_MATURATION = true;

const renderQueue: ImageItem[] = [];
// const dHashStore = new Set<string>(); // Removed: Aesthetic Filter

let isPaused = false;
let renderInterval = 2000;
let tickerTimeout: ReturnType<typeof setTimeout> | null = null;

const bufferIndicator = document.getElementById('buffer-indicator')!;
const bufferCountSpan = document.getElementById('buffer-count')!;
const tickerPauseBtn = document.getElementById('ticker-pause') as HTMLButtonElement;
const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
const speedValueSpan = document.getElementById('speed-value')!;

async function hashBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}



async function checkImageHealth(blob: Blob): Promise<{ ok: boolean; reason?: string; }> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;

  return new Promise((resolve) => {
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Relaxed Filter: Allow any valid image > 0px (Pixel Art Support)
      if (img.width === 0 || img.height === 0) {
        return resolve({ ok: false, reason: "Invalid dimensions (0px)" });
      }

      resolve({ ok: true });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ ok: false, reason: "Invalid image" });
    };
  });
}

function getPeerColor(peerId: string): string {
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) {
    hash = peerId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 70 %, 60 %)`;
}

function updateBufferUI() {
  bufferCountSpan.textContent = renderQueue.length.toString();
  if (renderQueue.length > 0) {
    bufferIndicator.classList.add('visible');
  } else {
    bufferIndicator.classList.remove('visible');
  }
}

function processTicker() {
  if (tickerTimeout) clearTimeout(tickerTimeout);

  if (!isPaused && renderQueue.length > 0) {
    const nextItem = renderQueue.shift()!;
    gallery.appendChild(nextItem.element);
    updateBufferUI();
    updateDecayUI();
  }

  tickerTimeout = setTimeout(processTicker, renderInterval);
}

processTicker();

tickerPauseBtn.onclick = () => {
  isPaused = !isPaused;
  tickerPauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
  tickerPauseBtn.classList.toggle('active', isPaused);
};

speedSlider.oninput = () => {
  renderInterval = parseInt(speedSlider.value);
  speedValueSpan.textContent = `${(renderInterval / 1000).toFixed(1)} s`;
};

function updateDecayUI() {
  const sorted = [...imageStore].sort((a, b) => a.timestamp - b.timestamp);
  const total = imageStore.length;
  imageStore.forEach(item => {
    item.element.classList.remove('decay-stage-1', 'decay-stage-2', 'decay-stage-3');
    if (item.isPinned) return;
    const ageIndex = sorted.indexOf(item);
    const positionFromOldest = ageIndex;
    const totalCount = total;

    if (totalCount >= 7 && positionFromOldest === 0) {
      if (totalCount === 7) item.element.classList.add('decay-stage-1');
      else if (totalCount === 8) item.element.classList.add('decay-stage-2');
      else if (totalCount >= 9) item.element.classList.add('decay-stage-3');
    } else if (totalCount >= 8 && positionFromOldest === 1) {
      if (totalCount === 8) item.element.classList.add('decay-stage-1');
      else if (totalCount >= 9) item.element.classList.add('decay-stage-2');
    } else if (totalCount >= 9 && positionFromOldest === 2) {
      item.element.classList.add('decay-stage-1');
    }
  });
}

function updateHolderUI(hash: string) {
  const item = imageStore.find(i => i.hash === hash);
  if (item) {
    const peers = holderMap.get(hash);
    const count = (peers ? peers.size : 0) + 1;
    item.holderBadge.textContent = `👤 ${count} `;
    item.holderBadge.style.display = 'block';
    item.holderBadge.style.background = count > 1 ? 'rgba(0, 200, 0, 0.8)' : 'rgba(0, 0, 0, 0.6)';
    let shadows = [];
    if (item.isPinned) {
      shadows.push('0 0 10px #ffd700');
      item.element.style.borderColor = '#ffd700';
    } else {
      item.element.style.borderColor = item.isLocal ? 'blue' : '#ccc';
    }
    if (count > 1) {
      const glowOpacity = Math.min(0.1 + (count * 0.05), 0.6);
      const blurRadius = item.isPinned ? 25 : 15;
      shadows.push(`0 0 ${blurRadius}px rgba(0, 255, 0, ${glowOpacity})`);
      item.element.style.zIndex = '5';
    } else {
      item.element.style.zIndex = '1';
    }
    item.element.style.boxShadow = shadows.join(', ');
    updateDecayUI();
  }
}

async function addImageToGallery(blob: Blob, isLocal: boolean, remotePeerId?: string, isPinned: boolean = false, name?: string) {
  const hash = await hashBlob(blob);

  // 0. Guard: Blacklist Check
  if (network.isBlacklisted(hash)) {
    console.warn(`[Guard] Blocked blacklisted content: ${hash} `);
    if (remotePeerId) releaseDownloadSlot();
    return;
  }

  if (remotePeerId) {
    if (!holderMap.has(hash)) holderMap.set(hash, new Set());
    holderMap.get(hash)!.add(remotePeerId);
  }

  const existing = imageStore.find(i => i.hash === hash);
  if (existing) {
    if (name && !existing.caption) existing.caption = name;
    if (isPinned && !existing.isPinned) {
      console.log(`[Bridge] Image ${hash.substring(0, 8)} promoted to Pinned by ${remotePeerId} `);
      existing.isPinned = true;
      updateHolderUI(hash);

    } else {
      console.log(`Deduplicated image: ${hash.substring(0, 8)} `);
    }
    updateHolderUI(hash);
    if (remotePeerId) releaseDownloadSlot();
    return;
  }

  const health = await checkImageHealth(blob);
  if (!health.ok) {
    console.warn(`[Gatekeeper] REJECTED: ${health.reason} `);
    if (isLocal) showToast(`Rejected: ${health.reason} `, 'warn');
    if (remotePeerId) releaseDownloadSlot();
    return;
  }



  const id = Math.random().toString(36).substring(2, 11);
  const url = URL.createObjectURL(blob);
  const timestamp = Date.now();

  const container = document.createElement('div');
  container.className = 'gallery-item';
  const img = document.createElement('img');
  img.src = url;

  // Smart Pixelation: Use pixelated rendering ONLY for small images (likely pixel art)
  // This prevents blurring on pixel art, while keeping high-res photos smooth (avoiding aliasing).
  img.onload = () => {
    if (img.naturalWidth < 128 || img.naturalHeight < 128) {
      img.style.imageRendering = 'pixelated';
    }
  };

  // Safety by Default: Apply blur initially (unless Pinned locally)
  // Pinning implies "I checked this and want to keep it", so we trust pinned items.
  if (!isPinned) {
    img.classList.add('blurred');
    img.title = "Safety Filter: Click to Reveal";
  }

  // Click to Reveal OR Open Lightbox
  container.onclick = (e) => {
    e.stopPropagation();

    // If blurred, first click just unblurs (Safety Reveal)
    if (img.classList.contains('blurred')) {
      img.classList.remove('blurred');
      img.title = ""; // Remove tooltip
      return;
    }

    // Normal behavior: Open Lightbox
    lightbox.style.display = 'flex';
    lightbox.innerHTML = '';
    const lbImg = document.createElement('img');
    lbImg.src = url;
    lightbox.appendChild(lbImg);
  };

  const windmill = document.createElement('div');
  windmill.className = 'windmill-static';

  // Receipt Verification (New in v1.2)
  // function verifyGatewaySignature removed
  // The windmill will always be static now, as there's no verification.
  windmill.innerHTML = `
  <svg viewBox="0 0 100 100" width="32" height="32" style="width: 32px; height: 32px;">
    <path d="M48 95 L52 95 L52 50 L48 50 Z" fill="rgba(255,255,255,0.2)" />
    <g>
      <path d="M50 50 L50 10 L65 10 L65 45 Z" fill="currentColor" />
      <path d="M50 50 L90 50 L90 65 L55 65 Z" fill="currentColor" />
      <path d="M50 50 L50 90 L35 90 L35 55 Z" fill="currentColor" />
      <path d="M50 50 L10 50 L10 35 L45 35 Z" fill="currentColor" />
    </g>
    <circle cx="50" cy="50" r="5" fill="currentColor" />
  </svg>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'card-overlay';

  const label = document.createElement('div');
  label.style.fontSize = '12px';
  label.style.marginBottom = '5px';
  label.textContent = isLocal ? 'Original Soul' : 'Shared Soul';

  const actionRow = document.createElement('div');
  actionRow.className = 'action-row';

  const holderBadge = document.createElement('div');
  holderBadge.className = 'holder-badge';
  holderBadge.style.display = 'none';

  const pinBtn = document.createElement('button');
  pinBtn.className = 'pin-btn';
  pinBtn.textContent = 'Pin';
  pinBtn.onclick = (e) => {
    e.stopPropagation();
    const item = imageStore.find(i => i.id === id);
    if (item) {
      item.isPinned = !item.isPinned;
      pinBtn.textContent = item.isPinned ? 'Unpin' : 'Pin';
      pinBtn.classList.toggle('pinned', item.isPinned);

      // Vault Persistence
      if (item.isPinned) {
        fetch(item.url).then(r => r.blob()).then(blob => {
          const receiptRaw = localStorage.getItem(`moli_receipt_${item.hash} `);
          const receipt = receiptRaw ? JSON.parse(receiptRaw) : undefined; // Receipt might already be on item object if loaded from vault, but let's check LS too or pass existing.
          // Actually, verifyReceipt logic puts it in LS. Let's use that or what we have.
          Vault.save({
            hash: item.hash,
            blob,
            name: item.caption || 'Soul',
            size: blob.size,
            mime: blob.type,
            timestamp: item.timestamp,
            receipt: receipt
          });
        });
      } else {
        Vault.remove(item.hash);
      }

      updateHolderUI(hash);
      // Re-broadcast with Pinned status and Tribute Receipt
      fetch(item.url).then(r => r.blob()).then(blob => {
        network.broadcastImage(blob, item.hash, item.isPinned, item.caption);
      });
    }
  };

  const burnActionBtn = document.createElement('button');
  burnActionBtn.className = 'burn-action-btn';
  burnActionBtn.textContent = '🔥 Burn';
  burnActionBtn.title = 'Signal malicious content (requires 24h ID age)';
  burnActionBtn.onclick = async (e) => {
    e.stopPropagation();
    const MATURE_AGE = 24 * 60 * 60 * 1000; // Production: 24 hours
    if (Date.now() - network.identity.createdAt < MATURE_AGE) {
      showToast("Identity too infant to burn mesh content (Needs 24h)", "warn");
      return;
    }
    if (confirm('CONFIRMATION: Are you sure you want to BURN this soul? This action broadcasts a block signal to the mesh and cannot be undone.')) {
      await network.broadcastBurn(hash);
      await persistToBlacklist(hash);
      removeImageFromGallery(hash);
      Vault.remove(hash);
      showToast("Content burned and signaled.", "success");
    }
  };

  const removeActionBtn = document.createElement('button');
  removeActionBtn.className = 'remove-action-btn';
  removeActionBtn.textContent = '🗑️'; // Icon only for space
  removeActionBtn.title = 'Remove local copy only (No broadcast)';
  removeActionBtn.style.marginLeft = '4px';
  removeActionBtn.style.padding = '2px 6px';
  removeActionBtn.style.fontSize = '0.8rem';
  removeActionBtn.style.background = 'rgba(255, 255, 255, 0.1)';
  removeActionBtn.style.border = 'none';
  removeActionBtn.style.borderRadius = '4px';
  removeActionBtn.style.cursor = 'pointer';
  removeActionBtn.style.color = '#fff';

  removeActionBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm('Remove this image from your local view?')) {
      removeImageFromGallery(hash);
      Vault.remove(hash);
      showToast("Image removed locally.", "success");
    }
  };

  overlay.appendChild(label);
  overlay.appendChild(actionRow);
  actionRow.appendChild(holderBadge);
  actionRow.appendChild(pinBtn);
  actionRow.appendChild(burnActionBtn);
  actionRow.appendChild(removeActionBtn);



  container.appendChild(img);
  container.appendChild(windmill);
  container.appendChild(overlay);

  const newItem: ImageItem = { id, hash, url, isPinned, isLocal, timestamp, element: container, holderBadge, caption: name };
  imageStore.push(newItem);

  renderQueue.push(newItem);
  updateBufferUI();
  updateHolderUI(hash);
  checkEviction();
  shareInventory();

  if (remotePeerId) releaseDownloadSlot();


}





const MAX_CONCURRENT_DOWNLOADS = 3;
let activeDownloadCount = 0;
const downloadQueue: { session: PeerSession; transferId: string; meta: any }[] = [];

function processDownloadQueue() {
  if (activeDownloadCount >= MAX_CONCURRENT_DOWNLOADS || downloadQueue.length === 0) return;
  while (activeDownloadCount < MAX_CONCURRENT_DOWNLOADS && downloadQueue.length > 0) {
    const task = downloadQueue.shift()!;
    activeDownloadCount++;
    console.log(`[Scheduler] PULLING ${task.meta.name} from ${task.session.peerId} `);
    task.session.pullFile(task.transferId);
  }
}

function releaseDownloadSlot() {
  activeDownloadCount = Math.max(0, activeDownloadCount - 1);
  processDownloadQueue();
}

function shareInventory() {
  const hashes = imageStore.map(i => i.hash);
  network.sessions.forEach((s: PeerSession) => {
    if (s.isConnected) s.sendInventory(hashes);
  });
}

function checkEviction() {
  if (imageStore.length <= MAX_IMAGES) return;
  const unpinned = imageStore.filter(i => !i.isPinned).sort((a, b) => a.timestamp - b.timestamp);
  if (unpinned.length > 0) {
    const toRemove = unpinned[0];
    const index = imageStore.findIndex(i => i.id === toRemove.id);
    if (index > -1) {
      if (gallery.contains(toRemove.element)) gallery.removeChild(toRemove.element);
      URL.revokeObjectURL(toRemove.url);
      imageStore.splice(index, 1);
      if (imageStore.length > MAX_IMAGES) checkEviction();
    }
  }
}

const network = new P2PNetwork(
  async (blob: Blob, peerId: string, _isPinned?: boolean, _publicKey?: string, name?: string) => {
    // Sovereign Safety: Incoming images are untrusted (unpinned) by default, forcing the Blur.
    addImageToGallery(blob, false, peerId, false, name);
  },
  (session: PeerSession) => {
    console.log(`[Sync] Handshake with ${session.peerId}. Sending ${imageStore.length} images.`);
    // Send pinned first, then others
    const sorted = [...imageStore].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

    sorted.forEach(item => {
      fetch(item.url).then(r => r.blob()).then(blob => {
        session.sendImage(blob, item.hash, item.isPinned, item.caption);
      });
    });
  },
  (count: number) => {
    peerCountSpan.textContent = count.toString();
    discoveredCountSpan.textContent = network.sessions.size.toString();
  }
);

network.setBurnCallback(async (hash) => {
  // Sovereign Immunity: We do NOT remove images based on external signals.
  // We only show a toast that someone flagged it.
  console.log(`[Burn] Advisory Signal for ${hash}`);
  // removeImageFromGallery(hash); // <--- DISABLED
  // await persistToBlacklist(hash); // <--- DISABLED
  showToast("Peer Flagged Content (Advisory Only)", "info");
});

network.setInventoryCallback((peerId, hashes) => {
  hashes.forEach(hash => {
    if (!holderMap.has(hash)) holderMap.set(hash, new Set());
    holderMap.get(hash)!.add(peerId);
    updateHolderUI(hash);
  });
});

network.setOfferFileCallback((session, data) => {
  downloadQueue.push({ session, transferId: data.transferId, meta: data });
  processDownloadQueue();
});

// Infant Check Helper
const isInfant = () => (Date.now() - network.identity.createdAt) < (0);

async function processLocalUpload(file: Blob, _name: string = 'image.png'): Promise<{ success: boolean; reason?: string }> {
  // 1. Infant Restrictions
  if (isInfant()) {
    const LAST_UPLOAD_KEY = 'moli_last_upload';
    const now = Date.now();
    const lastUpload = parseInt(localStorage.getItem(LAST_UPLOAD_KEY) || '0');

    // A. Rate Limit (10 mins)
    if (now - lastUpload < 10 * 60 * 1000) {
      const wait = Math.ceil((10 * 60 * 1000 - (now - lastUpload)) / 60000);
      showToast(`Infant Identity Rate Limit: Please wait ${wait} mins.`, 'warn');
      return { success: false, reason: "Rate Limit" };
    }



    localStorage.setItem(LAST_UPLOAD_KEY, now.toString());
  }

  // Normal Flow ...
  const healthCheck = await checkImageHealth(file);
  if (!healthCheck.ok) {
    showToast(`Rejected: ${healthCheck.reason} `, 'warn');
    return { success: false, reason: healthCheck.reason };
  }
  const hash = await hashBlob(file);

  // Auto-Self-Pin: User-uploaded content is precious "Original Soul"
  // We automatically pin it to the Vault so it survives restarts.
  await Vault.save({
    hash,
    blob: file, // Use the original file blob
    name: _name || 'Original Soul',
    size: file.size,
    mime: file.type,
    timestamp: Date.now(),
  }).then(() => {
    console.log(`[Vault] Auto - pinned original upload: ${hash.slice(0, 8)} `);
    addImageToGallery(file, true, undefined, true, _name); // isPinned=true
  });

  shareInventory();
  network.broadcastImage(file, hash, false, _name);
  showToast("Broadcasted successfuly!", "success");
  return { success: true };
}

const broadcastSoulBtn = document.getElementById('broadcast-soul-btn') as HTMLButtonElement;
broadcastSoulBtn.onclick = () => showUploadModal();

async function showUploadModal() {
  lightbox.style.display = 'flex';
  lightbox.innerHTML = `
    <div class="upload-modal" onclick="event.stopPropagation()">
      <h2 style="margin-top:0; background: linear-gradient(to right, #fff, #646cff); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;">Broadcast Your Soul</h2>
      <div id="drop-zone" class="drop-zone">
        <p>Drag & Drop Artwork or Click to Select</p>
        <input type="file" id="modal-file-input" accept="image/*" style="display:none" />
        <div id="upload-preview-container" style="display:none; text-align:center;">
          <img id="upload-preview" class="upload-preview-img" />
        </div>
      </div>
      <div class="modal-input-group">
        <button id="broadcast-final-btn" class="broadcast-final-btn" disabled>Broadcast to Mesh</button>
        <button id="cancel-modal-btn" class="cancel-modal-btn">Cancel</button>
      </div>
    </div>
  `;

  const dropZone = document.getElementById('drop-zone')!;
  const modalFileInput = document.getElementById('modal-file-input') as HTMLInputElement;
  const previewContainer = document.getElementById('upload-preview-container')!;
  const previewImg = document.getElementById('upload-preview') as HTMLImageElement;
  const broadcastBtn = document.getElementById('broadcast-final-btn') as HTMLButtonElement;
  const cancelBtn = document.getElementById('cancel-modal-btn') as HTMLButtonElement;

  let selectedFile: File | null = null;
  // let currentManifest: any = null; // Unused

  cancelBtn.onclick = () => {
    lightbox.style.display = 'none';
    lightbox.innerHTML = '';
  };

  dropZone.onclick = () => modalFileInput.click();
  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
  dropZone.ondragleave = () => dropZone.classList.remove('dragover');
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer?.files[0]) handleFileSelection(e.dataTransfer.files[0]);
  };

  modalFileInput.onchange = () => {
    if (modalFileInput.files?.[0]) handleFileSelection(modalFileInput.files[0]);
  };

  function handleFileSelection(file: File) {
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target?.result as string;
      previewContainer.style.display = 'block';
      dropZone.style.display = 'none';
      validateForm();
    };
    reader.readAsDataURL(file);
  }

  function validateForm() {
    broadcastBtn.disabled = !selectedFile;
  }

  broadcastBtn.onclick = async () => {
    if (!selectedFile) return;
    broadcastBtn.disabled = true;
    broadcastBtn.textContent = "Broadcasting Soul...";

    const result = await processLocalUpload(selectedFile, selectedFile.name);

    if (result.success) {
      lightbox.style.display = 'none';
      lightbox.innerHTML = '';
      selectedFile = null;
      dropZone.classList.remove('dragover');
      dropZone.style.display = 'block';
      previewContainer.style.display = 'none';
      previewImg.src = '';
    } else {
      broadcastBtn.disabled = false;
      broadcastBtn.textContent = "Broadcast to Mesh";
    }
  };
}

// --- Startup Sequence ---
(async () => {
  try {
    await initBlacklist();
    await initVaultAndLoad();
  } catch (err: any) {
    console.error("Startup Warning:", err);
    showToast(`Startup Partial: ${err.message || err}`, 'warn');
  }
})();


function showHelpModal() {
  lightbox.style.display = 'flex';
  lightbox.innerHTML = `
    <div class="help-modal" onclick="event.stopPropagation()">
      <h2>Moli P2P Manual</h2>
      <p style="opacity: 0.7; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 15px;">
        Welcome to the Autonomous Distributed Gallery. This is a ephemeral mesh network where content exists only as long as someone holds it.
      </p>

      <div class="help-section">
        <h3>🌱 Identity & Maturation</h3>
        <p>
          New identities start as <strong>Infant</strong>. To prevent spam, infants have restricted capabilities (rate limits, no burning).
          <br><br>
          <strong>Maturation Time:</strong> 24 Hours.
          <br>
          Once mature, you become a <strong>Sovereign Soul</strong> with full rights to Burn content.
        </p>
      </div>

      <div class="help-section">
        <h3>🎨 Actions</h3>
        <p style="margin-bottom: 10px;"><strong>📌 Pin (Save)</strong><br>
        Saves a copy of the soul (image) to your local Vault. Pinned items are automatically re-broadcasted when you rejoin the mesh.</p>

        <p style="margin-bottom: 10px;"><strong>✨ Broadcast</strong><br>
        Uploads a new soul to the mesh. It propagates to connected peers immediately.</p>
      </div>

      <div class="help-section">
        <h3>🛡️ Safety & Moderation</h3>
        <p>
          <strong>🔥 Burn Protocol:</strong>
          If you encounter malicious content, you can <strong>Burn</strong> it. This broadcasts a block signal to the mesh.
          <br>
          <em>(Requires Sovereign Identity)</em>
        </p>
        <p style="margin-top: 10px;">
          <strong>🗑️ Remove (Local):</strong>
          Use the trash icon to remove an item from your view without signaling the network.
        </p>
      </div>

      <button id="close-help-btn" style="width: 100%; margin-top: 2rem;">Close Manual</button>
    </div>
  `;

  document.getElementById('close-help-btn')!.onclick = () => {
    lightbox.style.display = 'none';
    lightbox.innerHTML = '';
  };
}

const helpBtn = document.getElementById('help-btn') as HTMLButtonElement;
if (helpBtn) helpBtn.onclick = showHelpModal;

window.moliAPI = {
  connect: () => ({ status: network.connectedPeerCount > 0 ? 'connected' : 'searching', id: network.myId }),
  upload: async (blob: Blob, name?: string) => await processLocalUpload(blob, name),
  getLatestImages: () => imageStore.map(i => ({ id: i.id, hash: i.hash, caption: i.caption, timestamp: i.timestamp })),
  getPublicKey: () => network.identity.publicKeySpki ? btoa(String.fromCharCode(...new Uint8Array(network.identity.publicKeySpki))) : null,
  getImageContent: async (hash: string) => {
    const item = imageStore.find(i => i.hash === hash);
    if (!item) return null;
    const response = await fetch(item.url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob);
    });
  }
};


// Immediate fail-safe listener for Burn Button (works even if init hangs)
const idBurnBtn = document.getElementById('id-burn-btn') as HTMLButtonElement;
if (idBurnBtn) {
  idBurnBtn.onclick = () => {
    if (confirm('DANGER: You are about to destroy your Identity and Reputation. This cannot be undone.\n\nAre you sure you want to proceed?')) {
      // Direct DB deletion attempt relative to window context if network object is stuck
      const DB_NAME = 'moli_id_db';
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => window.location.reload();
      req.onerror = () => window.location.reload();
      // Also try the class method if available
      try { network.identity.burn(); } catch (e) { }
    }
  };
}

(async () => {
  try {
    // Timeout wrapper for initialization
    const initPromise = network.init();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Network Initialization Timed Out")), 15000)
    );

    await Promise.race([initPromise, timeoutPromise]);

    await initBlacklist();
    await initVaultAndLoad();

    myIdSpan.textContent = network.myId;
    myIdSpan.title = `My Identity: ${network.myId} `;
    myIdSpan.style.color = getPeerColor(network.myId);
    myIdIcon.innerHTML = jdenticon.toSvg(network.myId, 20);
    showToast(`Sovereign Soul Ready: ${network.myId.substring(0, 8)} `, 'success');



  } catch (err: any) {
    console.error("FATAL INITIALIZATION ERROR:", err);

    showToast(`Startup Failed: ${err.message || err}. Try Burning Identity.`, 'error');
  }

})();
