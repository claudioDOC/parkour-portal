import { error, type RequestEvent } from '@sveltejs/kit';

function getConfiguredKeys(): string[] {
	const raw = process.env.PUBLIC_STATUS_API_KEYS ?? process.env.PUBLIC_STATUS_API_KEY ?? '';
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

function extractProvidedKey(event: RequestEvent): string {
	const direct = event.request.headers.get('x-api-key')?.trim();
	if (direct) return direct;

	const auth = event.request.headers.get('authorization')?.trim() ?? '';
	if (auth.toLowerCase().startsWith('bearer ')) {
		return auth.slice(7).trim();
	}
	return '';
}

export function assertPublicStatusApiKey(event: RequestEvent): void {
	const keys = getConfiguredKeys();
	if (keys.length === 0) {
		throw error(
			503,
			'PUBLIC_STATUS_API_KEY(S) ist nicht gesetzt. Bitte Server-Umgebungsvariable konfigurieren.'
		);
	}

	const provided = extractProvidedKey(event);
	if (!provided || !keys.includes(provided)) {
		throw error(401, 'Unauthorized');
	}
}
