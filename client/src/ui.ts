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
    },
    _caption?: string,
    senderId?: string
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

    const handleImageClick = (e: MouseEvent) => {
        e.stopPropagation();
        actions.onImageClick(img.classList.contains('blurred'));
    };

    const handleContainerClick = (e: MouseEvent) => {
        e.stopPropagation();
        actions.onContainerClick(img.classList.contains('blurred'));
    };

    img.addEventListener('click', handleImageClick);
    container.addEventListener('click', handleContainerClick);

    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.width = '100%';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'flex-start';
    header.style.marginBottom = 'auto';

    const label = document.createElement('div');
    label.style.fontSize = '12px';
    label.style.background = 'rgba(0,0,0,0.5)';
    label.style.padding = '2px 6px';
    label.style.borderRadius = '4px';
    label.textContent = isLocal ? 'Original Soul' : 'Shared Soul';

    header.appendChild(label);

    if (senderId) {
        import('jdenticon').then(jdenticon => {
            const senderIcon = document.createElement('div');

            // Convert senderId to hex to guarantee it's purely alphanumeric
            // This prevents XSS attacks via jdenticon.toSvg when using DOMParser or innerHTML
            const safeId = Array.from(new TextEncoder().encode(senderId))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            const svgString = jdenticon.toSvg(safeId, 20);
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');

            // Ensure we append the svg root element, not the entire document
            if (svgDoc.documentElement.tagName.toLowerCase() === 'svg') {
                senderIcon.appendChild(svgDoc.documentElement);
            }

            senderIcon.style.background = 'rgba(0,0,0,0.5)';
            senderIcon.style.borderRadius = '4px';
            senderIcon.style.display = 'flex';
            senderIcon.style.alignItems = 'center';
            senderIcon.style.justifyContent = 'center';
            senderIcon.title = `Source ID: ${senderId.substring(0, 8)}`;
            header.appendChild(senderIcon);
        }).catch(() => {});
    }

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

    const handlePinClick = (e: MouseEvent) => {
        e.stopPropagation();
        const isCurrentlyPinned = pinBtn.classList.contains('pinned');
        const willBePinned = !isCurrentlyPinned;

        pinBtn.textContent = willBePinned ? 'Unpin' : 'Pin';
        pinBtn.classList.toggle('pinned', willBePinned);

        actions.onPinToggle(willBePinned);
    };

    pinBtn.addEventListener('click', handlePinClick);

    const trashBtn = document.createElement('button');
    trashBtn.className = 'remove-action-btn';
    trashBtn.textContent = '🗑️';
    trashBtn.title = 'Remove & Block (Local)';

    const handleTrashClick = (e: MouseEvent) => {
        e.stopPropagation();
        actions.onRemove();
    };

    trashBtn.addEventListener('click', handleTrashClick);

    const rightActions = document.createElement('div');
    rightActions.style.display = 'flex';
    rightActions.style.gap = '5px';
    rightActions.appendChild(trashBtn);

    actionRow.appendChild(pinBtn);
    actionRow.appendChild(rightActions);

    overlay.appendChild(header);
    overlay.appendChild(actionRow);

    container.appendChild(img);
    container.appendChild(overlay);

    // Attach a cleanup method to the element
    (container as any).cleanup = () => {
        img.removeEventListener('click', handleImageClick);
        container.removeEventListener('click', handleContainerClick);
        pinBtn.removeEventListener('click', handlePinClick);
        trashBtn.removeEventListener('click', handleTrashClick);

        // Clear DOM references
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
    };

    return container;
}
