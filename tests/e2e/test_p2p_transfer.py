import pytest
import asyncio
from playwright.async_api import async_playwright
import os
import time

SERVER_URL = "http://localhost:8080"

@pytest.mark.asyncio
async def test_p2p_file_transfer():
    async with async_playwright() as p:
        browser1 = await p.chromium.launch(headless=True, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
        browser2 = await p.chromium.launch(headless=True, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])

        context1 = await browser1.new_context()
        context2 = await browser2.new_context()

        page1 = await context1.new_page()
        page2 = await context2.new_page()

        # Listen for console logs before navigation
        page1.on("console", lambda msg: print(f"Page 1 Console: {msg.text}"))
        page2.on("console", lambda msg: print(f"Page 2 Console: {msg.text}"))

        print("Navigating to page 1")
        await page1.goto(SERVER_URL)
        print("Navigating to page 2")
        await page2.goto(SERVER_URL)

        print("Waiting for peers to connect...")
        await asyncio.sleep(5)

        # Ensure test image is valid, use a real image or a PNG with proper header, rather than just urandom
        # Let's write a tiny transparent 1x1 png to ensure it passes any basic image parsing
        test_file_path = "test_image.png"
        with open(test_file_path, "wb") as f:
            f.write(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82')
            # Append 2MB of random data to test chunking
            f.write(os.urandom(1024 * 1024 * 2))

        try:
            # Let's count initial images
            img_count2_initial = await page2.locator(".image-wrapper").count()
            if img_count2_initial == 0:
                img_count2_initial = await page2.locator(".gallery-item").count()
            if img_count2_initial == 0:
                img_count2_initial = await page2.locator("img").count()

            print(f"Initial image count on Peer 2: {img_count2_initial}")

            print("Clicking broadcast button...")
            await page1.locator("#broadcast-soul-btn").click()

            # Now wait for the modal file input
            await page1.wait_for_selector("#modal-file-input", state="attached", timeout=5000)

            file_input1 = page1.locator("#modal-file-input")
            print("Setting input file on Peer 1...")
            await file_input1.set_input_files(test_file_path)

            await asyncio.sleep(1)

            print("Confirming broadcast...")
            await page1.get_by_text("Broadcast to Mesh").click()

            print("Waiting for image to appear on Peer 2...")
            img_count2_final = img_count2_initial

            for _ in range(15):
                img_count2_final = await page2.locator(".image-wrapper").count()
                if img_count2_final == 0:
                    img_count2_final = await page2.locator(".gallery-item").count()
                if img_count2_final == 0:
                    img_count2_final = await page2.locator("img").count()

                if img_count2_final > img_count2_initial:
                    print(f"Image received on Peer 2! Count is now {img_count2_final}")
                    break
                await asyncio.sleep(1)

            await page2.screenshot(path="page2_end.png")

            assert img_count2_final > img_count2_initial, "Peer 2 did not receive the image from Peer 1"

        finally:
            if os.path.exists(test_file_path):
                os.remove(test_file_path)
            await browser1.close()
            await browser2.close()
