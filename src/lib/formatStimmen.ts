/** z. B. `1 Stimme`, `0 Stimmen`, `2 Stimmen` */
export function formatStimmen(count: number): string {
	const n = Math.max(0, Math.trunc(Number(count)) || 0);
	return `${n} ${n === 1 ? 'Stimme' : 'Stimmen'}`;
}
