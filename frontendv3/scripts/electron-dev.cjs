const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');

const DEFAULT_PORT_CANDIDATES = [5173, 5174, 5175, 3000, 3001];

function isPortFree(port) {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.once('error', () => resolve(false));
		server.once('listening', () => {
			server.close(() => resolve(true));
		});
		server.listen(port);
	});
}

async function pickPort() {
	const envPort = Number.parseInt(process.env.VITE_DEV_PORT ?? '', 10);
	if (Number.isFinite(envPort) && envPort > 0) {
		const free = await isPortFree(envPort);
		if (!free) throw new Error(`Port ${envPort} is already in use (set VITE_DEV_PORT to another port).`);
		return envPort;
	}

	for (const port of DEFAULT_PORT_CANDIDATES) {
		// eslint-disable-next-line no-await-in-loop
		if (await isPortFree(port)) return port;
	}
	throw new Error('No free dev port found (tried ' + DEFAULT_PORT_CANDIDATES.join(', ') + ').');
}

function waitForHttp(url, { timeoutMs = 30000, intervalMs = 250 } = {}) {
	const started = Date.now();

	return new Promise((resolve, reject) => {
		const tick = () => {
			if (Date.now() - started > timeoutMs) {
				reject(new Error(`Timed out waiting for ${url}`));
				return;
			}

			const req = http.get(url, (res) => {
				res.resume();
				resolve();
			});
			req.on('error', () => setTimeout(tick, intervalMs));
		};

		tick();
	});
}

function run() {
	return (async () => {
		const port = await pickPort();
		const devUrl = `http://localhost:${port}`;

		const commonEnv = {
			...process.env,
			NODE_ENV: 'development',
			VITE_DEV_PORT: String(port),
			VITE_DEV_SERVER_URL: devUrl,
		};

		const isWindows = process.platform === 'win32';
		const binExt = isWindows ? '.cmd' : '';
		const viteCmd = path.join(__dirname, '..', 'node_modules', '.bin', 'vite' + binExt);
		const electronCmd = path.join(__dirname, '..', 'node_modules', '.bin', 'electron' + binExt);

		const vite = spawn(viteCmd, ['--port', String(port), '--strictPort'], {
			stdio: 'inherit',
			env: commonEnv,
			shell: isWindows,
		});

		let electron;
		const shutdown = (code = 0) => {
			try {
				if (electron && !electron.killed) electron.kill();
			} catch {
				// ignore
			}
			try {
				if (vite && !vite.killed) vite.kill();
			} catch {
				// ignore
			}
			process.exit(code);
		};

		process.on('SIGINT', () => shutdown(0));
		process.on('SIGTERM', () => shutdown(0));

		vite.on('exit', (code) => {
			if (electron && !electron.killed) {
				try {
					electron.kill();
				} catch {
					// ignore
				}
			}
			shutdown(code ?? 1);
		});

		await waitForHttp(devUrl);

		electron = spawn(electronCmd, ['.'], {
			stdio: 'inherit',
			env: commonEnv,
			shell: isWindows,
		});

		electron.on('exit', (code) => {
			shutdown(code ?? 0);
		});
	})();
}

run().catch((err) => {
	// eslint-disable-next-line no-console
	console.error(err);
	process.exit(1);
});
