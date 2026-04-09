import { expect, test, describe, beforeEach, afterEach, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Register happy-dom to provide document, window, etc.
GlobalRegistrator.register();

import { createGalleryItem } from "./ui";

describe("createGalleryItem", () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
        container.innerHTML = "";
    });

    test("should render the correct label for local images", async () => {
        const actions = {
            onPinToggle: mock(),
            onRemove: mock(),
            onImageClick: mock(),
            onContainerClick: mock()
        };

        const item = createGalleryItem("mock.jpg", "1", true, false, actions, undefined);
        container.appendChild(item);

        const overlay = item.querySelector('.card-overlay');
        expect(overlay).toBeTruthy();

        const header = overlay?.firstChild as HTMLElement;
        expect(header).toBeTruthy();

        const label = header.firstChild as HTMLElement;
        expect(label.textContent).toBe('Original Soul');
    });

    test("should render the correct label for remote images", async () => {
        const actions = {
            onPinToggle: mock(),
            onRemove: mock(),
            onImageClick: mock(),
            onContainerClick: mock()
        };

        const item = createGalleryItem("mock.jpg", "2", false, false, actions, undefined);
        container.appendChild(item);

        const overlay = item.querySelector('.card-overlay');
        expect(overlay).toBeTruthy();

        const header = overlay?.firstChild as HTMLElement;
        expect(header).toBeTruthy();

        const label = header.firstChild as HTMLElement;
        expect(label.textContent).toBe('Shared Soul');
    });
});
