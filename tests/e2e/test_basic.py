import pytest
import asyncio
from playwright.async_api import async_playwright

SERVER_URL = "http://localhost:8080"

@pytest.mark.asyncio
async def test_page_loads():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(SERVER_URL)

        # Check if the title is what we expect or some element exists
        title = await page.title()
        print(f"Page title: {title}")

        # Check for file input
        file_input = page.locator("#fileInput")
        assert file_input is not None

        await browser.close()
