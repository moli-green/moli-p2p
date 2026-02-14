import './style.css';
import { P2PNetwork } from './P2PNetwork';
import { PeerSession } from './PeerSession';
import * as jdenticon from 'jdenticon';
import { Vault } from './lib/vault';
import {
  RENDER_INTERVAL_MS,
  MAX_GALLERY_ITEMS,
  TOAST_DURATION_MS,
  NETWORK_TIMEOUT_MS,
  GOSSIP_TTL
} from './constants';

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

// --- 1. App Shell Construction (DOM API) ---
const appContainer = document.createElement('div');
appContainer.id = 'app-container';

// -- Header --
const glassPanel = document.createElement('div');
glassPanel.className = 'glass-panel header-compact';

const headerRowPrimary = document.createElement('div');
headerRowPrimary.className = 'header-row-primary';

const titleGroup = document.createElement('div');
const h1 = document.createElement('h1');
h1.style.margin = '0';
h1.style.lineHeight = '1.2';
h1.textContent = 'Moli P2P';

const pSubtitle = document.createElement('p');
pSubtitle.style.margin = '2px 0 0 0';
pSubtitle.style.opacity = '0.7';
pSubtitle.style.fontSize = '0.8rem';
pSubtitle.appendChild(document.createTextNode('Autonomous Distributed Gallery '));
const peerCountSpan = document.createElement('span');
peerCountSpan.id = 'peer-count';
peerCountSpan.className = 'peer-count';
peerCountSpan.style.fontSize = '0.8em';
peerCountSpan.textContent = '...';
// Reverted: peerCountSpan.title (Tooltip removed)
pSubtitle.appendChild(peerCountSpan);
titleGroup.appendChild(h1);
titleGroup.appendChild(pSubtitle);

const identitySection = document.createElement('div');
identitySection.className = 'identity-section';
const myIdIcon = document.createElement('span');
myIdIcon.id = 'my-id-icon';
myIdIcon.className = 'id-icon';
const myIdSpan = document.createElement('span');
myIdSpan.id = 'my-id';
myIdSpan.className = 'id-text';
myIdSpan.textContent = '...';
const idBurnBtn = document.createElement('button');
idBurnBtn.id = 'id-burn-btn';
idBurnBtn.className = 'burn-tiny-btn';
idBurnBtn.textContent = '🔥';
const helpBtn = document.createElement('button');
helpBtn.id = 'help-btn';
helpBtn.className = 'help-btn';
helpBtn.title = 'Manual / Help';
helpBtn.textContent = '?';
identitySection.appendChild(myIdIcon);
identitySection.appendChild(myIdSpan);
identitySection.appendChild(idBurnBtn);
identitySection.appendChild(helpBtn);

headerRowPrimary.appendChild(titleGroup);
headerRowPrimary.appendChild(identitySection);

const headerRowSecondary = document.createElement('div');
headerRowSecondary.className = 'header-row-secondary';

const statsGroup = document.createElement('div');
statsGroup.className = 'stats-group';
const bufferIndicator = document.createElement('div');
bufferIndicator.id = 'buffer-indicator';
bufferIndicator.className = 'buffer-indicator';
const pendingSpan = document.createElement('span');
pendingSpan.textContent = 'PENDING';
const bufferCountSpan = document.createElement('span');
bufferCountSpan.id = 'buffer-count';
bufferCountSpan.className = 'buffer-count';
bufferCountSpan.textContent = '0';
bufferIndicator.appendChild(pendingSpan);
bufferIndicator.appendChild(bufferCountSpan);

const discoveredSpan = document.createElement('span');
discoveredSpan.style.fontSize = '0.8em';
discoveredSpan.style.opacity = '0.5';
discoveredSpan.style.marginLeft = '10px';
const discoveredCountSpan = document.createElement('span');
discoveredCountSpan.id = 'discovered-count';
discoveredCountSpan.textContent = '0';
discoveredSpan.appendChild(discoveredCountSpan);
discoveredSpan.appendChild(document.createTextNode(' Peers'));
statsGroup.appendChild(bufferIndicator);
statsGroup.appendChild(discoveredSpan);

const controlsGroup = document.createElement('div');
controlsGroup.className = 'controls-group';
const tickerControls = document.createElement('div');
tickerControls.className = 'ticker-controls-compact';
const tickerPauseBtn = document.createElement('button');
tickerPauseBtn.id = 'ticker-pause';
tickerPauseBtn.className = 'ticker-btn';
tickerPauseBtn.textContent = 'Pause';
const speedSlider = document.createElement('input');
speedSlider.type = 'range';
speedSlider.id = 'speed-slider';
speedSlider.className = 'speed-slider';
speedSlider.min = '500';
speedSlider.max = '5000';
speedSlider.step = '500';
speedSlider.value = String(RENDER_INTERVAL_MS);
speedSlider.title = 'Speed';
const speedValueSpan = document.createElement('span');
speedValueSpan.id = 'speed-value';
speedValueSpan.style.fontSize = '0.8em';
speedValueSpan.style.marginLeft = '8px';
speedValueSpan.textContent = `${(RENDER_INTERVAL_MS / 1000).toFixed(1)}s`;
tickerControls.appendChild(tickerPauseBtn);
tickerControls.appendChild(speedSlider);
tickerControls.appendChild(speedValueSpan);

