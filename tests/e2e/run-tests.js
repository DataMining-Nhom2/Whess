/**
 * tests/e2e/run-tests.js — Start servers and run Playwright tests
 *
 * Usage:
 *   node tests/e2e/run-tests.js
 *
 * Prerequisites:
 *   npm install --save-dev @playwright/test concurrently
 *   npx playwright install chromium
 *
 * The test uses:
 *   CLIENT_URL = http://localhost:3001 (React dev server)
 *   SERVER_URL = http://localhost:3000 (Socket.IO server)
 */

const { spawn, execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SERVER_DIR = path.join(ROOT, 'server');

const isWin = process.platform === 'win32';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let serverProc = null;
let clientProc = null;
let playwrightExitCode = 0;

async function run() {
    console.log('\n=== Starting Whess E2E Test Runner ===\n');

    // ─── 1. Check / install Playwright ─────────────────────────────────────────
    console.log('[Runner] Checking Playwright...');
    try {
        execSync('npx playwright --version', { stdio: 'pipe', cwd: ROOT });
    } catch {
        console.log('[Runner] Installing Playwright...');
        execSync('npm install --save-dev @playwright/test', { stdio: 'inherit', cwd: ROOT });
        execSync('npx playwright install chromium', { stdio: 'inherit', cwd: ROOT });
    }

    // ─── 2. Start Socket.IO server ──────────────────────────────────────────────
    console.log('[Runner] Starting server (port 3000)...');
    serverProc = spawn(isWin ? 'npm.cmd' : 'npm', ['start'], {
        cwd: SERVER_DIR,
        env: { ...process.env, PORT: '3000' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProc.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
    serverProc.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

    // ─── 3. Start React dev client ──────────────────────────────────────────────
    console.log('[Runner] Starting client (port 3001)...');
    clientProc = spawn(isWin ? 'npm.cmd' : 'npm', ['start'], {
        cwd: CLIENT_DIR,
        env: { ...process.env, PORT: '3001' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    clientProc.stdout.on('data', (d) => process.stdout.write(`[client] ${d}`));
    clientProc.stderr.on('data', (d) => process.stderr.write(`[client] ${d}`));

    // ─── 4. Wait for servers to be ready ───────────────────────────────────────
    console.log('[Runner] Waiting for server to be ready...');
    let serverReady = false;
    for (let i = 0; i < 60; i++) {
        await sleep(1000);
        try {
            const res = await fetch('http://localhost:3000/health');
            if (res.ok) {
                serverReady = true;
                break;
            }
        } catch {
            process.stdout.write('.');
        }
    }
    if (!serverReady) {
        console.error('\n[Runner] Server did not start in 60s. Giving up.');
        process.exit(1);
    }
    console.log('\n[Runner] Server is ready!');

    console.log('[Runner] Waiting for client to be ready...');
    let clientReady = false;
    for (let i = 0; i < 60; i++) {
        await sleep(1000);
        try {
            const res = await fetch('http://localhost:3001');
            if (res.ok) {
                clientReady = true;
                break;
            }
        } catch {
            process.stdout.write('.');
        }
    }
    if (!clientReady) {
        console.error('\n[Runner] Client did not start in 60s. Giving up.');
        process.exit(1);
    }
    console.log('\n[Runner] Client is ready!');

    // ─── 5. Run Playwright tests ────────────────────────────────────────────────
    console.log('\n[Runner] Running Playwright tests...\n');
    try {
        execSync('npx playwright test tests/e2e/room.spec.js --project=chromium', {
            stdio: 'inherit',
            cwd: ROOT,
            env: {
                ...process.env,
                SERVER_URL: 'http://localhost:3000',
                CLIENT_URL: 'http://localhost:3001',
            },
        });
        playwrightExitCode = 0;
    } catch (e) {
        playwrightExitCode = e.status || 1;
    }

    // ─── 6. Cleanup ─────────────────────────────────────────────────────────────
    console.log('\n[Runner] Shutting down servers...');
    if (clientProc) {
        clientProc.on('error', () => {});
        isWin ? execSync('taskkill /F /PID ' + clientProc.pid, { stdio: 'ignore' }) : clientProc.kill('SIGTERM');
    }
    if (serverProc) {
        serverProc.on('error', () => {});
        isWin ? execSync('taskkill /F /PID ' + serverProc.pid, { stdio: 'ignore' }) : serverProc.kill('SIGTERM');
    }

    console.log(`\n[Runner] Done. Exit code: ${playwrightExitCode}`);
    process.exit(playwrightExitCode);
}

run().catch((e) => {
    console.error('[Runner] Fatal error:', e);
    if (clientProc) clientProc.kill();
    if (serverProc) serverProc.kill();
    process.exit(1);
});
