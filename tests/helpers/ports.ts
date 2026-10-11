/**
 * Shared port test helpers — occupy consecutive loopback ports and close
 * servers. The plannotator network tests bind to 127.0.0.1, so occupied
 * servers must listen on the same host to trigger EADDRINUSE.
 */
import { createServer, type Server } from "node:http";

function listen(server: Server, port: number): Promise<void> {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const onError = (error: Error) => {
		server.removeListener("listening", onListening);
		reject(error);
	};
	const onListening = () => {
		server.removeListener("error", onError);
		resolve();
	};
	server.once("error", onError);
	server.once("listening", onListening);
	server.listen(port, "127.0.0.1");
	return promise;
}

function serverPort(server: Server): number {
	const addr = server.address();
	if (addr === null || typeof addr === "string") {
		throw new Error("server has no bound numeric port");
	}
	return addr.port;
}

export function closeServer(server: Server): Promise<void> {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	server.close((error) => {
		if (error) reject(error);
		else resolve();
	});
	return promise;
}

/**
 * Bind `count` servers on `count` consecutive loopback ports.
 * Returns the first port and the servers (caller closes them).
 * Retries from scratch when the OS hands out a non-consecutive run.
 */
export async function occupyConsecutivePorts(count: number): Promise<{
	start: number;
	servers: Server[];
}> {
	for (let attempt = 0; attempt < 50; attempt++) {
		const servers: Server[] = [];
		try {
			const first = createServer();
			await listen(first, 0);
			const start = serverPort(first);
			servers.push(first);
			for (let i = 1; i < count; i++) {
				const server = createServer();
				await listen(server, start + i);
				servers.push(server);
			}
			return { start, servers };
		} catch {
			await Promise.all(
				servers.map((server) => closeServer(server).catch(() => {})),
			);
		}
	}
	throw new Error(`could not occupy ${count} consecutive ports`);
}