const broadcastSoulBtn = document.createElement('button');
broadcastSoulBtn.id = 'broadcast-soul-btn';
broadcastSoulBtn.className = 'broadcast-compact-btn';
broadcastSoulBtn.textContent = '✨ Broadcast';

controlsGroup.appendChild(tickerControls);
controlsGroup.appendChild(broadcastSoulBtn);
headerRowSecondary.appendChild(statsGroup);
headerRowSecondary.appendChild(controlsGroup);

glassPanel.appendChild(headerRowPrimary);
glassPanel.appendChild(headerRowSecondary);

const gallery = document.createElement('div');
gallery.id = 'gallery';

const debugContainer = document.createElement('div');
debugContainer.id = 'debug-container';
debugContainer.className = 'collapsed';
const debugHeader = document.createElement('div');
debugHeader.className = 'debug-header';
debugHeader.id = 'debug-toggle';
debugHeader.textContent = 'System Logs (Click to toggle)';
const debugLog = document.createElement('div');
debugLog.id = 'debug-log';
debugContainer.appendChild(debugHeader);
debugContainer.appendChild(debugLog);

const toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
const lightbox = document.createElement('div');
lightbox.id = 'lightbox';
lightbox.className = 'lightbox';

appContainer.appendChild(glassPanel);
appContainer.appendChild(gallery);
appContainer.appendChild(debugContainer);
appContainer.appendChild(toastContainer);
appContainer.appendChild(lightbox);
app.appendChild(appContainer);

// UI Event Listeners
debugHeader.onclick = () => debugContainer.classList.toggle('collapsed');
lightbox.onclick = () => {
  lightbox.style.display = 'none';
  while (lightbox.firstChild) lightbox.removeChild(lightbox.firstChild);
};

// --- 2. Global State & Interfaces ---

interface ImageItem {
  id: string;
  hash: string;
  url: string;
  isPinned: boolean;
  isLocal: boolean;
  timestamp: number;
  element: HTMLElement;
  caption?: string;
  originalSenderId?: string;
}

const imageStore: ImageItem[] = [];
const renderQueue: ImageItem[] = [];

let isPaused = false;
let renderInterval = RENDER_INTERVAL_MS;
let tickerTimeout: ReturnType<typeof setTimeout> | null = null;


// --- 3. Helper Functions ---

