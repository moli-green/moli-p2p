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

export interface GalleryItemElement extends HTMLDivElement {
    cleanup: () => void;
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
    _caption?: string
): GalleryItemElement {
    const container = document.createElement('div') as GalleryItemElement;
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
    container.cleanup = () => {
        img.removeEventListener('click', handleImageClick);
        container.removeEventListener('click', handleContainerClick);
        pinBtn.removeEventListener('click', handlePinClick);
        trashBtn.removeEventListener('click', handleTrashClick);

        // Clear DOM references
        container.replaceChildren();
    };

    return container;
}

function createPhilosophySection(): HTMLDivElement {
    const sectionPhilo = document.createElement('div');
    sectionPhilo.className = 'help-section';
    const h3Philo = document.createElement('h3');
    h3Philo.textContent = '⏳ Ephemeral Capacity';
    const pPhilo = document.createElement('p');
    const strongPhilo = document.createElement('strong');
    strongPhilo.textContent = 'Max Capacity: 50 Images';
    const emPhilo = document.createElement('em');
    emPhilo.textContent = '"The fire must breathe."';
    pPhilo.append(
        strongPhilo,
        document.createElement('br'),
        'Your browser holds the latest 50 souls. When new ones arrive, the oldest unpinned ones are extinguished to make room.',
        document.createElement('br'),
        emPhilo
    );
    sectionPhilo.appendChild(h3Philo);
    sectionPhilo.appendChild(pPhilo);
    return sectionPhilo;
}

function createActionsSection(): HTMLDivElement {
    const sectionActions = document.createElement('div');
    sectionActions.className = 'help-section';
    const h3Act = document.createElement('h3');
    h3Act.textContent = '🎨 Actions';

    const pPin = document.createElement('p');
    const strongPin = document.createElement('strong');
    strongPin.textContent = '📌 Pin (Save)';
    pPin.append(strongPin, document.createElement('br'), 'Saves a soul to your local Vault. Pinned items are protected from decay and re-broadcasted when you join.');

    const pBroad = document.createElement('p');
    pBroad.style.marginTop = '10px';
    const strongBroad = document.createElement('strong');
    strongBroad.textContent = '✨ Broadcast';
    pBroad.append(strongBroad, document.createElement('br'), 'Uploads a soul to the mesh. It propagates to connected peers immediately.');

    sectionActions.appendChild(h3Act);
    sectionActions.appendChild(pPin);
    sectionActions.appendChild(pBroad);
    return sectionActions;
}

function createSafetySection(): HTMLDivElement {
    const sectionSafe = document.createElement('div');
    sectionSafe.className = 'help-section';
    const h3Safe = document.createElement('h3');
    h3Safe.textContent = '🛡️ Sovereign Safety';

    const pBlur = document.createElement('p');
    const strongBlur = document.createElement('strong');
    strongBlur.textContent = '👁️ Blur by Default';
    pBlur.append(strongBlur, document.createElement('br'), 'All incoming souls are blurred. You must click to reveal them.');

    const pBurn = document.createElement('p');
    pBurn.style.marginTop = '10px';
    const strongBurn = document.createElement('strong');
    strongBurn.textContent = '🗑️ Remove / Burn';
    const emBurn = document.createElement('em');
    emBurn.textContent = 'your';
    const spanBurn = document.createElement('span');
    spanBurn.style.color = '#ff8888';
    spanBurn.textContent = 'You cannot delete files from other peers.';
    pBurn.append(strongBurn, document.createElement('br'), 'Removes content from ', emBurn, ' device and blacklists it locally. ', spanBurn);

    const pReset = document.createElement('p');
    pReset.style.marginTop = '10px';
    const strongReset = document.createElement('strong');
    strongReset.textContent = '🔥 ID Reset';
    pReset.append(strongReset, document.createElement('br'), 'Click the flame icon in the header to destroy your Identity and Vault forever.');

    sectionSafe.appendChild(h3Safe);
    sectionSafe.appendChild(pBlur);
    sectionSafe.appendChild(pBurn);
    sectionSafe.appendChild(pReset);
    return sectionSafe;
}

function createDisclaimerSection(): HTMLDivElement {
    const sectionDisclaimer = document.createElement('div');
    sectionDisclaimer.className = 'help-section';
    sectionDisclaimer.style.borderLeft = '3px solid #ffcc00';
    sectionDisclaimer.style.paddingLeft = '10px';
    sectionDisclaimer.style.marginTop = '15px';
    sectionDisclaimer.style.background = 'rgba(255, 204, 0, 0.05)';

    const h3Disc = document.createElement('h3');
    h3Disc.textContent = '⚠️ Network Responsibility';
    h3Disc.style.color = '#ffcc00';

    const pServer = document.createElement('p');
    const strongServer = document.createElement('strong');
    strongServer.textContent = 'Your Device Is a Server';
    pServer.append(strongServer, document.createElement('br'), 'By joining the mesh, your device actively distributes encrypted content to other peers.');

    const pBandwidth = document.createElement('p');
    pBandwidth.style.marginTop = '10px';
    const strongContribution = document.createElement('strong');
    strongContribution.textContent = 'Resource Contribution';
    const strongBandwidth = document.createElement('strong');
    strongBandwidth.textContent = 'Bandwidth';
    const strongCPU = document.createElement('strong');
    strongCPU.textContent = 'CPU';
    pBandwidth.append(strongContribution, document.createElement('br'), 'You are contributing your ', strongBandwidth, ' and ', strongCPU, ' to keep the network alive. Moli P2P has no central storage.');

    sectionDisclaimer.appendChild(h3Disc);
    sectionDisclaimer.appendChild(pServer);
    sectionDisclaimer.appendChild(pBandwidth);
    return sectionDisclaimer;
}

export function buildHelpModal(lightbox: HTMLElement, closeLightbox: () => void): void {
    lightbox.style.display = 'flex';
    // Clear lightbox efficiently
    lightbox.replaceChildren();

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

    const closeBtn = document.createElement('button');
    closeBtn.id = 'close-help-btn';
    closeBtn.style.width = '100%';
    closeBtn.style.marginTop = '2rem';
    closeBtn.textContent = 'Close Manual';
    closeBtn.onclick = closeLightbox;

    helpModal.appendChild(h2);
    helpModal.appendChild(pIntro);
    helpModal.appendChild(createPhilosophySection());
    helpModal.appendChild(createActionsSection());
    helpModal.appendChild(createSafetySection());
    helpModal.appendChild(createDisclaimerSection());
    helpModal.appendChild(closeBtn);

    lightbox.appendChild(helpModal);
}
