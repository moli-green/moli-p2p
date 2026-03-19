import pytest
import asyncio
from playwright.async_api import async_playwright
import os
import shutil

SERVER_URL = "http://localhost:8080"
TEST_IMG_DIR = "tests/e2e/test_images"

def create_dummy_image(index, size_mb=2.5):
    """
    Creates a realistic sized file that is treated as an image by the browser.
    Starts with a valid 1x1 PNG header so image processing libraries don't outright reject it,
    then fills the rest with random data to reach the desired size to trigger chunking logic.
    """
    os.makedirs(TEST_IMG_DIR, exist_ok=True)
    file_path = os.path.join(TEST_IMG_DIR, f"test_image_{index}.png")

    with open(file_path, "wb") as f:
        # Minimal 1x1 transparent PNG signature
        f.write(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82')
        # Append random padding to make the file large (2.5MB)
        padding_size = int((size_mb * 1024 * 1024) - f.tell())
        f.write(os.urandom(padding_size))

    return file_path

async def count_images(page):
    """
    Counts the number of images currently rendered in the gallery on a page.
    """
    count = await page.locator(".image-wrapper").count()
    if count == 0:
        count = await page.locator(".gallery-item").count()
    if count == 0:
        count = await page.locator("img").count()
    return count

async def upload_image(page, file_path):
    """
    Triggers the upload modal and uploads a specific file.
    """
    await page.locator("#broadcast-soul-btn").click()
    await page.wait_for_selector("#modal-file-input", state="attached", timeout=5000)
    file_input = page.locator("#modal-file-input")
    await file_input.set_input_files(file_path)

    # Give UI a moment to digest the file
    await asyncio.sleep(0.5)

    # Click confirm broadcast
    await page.get_by_text("Broadcast to Mesh").click()

    # Wait for modal to disappear to ensure upload loop started
    await asyncio.sleep(0.5)

async def wait_for_images(page, target_count, timeout_secs=60):
    """
    Polls the page until the target number of images is reached.
    Raises TimeoutError if not reached.
    """
    for _ in range(timeout_secs * 2): # Check every 0.5s
        current = await count_images(page)
        if current >= target_count:
            return current
        await asyncio.sleep(0.5)

    current = await count_images(page)
    raise TimeoutError(f"Timed out waiting for {target_count} images. Found {current}.")

@pytest.mark.asyncio
async def test_p2p_mesh_scenario():
    """
    Executes the advanced 'Real-World' Concurrency Test Scenario exactly as prescribed by the user.
    """
    # Pre-generate 9 large images (~2.5MB each)
    test_files = [create_dummy_image(i) for i in range(1, 10)]

    async with async_playwright() as p:
        # Launch browser. We can use a single browser instance with multiple contexts to simulate distinct peers.
        browser = await p.chromium.launch(headless=True, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])

        try:
            print("\n--- STEP 1: Setup ---")
            context_a = await browser.new_context()
            page_a = await context_a.new_page()

            # Disable Rate Limits on startup via localStorage injected script before navigation
            await page_a.add_init_script("localStorage.setItem('MOLI_DISABLE_RATE_LIMIT', 'true');")
            await page_a.goto(SERVER_URL)
            await asyncio.sleep(3) # Wait for WS connection

            print("Tab A uploading 4 images...")
            for i in range(0, 4):
                await upload_image(page_a, test_files[i])
                await asyncio.sleep(0.5) # Slight stagger

            print("\n--- STEP 2: Initial Sync ---")
            context_b = await browser.new_context()
            page_b = await context_b.new_page()
            await page_b.add_init_script("localStorage.setItem('MOLI_DISABLE_RATE_LIMIT', 'true');")
            await page_b.goto(SERVER_URL)

            context_c = await browser.new_context()
            page_c = await context_c.new_page()
            await page_c.add_init_script("localStorage.setItem('MOLI_DISABLE_RATE_LIMIT', 'true');")
            await page_c.goto(SERVER_URL)

            print("Waiting for B and C to receive the 4 images from A (Inventory Sync & Pull)...")
            # Wait generously as 4 x 2.5MB = 10MB needs to be transferred over WebRTC chunking
            await wait_for_images(page_b, 4, timeout_secs=90)
            await wait_for_images(page_c, 4, timeout_secs=90)
            print("Check passed: B and C have 4 images.")

            print("\n--- STEP 3: Cross-Traffic (The Deadlock Test) ---")
            print("Tab B uploading 2 images...")
            for i in range(4, 6):
                await upload_image(page_b, test_files[i])

            print("Waiting for A and C to receive the 2 new images (Total 6)...")
            # This verifies A can download while its upload queue/history was previously active
            await wait_for_images(page_a, 6, timeout_secs=60)
            await wait_for_images(page_c, 6, timeout_secs=60)
            print("Check passed: A and C have 6 images.")

            print("\n--- STEP 4: Multi-Hop / Mesh ---")
            print("Tab C uploading 2 images...")
            for i in range(6, 8):
                await upload_image(page_c, test_files[i])

            print("Waiting for A and B to receive the 2 new images (Total 8)...")
            await wait_for_images(page_a, 8, timeout_secs=60)
            await wait_for_images(page_b, 8, timeout_secs=60)
            print("Check passed: A and B have 8 images.")

            print("\n--- STEP 5: Return Traffic ---")
            print("Tab A uploading 1 image...")
            await upload_image(page_a, test_files[8])

            print("Waiting for B and C to receive the 1 new image (Total 9)...")
            await wait_for_images(page_b, 9, timeout_secs=30)
            await wait_for_images(page_c, 9, timeout_secs=30)
            print("Check passed: B and C have 9 images.")

            print("\n--- STEP 6: Late Joiner (History Sync) ---")
            print("Tab D joining the mesh...")
            context_d = await browser.new_context()
            page_d = await context_d.new_page()
            await page_d.add_init_script("localStorage.setItem('MOLI_DISABLE_RATE_LIMIT', 'true');")
            await page_d.goto(SERVER_URL)

            print("Waiting for D to sync all 9 previously uploaded images from the mesh...")
            # Late joiner must pull massive history
            await wait_for_images(page_d, 9, timeout_secs=120)
            print("Check passed: D has 9 images.")

            print("\n--- STEP 7: External Browser Verification ---")
            print("Automated test completed successfully. Step 7 requires manual verification by User.")

        finally:
            # Cleanup
            if os.path.exists(TEST_IMG_DIR):
                shutil.rmtree(TEST_IMG_DIR)
            await browser.close()