function showToast(message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type} `;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, TOAST_DURATION_MS);
}

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
  // Info logs enabled for debugging
  logToScreen(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
};

// ...

function processTicker() {
  if (tickerTimeout) clearTimeout(tickerTimeout);

  try {
    if (!isPaused && renderQueue.length > 0) {
      console.log(`[Ticker] Processing item. Queue remaining: ${renderQueue.length}`);
      const nextItem = renderQueue.shift()!;

      // FIX: Check if item is still in imageStore before appending. (Ghost Image Fix)
      const exists = imageStore.some(i => i.id === nextItem.id);
      if (!exists) {
        console.log(`[Ticker] Skipped evicted item: ${nextItem.id}`);
        tickerTimeout = setTimeout(processTicker, 0); // Recursive call to process next immediately
        updateBufferUI();
        return;
      }

      gallery.appendChild(nextItem.element);
      console.log(`[Ticker] Appended item ${nextItem.hash} to DOM.`);
      updateDecayUI();
      updateBufferUI();
    }
  } catch (e) {
    console.error(`[Ticker] CRASHED:`, e);
  }

  tickerTimeout = setTimeout(processTicker, renderInterval);
}
console.warn = (...args) => {
  originalWarn(...args);
  logToScreen(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), '#ff0');
};
console.error = (...args) => {
  originalError(...args);
  logToScreen(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), '#f00');
};

async function hashBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkImageHealth(blob: Blob): Promise<{ ok: boolean; reason?: string }> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;

  return new Promise((resolve) => {
    img.onload = () => {
      URL.revokeObjectURL(url);

      const MAX_DIMENSION = 8192; // 8K allowed, anything larger is likely an attack or wallpaper
      const MAX_MEGAPIXELS = 50 * 1000 * 1000; // 50MP limit

      if (img.width === 0 || img.height === 0) {
        resolve({ ok: false, reason: "Invalid dimensions (0px)" });
        return;
      }

      if (img.width > MAX_DIMENSION || img.height > MAX_DIMENSION) {
        resolve({ ok: false, reason: `Dimension too large (${img.width}x${img.height} > ${MAX_DIMENSION}px)` });
        return;
      }

      if (img.width * img.height > MAX_MEGAPIXELS) {
        resolve({ ok: false, reason: `Resolution too high (>50MP)` });
        return;
      }

      resolve({ ok: true });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ ok: false, reason: "Invalid image data" });
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

// --- 4. Logic & Handlers ---

const BLACKLIST_DB_NAME = 'moli_blacklist_db';
const BLACKLIST_STORE = 'hashes';

async function initBlacklist(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.open(BLACKLIST_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(BLACKLIST_STORE);
    request.onsuccess = () => {
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



function updateBufferUI() {
  bufferCountSpan.textContent = renderQueue.length.toString();
  if (renderQueue.length > 0) bufferIndicator.classList.add('visible');
  else bufferIndicator.classList.remove('visible');
}

function updateDecayUI() {
  const sorted = [...imageStore].sort((a, b) => a.timestamp - b.timestamp);
  const total = imageStore.length;
  imageStore.forEach(item => {
    item.element.classList.remove('decay-stage-1', 'decay-stage-2', 'decay-stage-3');
    if (item.isPinned) return;
    const ageIndex = sorted.indexOf(item);

    // Decay visual logic (roughly based on position among oldest)
    if (total >= 7 && ageIndex === 0) {
      item.element.classList.add(total >= 9 ? 'decay-stage-3' : total === 8 ? 'decay-stage-2' : 'decay-stage-1');
    } else if (total >= 8 && ageIndex === 1) {
      item.element.classList.add(total >= 9 ? 'decay-stage-2' : 'decay-stage-1');
    } else if (total >= 9 && ageIndex === 2) {
      item.element.classList.add('decay-stage-1');
    }
  });
}




function checkEviction() {
  if (imageStore.length <= MAX_GALLERY_ITEMS) return;
  const unpinned = imageStore.filter(i => !i.isPinned).sort((a, b) => a.timestamp - b.timestamp);
  if (unpinned.length > 0) {
    const toRemove = unpinned[0];
    const index = imageStore.findIndex(i => i.id === toRemove.id);
    if (index > -1) {
      if (gallery.contains(toRemove.element)) gallery.removeChild(toRemove.element);
      URL.revokeObjectURL(toRemove.url);
      imageStore.splice(index, 1);
      if (imageStore.length > MAX_GALLERY_ITEMS) checkEviction();
    }
  }
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

// 5. Network Logic

const MAX_CONCURRENT_DOWNLOADS = 3;
let activeDownloadCount = 0;
const downloadQueue: { session: PeerSession; transferId: string; meta: any }[] = [];

function processDownloadQueue() {
  console.log(`[Scheduler] ProcessQueue: Active=${activeDownloadCount}, Queue=${downloadQueue.length}`);
  if (activeDownloadCount >= MAX_CONCURRENT_DOWNLOADS || downloadQueue.length === 0) return;
  while (activeDownloadCount < MAX_CONCURRENT_DOWNLOADS && downloadQueue.length > 0) {
    const task = downloadQueue.shift()!;
    activeDownloadCount++;
    console.log(`[Scheduler] STARTING PULL ${task.meta.name} from ${task.session.peerId} (Active: ${activeDownloadCount})`);
    task.session.pullFile(task.transferId);
  }
}

function releaseDownloadSlot() {
  console.log(`[Scheduler] Releasing Download Slot. Before: ${activeDownloadCount}`);
  activeDownloadCount = Math.max(0, activeDownloadCount - 1);
  console.log(`[Scheduler] Released Download Slot. After: ${activeDownloadCount}`);
  processDownloadQueue();
}

// --- Upload Scheduler (Spec H: Split Semaphore) ---
const MAX_CONCURRENT_UPLOADS = 3;
let activeUploadCount = 0;
interface UploadTask {
  blob: Blob;
  name: string;
  resolve: (value: { success: boolean; reason?: string }) => void;
  reject: (reason?: any) => void;
}
const uploadQueue: UploadTask[] = [];

function processUploadQueue() {
  console.log(`[Scheduler] ProcessUploadQueue: Active=${activeUploadCount}, Queue=${uploadQueue.length}`);
  if (activeUploadCount >= MAX_CONCURRENT_UPLOADS || uploadQueue.length === 0) return;

  const task = uploadQueue.shift()!;
  activeUploadCount++;
  console.log(`[Scheduler] STARTING UPLOAD ${task.name} (Active: ${activeUploadCount})`);

  // Execute actual upload logic (detached to prevent blocking scheduler)
  performLocalUpload(task.blob, task.name)
    .then(task.resolve)
    .catch(task.reject)
    .finally(() => {
      releaseUploadSlot();
    });
}

function releaseUploadSlot() {
  console.log(`[Scheduler] Releasing Upload Slot. Before: ${activeUploadCount}`);
  activeUploadCount = Math.max(0, activeUploadCount - 1);
  processUploadQueue();
}

function shareInventory() {
  const hashes = imageStore.map(i => i.hash);
  network.sessions.forEach((s: PeerSession) => {
    if (s.isConnected) s.sendInventory(hashes);
  });
}

// --- CORE: Add Image to Gallery (Refactored) ---
// --- CORE: Add Image to Gallery (Simplified Phase 31) ---
async function addImageToGallery(blob: Blob, isLocal: boolean, remotePeerId?: string, isPinned: boolean = false, name?: string, originalSenderId?: string) {
  try {
    const hash = await hashBlob(blob);

    // 0. Guard: Blacklist Check
    if (network.isBlacklisted(hash)) {
      console.warn(`[Guard] Blocked blacklisted content: ${hash} `);
      return;
    }

    if (originalSenderId) {
      console.log(`[Trace] Image ${hash.substring(0, 8)} originated from ${originalSenderId}`);
    }

    // Deduplication
    const existing = imageStore.find(i => i.hash === hash);
    if (existing) {
      if (name && !existing.caption) existing.caption = name;
      if (isPinned && !existing.isPinned) {
        console.log(`[Bridge] Image ${hash.substring(0, 8)} promoted to Pinned by ${remotePeerId} `);
        existing.isPinned = true;
      }
      return;
    }

    const health = await checkImageHealth(blob);
    if (!health.ok) {
      console.warn(`[Gatekeeper] REJECTED: ${health.reason} `);
      if (isLocal) showToast(`Rejected: ${health.reason} `, 'warn');
      return;
    }

    const id = Math.random().toString(36).substring(2, 11);
    const url = URL.createObjectURL(blob);
    const timestamp = Date.now();

    // --- Standard Grid Rendering ---
    const container = document.createElement('div');
    container.className = 'gallery-item';

    // Simple Image Tag
    const img = document.createElement('img');
    img.src = url;
    img.className = 'gallery-image';
    img.loading = 'lazy';

    // Phase 31: Safety Blur (Default for remote)
    if (!isLocal) {
      img.classList.add('blurred');
    }

    // Click to Reveal (Toggle Blur)
    img.onclick = (e) => {
      e.stopPropagation();
      if (img.classList.contains('blurred')) {
        img.classList.remove('blurred');
      } else {
        // If already revealed, open Lightbox (or toggle back? Plan says "Click to Reveal")
        // Let's make it toggle for safety/privacy re-masking
        // Wait, Standard behavior: Click -> Open Lightbox.
        // So: If blurred -> Unblur. If unblurred -> Lightbox (via container click).
        // But event propagation... 
        // If I click img, I need to stop prop if blurred.

        // Actually, let's handle logic here:
        // Handled in container.onclick?
        // "Click to Reveal" usually implies direct interaction.
      }
    };

    // Lightbox on Click (Only if revealed)
    container.onclick = (e) => {
      e.stopPropagation();
      if (img.classList.contains('blurred')) {
        img.classList.remove('blurred');
        return;
      }

      lightbox.style.display = 'flex';
      while (lightbox.firstChild) lightbox.removeChild(lightbox.firstChild);
      const lbImg = document.createElement('img');
      lbImg.src = url;
      lightbox.appendChild(lbImg);
    };

    // Overlay for Actions (Pin/Burn)
    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';

    const label = document.createElement('div');
    label.style.fontSize = '12px';
    label.style.marginBottom = 'auto'; // Push actions to bottom
    label.style.alignSelf = 'flex-start';
    label.style.background = 'rgba(0,0,0,0.5)';
    label.style.padding = '2px 6px';
    label.style.borderRadius = '4px';
    label.textContent = isLocal ? 'Original Soul' : 'Shared Soul';

    // Actions Row
    const actionRow = document.createElement('div');
    actionRow.className = 'action-row';
    actionRow.style.width = '100%';
    actionRow.style.justifyContent = 'space-between';

    // Pin Button
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

        if (item.isPinned) {
          Vault.save({
            hash: item.hash,
            blob,
            name: item.caption || 'Soul',
            size: blob.size,
            mime: blob.type,
            timestamp: item.timestamp,
            originalSenderId: item.originalSenderId,
          });
          showToast("Pinned to Vault", "success");
        } else {
          Vault.remove(item.hash);
          showToast("Unpinned", "info");
        }

        // Optimistic Broadcast on Pin
        network.broadcastImage(blob, item.hash, item.isPinned, item.caption);
      }
    };

    if (isPinned) {
      pinBtn.classList.add('pinned');
      pinBtn.textContent = 'Unpin';
    }

    // Consolidated Trash Button (Phase 31)
    const trashBtn = document.createElement('button');
    trashBtn.className = 'remove-action-btn'; // Reuse style or new class
    trashBtn.textContent = '🗑️';
    trashBtn.title = 'Remove & Block (Local)';
    trashBtn.onclick = async (e) => {
      e.stopPropagation();

      const confirmMsg = isLocal
        ? 'Remove this image from your view? (It will NOT be blocked)'
        : 'Remove & Block this image? (It will be added to your local blacklist)';

      if (confirm(confirmMsg)) {
        if (!isLocal) {
          console.log(`[Trash] Blocking remote content: ${hash}`);
          network.addToBlacklist(hash);
        } else {
          console.log(`[Trash] Removing local content (No Block): ${hash}`);
        }

        await Vault.remove(hash);
        removeImageFromGallery(hash);
        showToast(isLocal ? "Removed (Local)" : "Removed & Blocked", "info");
      }
    };

    const rightActions = document.createElement('div');
    rightActions.style.display = 'flex';
    rightActions.style.gap = '5px';
    rightActions.appendChild(trashBtn);

    actionRow.appendChild(pinBtn);
    actionRow.appendChild(rightActions);

    overlay.appendChild(label);
    overlay.appendChild(actionRow);

    container.appendChild(img);
    container.appendChild(overlay);

    // Store Item
    const newItem: ImageItem = { id, hash, url, isPinned, isLocal, timestamp, element: container, caption: name, originalSenderId };
    imageStore.push(newItem);

    renderQueue.push(newItem);
    updateBufferUI();
    checkEviction();
    shareInventory();

  } catch (e) {
    console.error('[AddImage] Error:', e);
  } finally {
    if (remotePeerId) releaseDownloadSlot();
  }
}

async function initVaultAndLoad(): Promise<void> {
  await Vault.init();
  const pinnedItems = await Vault.loadAll();

  if (pinnedItems.length > 0) {
    console.log(`[Vault] Restoring ${pinnedItems.length} pinned souls...`);
    for (const item of pinnedItems) {
      if (!imageStore.some(i => i.hash === item.hash)) {
        // Fix: Determine isLocal based on originalSenderId vs myId
        // If originalSenderId is missing, assume it's legacy local or we don't know (treat as local to be safe/consistent with old behavior)
        // If originalSenderId exists and != myId, it is NOT local.
        const isLegacyOrOwn = !item.originalSenderId || item.originalSenderId === network.myId;

        await addImageToGallery(
          item.blob,
          isLegacyOrOwn, // isLocal
          undefined,
          true,
          item.name,
          item.originalSenderId
        );
      }
    }
  }
}

async function processLocalUpload(blob: Blob, name: string = 'image.png'): Promise<{ success: boolean; reason?: string }> {
  return new Promise((resolve, reject) => {
    uploadQueue.push({
      blob,
      name,
      resolve,
      reject
    });
    processUploadQueue();
  });
}

async function performLocalUpload(file: Blob, _name: string = 'image.png'): Promise<{ success: boolean; reason?: string }> {
  const healthCheck = await checkImageHealth(file);
  if (!healthCheck.ok) {
    showToast(`Rejected: ${healthCheck.reason} `, 'warn');
    return { success: false, reason: healthCheck.reason };
  }
  const hash = await hashBlob(file);

  // Auto-Pin Restored (Phase 39)
  // Since we can now remove local uploads without blocking, it's safe to pin everything.
  await Vault.save({
    hash,
    blob: file,
    name: _name || 'Original Soul',
    size: file.size,
    mime: file.type,
    timestamp: Date.now(),
  }).then(() => {
    console.log(`[Vault] Auto-pinned original upload: ${hash.slice(0, 8)} `);
    addImageToGallery(file, true, undefined, true, _name); // isPinned = true
  });

  shareInventory();
  const sentCount = network.broadcastImage(file, hash, false, _name);

  if (sentCount > 0) {
    showToast(`Broadcasted to ${sentCount} peers!`, "success");
    return { success: true };
  } else {
    showToast("Offline: Saved to Vault (Local Only).", "warn");
    return { success: true }; // Considered success because it's saved locally
  }
}

// --- Identity & Network Initialization ---

const network = new P2PNetwork(
  async (blob: Blob, peerId: string, _isPinned?: boolean, name?: string, _ttl?: number, originalSenderId?: string) => {
    // Sovereign Safety: Incoming images are untrusted (unpinned) by default.
    // Ignored sender's isPinned status to prevent "Ghost Pinning" on receiver.
    addImageToGallery(blob, false, peerId, false, name, originalSenderId);
  },
  (type, session, _data) => {
    // Generic Event Handler (Sync Logic)
    if (type === 'connected') {
      console.log(`[Sync] Handshake with ${session.peerId}. Sending Inventory...`);

      // 1. Send Inventory (Anti-Entropy / Pull Enabler) - NO OPTIMISTIC PUSH (Ghost Fix)
      const allHashes = imageStore.map(i => i.hash);
      session.sendInventory(allHashes);
    } else if (type === 'sync-request') {
      console.log(`[Sync] Received Sync Request from ${session.peerId}. Sending Inventory...`);
      const allHashes = imageStore.map(i => i.hash);
      session.sendInventory(allHashes);
    }
  },
  (count: number) => {
    peerCountSpan.textContent = count.toString();
    discoveredCountSpan.textContent = network.sessions.size.toString();
  },
  (session: PeerSession, transferId: string) => { // Error Feedback
    console.warn(`[Main] Transfer Error for ${transferId} from ${session.peerId}. Releasing slot.`);
    releaseDownloadSlot();
  },
  (peerId: string, hashes: string[]) => { // Inventory Callback
    hashes.forEach(hash => {
      // Pull Logic: Request missing items automatically
      const weHaveIt = imageStore.some(i => i.hash === hash);
      if (!weHaveIt && !network.isBlacklisted(hash)) {
        const session = network.sessions.get(peerId);
        if (session) {
          console.log(`[Main] Missing hash ${hash.substring(0, 8)} in inventory. Requesting from ${peerId}...`);
          session.requestFile(hash);
        }
      }
    });
  },
  (session: PeerSession, data: any) => { // Offer File Callback
    // If trusted, we might prioritize download? For now just track.
    console.log(`[Main] Queueing download ${data.name} from ${session.peerId}`);
    downloadQueue.push({ session, transferId: data.transferId, meta: data });
    processDownloadQueue();
  },
  (session: PeerSession, hash: string) => { // Request Handler (Provider Side)
    const item = imageStore.find(i => i.hash === hash);
    if (item) {
      console.log(`[Main] Peer ${session.sessionPeerId} requested ${hash.substring(0, 8)}. Sending...`);
      fetch(item.url)
        .then(r => r.blob())
        .then(blob => {
          // Send Image (Tributes removed)
          session.sendImage(blob, item.hash, item.isPinned, item.caption, GOSSIP_TTL);
        })
        .catch(e => console.error(`[Main] Failed to load requested image:`, e));
    } else {
      console.warn(`[Main] Peer requested unknown hash: ${hash}`);
    }
  }
);

// Burn Callback Removed (Sakoku Policy)

// Event Handlers for UI (Tickers, Buttons)
tickerPauseBtn.onclick = () => {
  isPaused = !isPaused;
  tickerPauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
  tickerPauseBtn.classList.toggle('active', isPaused);
};

speedSlider.oninput = () => {
  renderInterval = parseInt(speedSlider.value);
  speedValueSpan.textContent = `${(renderInterval / 1000).toFixed(1)} s`;
};

// Listeners
if (broadcastSoulBtn) broadcastSoulBtn.onclick = () => showUploadModal();
if (helpBtn) helpBtn.onclick = showHelpModal;
if (idBurnBtn) {
  idBurnBtn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    lightbox.style.display = 'flex';
    while (lightbox.firstChild) lightbox.removeChild(lightbox.firstChild);

    const dangerModal = document.createElement('div');
    dangerModal.className = 'danger-modal';
    dangerModal.onclick = (ev) => ev.stopPropagation();

    const icon = document.createElement('div');
    icon.className = 'danger-icon';
    icon.textContent = '🔥';

    const h2 = document.createElement('h2');
    h2.style.color = '#ff4444';
    h2.style.margin = '0 0 10px 0';
    h2.textContent = 'Sovereign Reset';

    const p1 = document.createElement('p');
    p1.style.opacity = '0.8';
    p1.style.marginBottom = '5px';
    p1.innerHTML = 'You are about to destroy your <strong>Identity</strong> and <strong>Vault</strong>.';

    const p2 = document.createElement('p');
    p2.style.fontSize = '0.85em';
    p2.style.color = '#ff8888';
    p2.style.marginTop = '0';
    p2.textContent = 'This action cannot be undone.';

    const actions = document.createElement('div');
    actions.className = 'danger-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'cancel-burn';
    cancelBtn.className = 'cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
      lightbox.style.display = 'none';
      while (lightbox.firstChild) lightbox.removeChild(lightbox.firstChild);
    };

    const confirmBtn = document.createElement('button');
    confirmBtn.id = 'confirm-burn';
    confirmBtn.className = 'destroy-btn';
    confirmBtn.textContent = 'DESTROY';
    confirmBtn.onclick = async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "BURNING...";

      // 0. Close active connections
      try {
        Vault.close(); // Close Vault DB
        network.close(); // Close Network (Peer connections + Blacklist DB?) 
        // Note: Network.close() might not close Blacklist DB if it's separate.
        // But main.ts doesn't hold reference to Blacklist DB connection directly, network does?
        // Actually initBlacklist opens it. We need to close it.
        // But we don't have a handle to it here.
        // IndexedDB.close() is on the db instance.
        // Let's rely on reload() clearing memory if delete fails?
        // No, deleteDatabase needs connections closed.
        // Let's try best effort.
      } catch (e) { console.error("Error closing DBs", e); }

      // 1. Wipe Secrets from LocalStorage
      localStorage.removeItem('moli_identity');
      localStorage.removeItem('moli_last_upload');

      // 2. Wipe IndexedDBs (Correct Names)
      const dbs = ['moli_id_db', 'moli_vault_v1', 'moli_blacklist_db'];

      for (const dbName of dbs) {
        await new Promise<void>(resolve => {
          const req = indexedDB.deleteDatabase(dbName);
          req.onsuccess = () => { console.log(`Deleted ${dbName}`); resolve(); };
          req.onerror = () => { console.warn(`Failed to delete ${dbName}`); resolve(); };
          req.onblocked = () => { console.warn(`Blocked deleting ${dbName}`); resolve(); };
        });
      }
      window.location.reload();
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dangerModal.appendChild(icon);
    dangerModal.appendChild(h2);
    dangerModal.appendChild(p1);
    dangerModal.appendChild(p2);
    dangerModal.appendChild(actions);
    lightbox.appendChild(dangerModal);
  };
}

(async () => {
  try {
    // Secure ICE Config Fetch
    let iceServers;
    if (window.location.hostname !== 'localhost') {
      try {
        console.log("Fetching Ephemeral ICE Credentials...");
        const res = await fetch('/api/ice-config');
        if (res.ok) {
          const config = await res.json();
          iceServers = config.iceServers;
          console.log("[ICE] Secured Ephemeral Credentials.");
        } else {
          console.warn("[ICE] Failed to fetch credentials. Fallback to default.");
        }
      } catch (e) {
        console.warn("[ICE] API unavailable. Fallback to default.", e);
      }
    }

    const initPromise = network.init({ iceServers });
    // Use Constant
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Network Initialization Timed Out")), NETWORK_TIMEOUT_MS)
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

// --- API Implementation (Restored) ---
window.moliAPI = {
  connect: () => ({
    status: network.sessions.size > 0 ? 'connected' : 'disconnected',
    id: network.myId
  }),
  upload: async (blob: Blob, name?: string) => {
    return await processLocalUpload(blob, name);
  },
  getLatestImages: () => {
    return imageStore.map(item => ({
      id: item.id,
      hash: item.hash,
      caption: item.caption,
      timestamp: item.timestamp
    }));
  },
  getPublicKey: () => {
    return network.getPublicKey();
  },
  getImageContent: async (hash: string) => {
    const item = imageStore.find(i => i.hash === hash);
    if (!item) return null;
    // Return base64 or blob url? The interface implied content.
    // Let's return the Blob URL for now, or read it to base64 if needed.
    // "getImageContent" usually implies data.
    return new Promise((resolve) => {
      fetch(item.url)
        .then(r => r.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        })
        .catch(() => resolve(null));
    });
  }
};

// Start Ticker
processTicker();

// Modals
async function showUploadModal() {
  lightbox.style.display = 'flex';
  while (lightbox.firstChild) lightbox.removeChild(lightbox.firstChild);

  const modal = document.createElement('div');
  modal.className = 'upload-modal';
  modal.onclick = (e) => e.stopPropagation();

  const h2 = document.createElement('h2');
  h2.style.marginTop = '0';
  h2.style.background = 'linear-gradient(to right, #fff, #646cff)';
  h2.style.webkitBackgroundClip = 'text';
  h2.style.backgroundClip = 'text';
  (h2.style as any).webkitTextFillColor = 'transparent';
  h2.textContent = 'Broadcast Your Soul';

  const dropZone = document.createElement('div');
  dropZone.id = 'drop-zone';
  dropZone.className = 'drop-zone';

  const pDrop = document.createElement('p');
  pDrop.textContent = 'Drag & Drop Artwork or Click to Select';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'modal-file-input';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';

  const previewContainer = document.createElement('div');
  previewContainer.id = 'upload-preview-container';
  previewContainer.style.display = 'none';
  previewContainer.style.textAlign = 'center';

  const previewImg = document.createElement('img');
  previewImg.id = 'upload-preview';
  previewImg.className = 'upload-preview-img';

  previewContainer.appendChild(previewImg);
  dropZone.appendChild(pDrop);
  dropZone.appendChild(fileInput);
  dropZone.appendChild(previewContainer);

  const inputGroup = document.createElement('div');
  inputGroup.className = 'modal-input-group';

  const broadcastBtn = document.createElement('button');
  broadcastBtn.id = 'broadcast-final-btn';
  broadcastBtn.className = 'broadcast-final-btn';
  broadcastBtn.disabled = true;
  broadcastBtn.textContent = 'Broadcast to Mesh';

  const cancelBtn = document.createElement('button');
  cancelBtn.id = 'cancel-modal-btn';
  cancelBtn.className = 'cancel-modal-btn';
  cancelBtn.textContent = 'Cancel';

  inputGroup.appendChild(broadcastBtn);
  inputGroup.appendChild(cancelBtn);

  modal.appendChild(h2);
  modal.appendChild(dropZone);
  modal.appendChild(inputGroup);

  lightbox.appendChild(modal);

  let selectedFile: File | null = null;

  cancelBtn.onclick = () => {
    lightbox.style.display = 'none';
    while (lightbox.firstChild) lightbox.removeChild(lightbox.firstChild);
  };

  dropZone.onclick = () => fileInput.click();
  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
  dropZone.ondragleave = () => dropZone.classList.remove('dragover');
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer?.files[0]) handleFileSelection(e.dataTransfer.files[0]);
  };

  fileInput.onchange = () => {
    if (fileInput.files?.[0]) handleFileSelection(fileInput.files[0]);
  };

  function handleFileSelection(file: File) {
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target?.result as string;
      previewContainer.style.display = 'block';
      pDrop.style.display = 'none';
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
      while (lightbox.firstChild) lightbox.removeChild(lightbox.firstChild);
      selectedFile = null;
    } else {
      broadcastBtn.disabled = false;
      broadcastBtn.textContent = "Broadcast to Mesh";
    }
  };
}

function showHelpModal() {
  lightbox.style.display = 'flex';
  while (lightbox.firstChild) lightbox.removeChild(lightbox.firstChild);

  const helpModal = document.createElement('div');
  helpModal.className = 'help-modal';
  helpModal.onclick = (e) => e.stopPropagation();

  const h2 = document.createElement('h2');
  h2.textContent = 'Moli P2P Manual';

  const pIntro = document.createElement('p');
  pIntro.style.opacity = '0.7';
  pIntro.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
  pIntro.style.paddingBottom = '15px';
  pIntro.textContent = 'Welcome to the Autonomous Distributed Gallery. Content exists only as long as someone holds it.';

  // Section 1: Philosophy & Limits
  const sectionPhilo = document.createElement('div');
  sectionPhilo.className = 'help-section';
  const h3Philo = document.createElement('h3');
  h3Philo.textContent = '⏳ Ephemeral Capacity';
  const pPhilo = document.createElement('p');
  pPhilo.innerHTML = `
    <strong>Max Capacity: 50 Images</strong><br>
    Your browser holds the latest 50 souls. When new ones arrive, the oldest unpinned ones are extinguished to make room.<br>
    <em>"The fire must breathe."</em>
  `;
  sectionPhilo.appendChild(h3Philo);
  sectionPhilo.appendChild(pPhilo);

  // Section 2: Actions
  const sectionActions = document.createElement('div');
  sectionActions.className = 'help-section';
  const h3Act = document.createElement('h3');
  h3Act.textContent = '🎨 Actions';

  const pPin = document.createElement('p');
  pPin.innerHTML = `<strong>📌 Pin (Save)</strong><br>Saves a soul to your local Vault. Pinned items are protected from decay and re-broadcasted when you join.`;

  const pBroad = document.createElement('p');
  pBroad.style.marginTop = '10px';
  pBroad.innerHTML = `<strong>✨ Broadcast</strong><br>Uploads a soul to the mesh. It propagates to connected peers immediately.`;

  sectionActions.appendChild(h3Act);
  sectionActions.appendChild(pPin);
  sectionActions.appendChild(pBroad);

  // Section 3: Safety
  const sectionSafe = document.createElement('div');
  sectionSafe.className = 'help-section';
  const h3Safe = document.createElement('h3');
  h3Safe.textContent = '🛡️ Sovereign Safety';

  const pBlur = document.createElement('p');
  pBlur.innerHTML = `<strong>👁️ Blur by Default</strong><br>All incoming souls are blurred. You must click to reveal them.`;

  const pBurn = document.createElement('p');
  pBurn.style.marginTop = '10px';
  pBurn.innerHTML = `<strong>🗑️ Remove / Burn</strong><br>Removes content from <em>your</em> device and blacklists it locally. <span style="color:#ff8888">You cannot delete files from other peers.</span>`;

  const pReset = document.createElement('p');
  pReset.style.marginTop = '10px';
  pReset.innerHTML = `<strong>🔥 ID Reset</strong><br>Click the flame icon in the header to destroy your Identity and Vault forever.`;

  sectionSafe.appendChild(h3Safe);
  sectionSafe.appendChild(pBlur);
  sectionSafe.appendChild(pBurn);
  sectionSafe.appendChild(pReset);

  const closeBtn = document.createElement('button');
  closeBtn.id = 'close-help-btn';
  closeBtn.style.width = '100%';
  closeBtn.style.marginTop = '2rem';
  closeBtn.textContent = 'Close Manual';
  closeBtn.onclick = () => {
    lightbox.style.display = 'none';
    while (lightbox.firstChild) lightbox.removeChild(lightbox.firstChild);
  };

  helpModal.appendChild(h2);
  helpModal.appendChild(pIntro);
  helpModal.appendChild(sectionPhilo);
  helpModal.appendChild(sectionActions);
  helpModal.appendChild(sectionSafe);
  helpModal.appendChild(closeBtn);

  lightbox.appendChild(helpModal);
}

// --- Global Event Listeners ---
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (lightbox.style.display === 'flex') {
      lightbox.style.display = 'none';
      // Clear content
      while (lightbox.firstChild) lightbox.removeChild(lightbox.firstChild);
    }
  }
});
