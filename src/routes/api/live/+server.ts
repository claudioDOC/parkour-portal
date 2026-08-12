import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addLiveClient } from '$lib/server/liveBus';

/**
 * Server-Sent Events: Der Client hält die Verbindung offen; bei jeder
 * Datenänderung (siehe hooks.server.ts) kommt ein `data`-Event und die App
 * lädt ihre Daten neu. Heartbeat hält Proxies bei Laune.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Nicht angemeldet');

	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let removeClient: (() => void) | null = null;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			const send = (data: string) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));

			send('hallo');
			heartbeat = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					if (heartbeat) clearInterval(heartbeat);
				}
			}, 25_000);

			removeClient = addLiveClient({
				send,
				close: () => {
					try {
						controller.close();
					} catch {
						/* schon zu */
					}
				}
			});
		},
		cancel() {
			if (heartbeat) clearInterval(heartbeat);
			removeClient?.();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			// nginx: Stream nicht puffern, sonst kommen Events gebündelt/spät
			'X-Accel-Buffering': 'no'
		}
	});
};
