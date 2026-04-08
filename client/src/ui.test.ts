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

    test("should handle malicious senderId safely (XSS prevention)", async () => {
        const maliciousSenderId = '<script>alert(1)</script>';

        const actions = {
            onPinToggle: mock(),
            onRemove: mock(),
            onImageClick: mock(),
            onContainerClick: mock()
        };

        const item = createGalleryItem("mock.jpg", "1", true, false, actions, undefined, maliciousSenderId);
        container.appendChild(item);

        // Wait a short tick for dynamic import of jdenticon to resolve
        await new Promise(resolve => setTimeout(resolve, 50));

        // The senderIcon should be created but it shouldn't have any script tags
        const overlay = item.querySelector('.card-overlay');
        expect(overlay).toBeTruthy();

        const header = overlay?.firstChild as HTMLElement;
        expect(header).toBeTruthy();

        // The senderIcon is the second child of header (first is label)
        const senderIcon = header.childNodes[1] as HTMLElement;
        expect(senderIcon).toBeTruthy();

        // Ensure no script tag is present in the document
        const scripts = container.querySelectorAll('script');
        expect(scripts.length).toBe(0);

        // Ensure the sender icon has an SVG element
        const svg = senderIcon.querySelector('svg');
        expect(svg).toBeTruthy();

        // Verify no innerHTML script elements were sneaked into the SVG
        if (svg) {
            expect(svg.innerHTML).not.toContain('<script');
            expect(svg.innerHTML).not.toContain('alert(1)');
        }
    });
});
