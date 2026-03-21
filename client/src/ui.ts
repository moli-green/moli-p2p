import { TOAST_DURATION_MS } from './constants';

export function showToast(message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, TOAST_DURATION_MS);
}

export function createGalleryItem(
    url: string,
    _id: string,
    isLocal: boolean,
    isPinned: boolean,
    actions: {
        onPinToggle: (isNowPinned: boolean) => void,
        onRemove: () => void,
        onImageClick: (isBlurred: boolean) => void,
        onContainerClick: (isBlurred: boolean) => void,
    }
): HTMLElement {
    const container = document.createElement('div');
    container.className = 'gallery-item';

    const img = document.createElement('img');
    img.src = url;
    img.className = 'gallery-image';
    img.loading = 'lazy';

    if (!isLocal) {
        img.classList.add('blurred');
    }

    img.onclick = (e) => {
        e.stopPropagation();
        actions.onImageClick(img.classList.contains('blurred'));
    };

    container.onclick = (e) => {
        e.stopPropagation();
        actions.onContainerClick(img.classList.contains('blurred'));
    };

    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';

    const label = document.createElement('div');
    label.style.fontSize = '12px';
    label.style.marginBottom = 'auto';
    label.style.alignSelf = 'flex-start';
    label.style.background = 'rgba(0,0,0,0.5)';
    label.style.padding = '2px 6px';
    label.style.borderRadius = '4px';
    label.textContent = isLocal ? 'Original Soul' : 'Shared Soul';

    const actionRow = document.createElement('div');
    actionRow.className = 'action-row';
    actionRow.style.width = '100%';
    actionRow.style.justifyContent = 'space-between';

    const pinBtn = document.createElement('button');
    pinBtn.className = 'pin-btn';
    pinBtn.textContent = isPinned ? 'Unpin' : 'Pin';
    if (isPinned) {
        pinBtn.classList.add('pinned');
    }

    pinBtn.onclick = (e) => {
        e.stopPropagation();
        const isCurrentlyPinned = pinBtn.classList.contains('pinned');
        const willBePinned = !isCurrentlyPinned;

        pinBtn.textContent = willBePinned ? 'Unpin' : 'Pin';
        pinBtn.classList.toggle('pinned', willBePinned);

        actions.onPinToggle(willBePinned);
    };

    const trashBtn = document.createElement('button');
    trashBtn.className = 'remove-action-btn';
    trashBtn.textContent = '🗑️';
    trashBtn.title = 'Remove & Block (Local)';
    trashBtn.onclick = (e) => {
        e.stopPropagation();
        actions.onRemove();
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

    return container;
}
