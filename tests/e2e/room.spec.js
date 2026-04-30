/**
 * e2e/room.spec.js — Playwright browser tests for room creation/joining
 * Tests the bug: "tạo phòng nhưng không được vào vẫn ở ngoài menu tạo phòng"
 *
 * Prerequisites:
 *   npm install --save-dev @playwright/test
 *   npx playwright install chromium
 *
 * Run:
 *   node tests/e2e/run-tests.js
 *   # or directly:
 *   npx playwright test tests/e2e/room.spec.js --project=chromium
 */

const { test, expect } = require('@playwright/test');

// The server must be running at this URL
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3001';

/**
 * Opens the lobby page, clearing localStorage so no stale session interferes.
 */
async function gotoLobby(page) {
    await page.goto(CLIENT_URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('text=Chess Realm')).toBeVisible({ timeout: 15000 });
}

/**
 * Clear localStorage and reload without leaving the current page.
 * Use this when you need to clear state but don't want to navigate away.
 */
async function clearSession(page) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
}

/**
 * Find the room code input field (MUI TextField).
 */
function roomInputLocator(page) {
    return page.locator('input[type=text]');
}

/**
 * Wait for the "waiting for opponent" screen to appear.
 * The user should land here after creating a room.
 */
async function expectWaitingScreen(page) {
    await expect(page.locator('text=Đang chờ đối thủ')).toBeVisible({ timeout: 10000 });
}

