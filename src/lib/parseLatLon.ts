/**
 * Koordinaten im Format «Breitengrad, Längengrad» (wie aus Maps kopiert).
 */
export function parseLatLonPair(input: string): { latitude: number; longitude: number } | null {
	const raw = input.trim();
	if (!raw) return null;

	const parts = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
	if (parts.length !== 2) return null;

	const latitude = Number(parts[0]);
	const longitude = Number(parts[1]);
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
	if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

	return { latitude, longitude };
}

export function formatLatLonPair(
	latitude: number | null | undefined,
	longitude: number | null | undefined
): string {
	if (
		latitude == null ||
		longitude == null ||
		!Number.isFinite(latitude) ||
		!Number.isFinite(longitude)
	) {
		return '';
	}
	return `${latitude}, ${longitude}`;
}