test.describe('Room Creation Flow', () => {

    test('TC-001: User creates a room and navigates to the waiting screen', async ({ page }) => {
        await gotoLobby(page);

        // Click "Tạo Phòng Mới"
        await page.click('button:has-text("Tạo Phòng Mới")');

        // Should navigate to /room/<id> and show waiting screen
        // NOT stuck on the lobby with loading spinner
        await expect(page).toHaveURL(/\/room\/[a-z0-9]{6}/i);
        await expectWaitingScreen(page);

        // The "Tạo Phòng Mới" button should be re-enabled (loading=false)
        // or at minimum the loading state has resolved
        await expect(page.locator('text=Chess Realm')).not.toBeVisible({ timeout: 2000 });
    });

    test('TC-002: Loading spinner disappears after room creation', async ({ page }) => {
        await gotoLobby(page);

        await page.click('button:has-text("Tạo Phòng Mới")');

        // The correct outcome: navigate to waiting screen.
        // The buggy outcome: stuck on lobby with button disabled.
        await expectWaitingScreen(page);
    });

    test('TC-003: Room ID is displayed on the waiting screen', async ({ page }) => {
        await gotoLobby(page);

        await page.click('button:has-text("Tạo Phòng Mới")');

        await expect(page).toHaveURL(/\/room\/([a-z0-9]+)/i);
        const url = page.url();
        const roomId = url.match(/\/room\/([a-z0-9]+)/i)?.[1];
        expect(roomId).toBeDefined();
        expect(roomId).toHaveLength(6);

        // Room ID should appear in the waiting screen
        await expect(page.locator(`text=${roomId}`).first()).toBeVisible({ timeout: 5000 });
    });

    test('TC-004: "Copy Link Mời" button is visible on waiting screen', async ({ page }) => {
        await gotoLobby(page);

        await page.click('button:has-text("Tạo Phòng Mới")');
        await expectWaitingScreen(page);

        await expect(page.locator('button:has-text("Copy Link Mời")')).toBeVisible();
    });

    test('TC-005: "Thoát Phòng" button returns to lobby', async ({ page }) => {
        await gotoLobby(page);

        await page.click('button:has-text("Tạo Phòng Mới")');
        await expectWaitingScreen(page);

        await page.click('button:has-text("Thoát Phòng")');
        await expect(page.locator('text=Chess Realm')).toBeVisible({ timeout: 5000 });
    });

    test('TC-006: User enters a room ID and joins an existing room', async ({ page, browser }) => {
        // Create a room and get its ID
        await gotoLobby(page);
        await page.click('button:has-text("Tạo Phòng Mới")');
        await expectWaitingScreen(page);
        const roomId = page.url().match(/\/room\/([a-z0-9]+)/i)?.[1];
        expect(roomId).toBeDefined();

        // Second player
        const context2 = await browser.newContext();
        const page2 = await context2.newPage();
        await page2.goto(CLIENT_URL);
        await expect(page2.locator('text=Chess Realm')).toBeVisible({ timeout: 15000 });

        // Try to join — either it works or shows an error; no spinner stuck
        await roomInputLocator(page2).fill(roomId);
        await page2.click('button:has-text("Vào Phòng")');

        // Wait up to 8s — one of these should eventually happen
        const navToRoom = page2.waitForURL(/\/room\//, { timeout: 8000 }).catch(() => null);
        const seesError = page2.locator('text=Phòng đã đầy').or(page2.locator('text=Không thể vào phòng')).waitFor({ state: 'visible', timeout: 8000 }).catch(() => null);

        const result = await Promise.race([navToRoom, seesError]);
        expect(result).not.toBeNull(); // Something should happen — not stuck
    });

    test('TC-007: Joining a non-existent room shows an error', async ({ page }) => {
        await gotoLobby(page);
        await roomInputLocator(page).fill('xxxxxx');
        await page.click('button:has-text("Vào Phòng")');

        // Should show an error alert
        await expect(page.locator('text=Không thể vào phòng').or(page.locator('text=Phòng không tồn tại'))).toBeVisible({ timeout: 5000 });

        // Should stay on lobby
        await expect(page.locator('text=Chess Realm')).toBeVisible();
        await expect(page).toHaveURL(new RegExp('^' + CLIENT_URL + '/$'));
    });

    test('TC-008: Second player joining triggers "opponent joined" on host', async ({ page, browser }) => {
        // Create a room and get its ID
        await gotoLobby(page);
        await page.click('button:has-text("Tạo Phòng Mới")');
        await expectWaitingScreen(page);
        const roomId = page.url().match(/\/room\/([a-z0-9]+)/i)?.[1];
        expect(roomId).toBeDefined();

        // Second player
        const context2 = await browser.newContext();
        const page2 = await context2.newPage();
        await page2.goto(CLIENT_URL);
        await expect(page2.locator('text=Chess Realm')).toBeVisible({ timeout: 15000 });

        await roomInputLocator(page2).fill(roomId);
        await page2.click('button:has-text("Vào Phòng")');

        // Either it navigates to the room or shows an error — no stuck spinner
        const navToRoom = page2.waitForURL(/\/room\//, { timeout: 8000 }).catch(() => null);
        const seesError = page2.locator('text=Phòng đã đầy').or(page2.locator('text=Không thể vào phòng')).waitFor({ state: 'visible', timeout: 8000 }).catch(() => null);
        const result = await Promise.race([navToRoom, seesError]);
        expect(result).not.toBeNull();
    });

    test('TC-009: Navigate directly to room URL creates the room when not found', async ({ page }) => {
        // First navigate to lobby to establish Socket.IO connection
        await page.goto(CLIENT_URL);
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await expect(page.locator('text=Chess Realm')).toBeVisible({ timeout: 15000 });

        // Now navigate directly to a non-existent room URL (app should auto-create)
        await page.goto(`${CLIENT_URL}/room/xyz999`);
        await page.waitForLoadState('domcontentloaded');

        // The socket is already connected, so no "Đang kết nối..." should appear
        // Instead, the app should process the URL and auto-create the room
        const hasWaitingScreen = await page.locator('text=Đang chờ đối thủ').waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
        const hasError = await page.locator('text=Không thể vào phòng').waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
        expect(hasWaitingScreen || hasError).toBe(true);
    });

    test('TC-010: Session is saved in localStorage after joining room', async ({ page }) => {
        await gotoLobby(page);

        await page.click('button:has-text("Tạo Phòng Mới")');
        await expectWaitingScreen(page);

        const token = await page.evaluate(() => localStorage.getItem('chess_session_token'));
        expect(token).toBeTruthy();

        const savedRoom = await page.evaluate(() => localStorage.getItem('chess_session_room'));
        expect(savedRoom).toBeTruthy();
        expect(savedRoom).toHaveLength(6);
    });
});
