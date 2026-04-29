/**
 * Prognose fürs Trainingsintervall (Uhrzeit aus Session), Standort Thun — Open-Meteo.
 * Licht-Muster: orientiert an „ohne Lampe noch orientieren können“, nicht Wetter „schön“.
 */

const THUN_LAT = 46.76;
const THUN_LON = 7.63;

const CACHE_TTL_MS = 12 * 60 * 1000;

export type LightCategory = 'hell' | 'dunkel' | 'misch';
export type PrecipCondition = 'trocken' | 'regen' | 'schnee' | 'unsicher';

export interface TrainingForecast {
	date: string;
	timeStart: string;
	timeEnd: string;
	temperatureInWindow: number;
	precipMmExpected: number;
	snowCmExpected: number;
	precipProbabilityMax: number;
	condition: PrecipCondition;
	lightCategory: LightCategory;
	/** Anteil der Zeit ohne ausreichendes natürliches Licht (Orientieren ohne Lampe). */
	darkFraction: number;
	summaryLine: string;
	fetchedAt: string;
	/** Nass/Schnee → Spot-Eignung „nass“ */
	isWet: boolean;
	/** Nur bei stark dunkel: SQL lighting != nein (wie früher isDark). */
	applyLightingHardFilter: boolean;
}

interface OpenMeteoHourly {
	time: string[];
	temperature_2m: number[];
	precipitation: number[];
	rain: number[];
	snowfall: number[];
	precipitation_probability: number[];
}

interface OpenMeteoDaily {
	time: string[];
	sunset: string[];
}

interface OpenMeteoJson {
	hourly?: OpenMeteoHourly;
	daily?: OpenMeteoDaily;
}

type CacheEntry = { forecast: TrainingForecast; expires: number };
const cache = new Map<string, CacheEntry>();

function parseHmToMinutes(hm: string): number {
	const [h, m] = hm.split(':').map((x) => Number(x.trim()));
	if (!Number.isFinite(h)) return 0;
	return h * 60 + (Number.isFinite(m) ? m : 0);
}

/** Zeitteil aus ISO/Open-Meteo (z. B. „2026-04-17T20:23“ oder „20:23:00“). */
function parseClockToMinutes(isoOrClock: string): number {
	const tail = isoOrClock.includes('T') ? isoOrClock.split('T')[1]! : isoOrClock;
	const parts = tail.split(':');
	const hh = Number(parts[0]);
	const mm = Number(parts[1] ?? 0);
	if (!Number.isFinite(hh)) return 0;
	return hh * 60 + (Number.isFinite(mm) ? mm : 0);
}

function splitLitDark(windowStartMin: number, windowEndMin: number, sunsetMin: number) {
	const dur = windowEndMin - windowStartMin;
	if (dur <= 0) return { lit: 0, dark: dur, darkFraction: 1 };
	if (sunsetMin <= windowStartMin) return { lit: 0, dark: dur, darkFraction: 1 };
	if (sunsetMin >= windowEndMin) return { lit: dur, dark: 0, darkFraction: 0 };
	const lit = sunsetMin - windowStartMin;
	const dark = windowEndMin - sunsetMin;
	return { lit, dark, darkFraction: dark / dur };
}

function classifyLight(darkFraction: number): LightCategory {
	if (darkFraction >= 0.8) return 'dunkel';
	if (darkFraction <= 0.05) return 'hell';
	return 'misch';
}

function classifyPrecip(
	precipMm: number,
	rainMm: number,
	snowCm: number,
	popMax: number,
	tempAvg: number
): PrecipCondition {
	if (snowCm >= 0.12 && tempAvg < 3.5) return 'schnee';
	if (rainMm >= 0.22 || precipMm >= 0.38 || popMax >= 58) return 'regen';
	if (precipMm >= 0.1 || popMax >= 44) return 'unsicher';
	return 'trocken';
}

function weightedHourlySlice(
	times: string[],
	values: number[],
	dateStr: string,
	windowStartMin: number,
	windowEndMin: number
): number {
	let sum = 0;
	for (let i = 0; i < times.length; i++) {
		if (!times[i]!.startsWith(dateStr)) continue;
		const hour = Number(times[i]!.slice(11, 13));
		if (!Number.isFinite(hour)) continue;
		const segStart = hour * 60;
		const segEnd = segStart + 60;
		const lo = Math.max(windowStartMin, segStart);
		const hi = Math.min(windowEndMin, segEnd);
		if (hi > lo) {
			sum += (values[i] ?? 0) * ((hi - lo) / 60);
		}
	}
	return sum;
}

function weightedAvgTemp(
	times: string[],
	values: number[],
	dateStr: string,
	windowStartMin: number,
	windowEndMin: number
): number {
	let num = 0;
	let den = 0;
	for (let i = 0; i < times.length; i++) {
		if (!times[i]!.startsWith(dateStr)) continue;
		const hour = Number(times[i]!.slice(11, 13));
		if (!Number.isFinite(hour)) continue;
		const segStart = hour * 60;
		const segEnd = segStart + 60;
		const lo = Math.max(windowStartMin, segStart);
		const hi = Math.min(windowEndMin, segEnd);
		if (hi > lo) {
			const frac = (hi - lo) / 60;
			num += (values[i] ?? 0) * frac;
			den += frac;
		}
	}
	if (den <= 0) return 12;
	return num / den;
}

function maxPopInWindow(
	times: string[],
	pops: number[],
	dateStr: string,
	windowStartMin: number,
	windowEndMin: number
): number {
	let m = 0;
	for (let i = 0; i < times.length; i++) {
		if (!times[i]!.startsWith(dateStr)) continue;
		const hour = Number(times[i]!.slice(11, 13));
		if (!Number.isFinite(hour)) continue;
		const segStart = hour * 60;
		const segEnd = segStart + 60;
		if (segEnd > windowStartMin && segStart < windowEndMin) {
			m = Math.max(m, pops[i] ?? 0);
		}
	}
	return m;
}

function buildSummary(condition: PrecipCondition, light: LightCategory, temp: number): string {
	const licht =
		light === 'hell' ? 'hell' : light === 'dunkel' ? 'dunkel' : 'hälfte hell';

	let wet: string;
	switch (condition) {
		case 'trocken':
			wet = 'trocken';
			break;
		case 'regen':
			wet = 'nass';
			break;
		case 'schnee':
			wet = 'schnee';
			break;
		default:
			wet = 'feucht';
	}

	return `Prognose: ${licht} · ${Math.round(temp)}°C · ${wet}`;
}

export async function getTrainingWindowForecast(params: {
	date: string;
	timeStart: string;
	timeEnd: string;
}): Promise<TrainingForecast> {
	const { date, timeStart, timeEnd } = params;
	const cacheKey = `${date}|${timeStart}|${timeEnd}`;
	const now = Date.now();
	const hit = cache.get(cacheKey);
	if (hit && hit.expires > now) return hit.forecast;

	const ws = parseHmToMinutes(timeStart);
	const we = parseHmToMinutes(timeEnd);

	const url =
		`https://api.open-meteo.com/v1/forecast?latitude=${THUN_LAT}&longitude=${THUN_LON}` +
		`&hourly=temperature_2m,precipitation,rain,snowfall,precipitation_probability` +
		`&daily=sunset` +
		`&timezone=Europe%2FZurich` +
		`&start_date=${encodeURIComponent(date)}` +
		`&end_date=${encodeURIComponent(date)}`;

	let hourly: OpenMeteoHourly | undefined;
	let sunsetIso = '';

	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error(String(res.status));
		const data = (await res.json()) as OpenMeteoJson;
		hourly = data.hourly;
		const idx = data.daily?.time?.findIndex((t) => t === date) ?? 0;
		sunsetIso = data.daily?.sunset?.[idx] ?? data.daily?.sunset?.[0] ?? '';
	} catch {
		const fb = fallbackForecast(date, timeStart, timeEnd);
		cache.set(cacheKey, { forecast: fb, expires: now + 120_000 });
		return fb;
	}

	if (!hourly?.time?.length) {
		const fb = fallbackForecast(date, timeStart, timeEnd);
		cache.set(cacheKey, { forecast: fb, expires: now + 120_000 });
		return fb;
	}

	const precipMm = weightedHourlySlice(
		hourly.time,
		hourly.precipitation,
		date,
		ws,
		we
	);
	const rainMm = weightedHourlySlice(hourly.time, hourly.rain, date, ws, we);
	const snowCm = weightedHourlySlice(hourly.time, hourly.snowfall, date, ws, we);

	const temperatureInWindow = weightedAvgTemp(
		hourly.time,
		hourly.temperature_2m.map((x) => x ?? 12),
		date,
		ws,
		we
	);

	const popMax = maxPopInWindow(hourly.time, hourly.precipitation_probability, date, ws, we);

	let sunsetMin = parseClockToMinutes(sunsetIso || `${date}T20:00`);
	if (!sunsetIso) {
		sunsetMin = ws + Math.round((we - ws) * 0.5);
	}

	let { darkFraction } = splitLitDark(ws, we, sunsetMin);
	/** Natürliches Licht bis mindestens Session-Ende: ohne Lampe noch orientierbar → fest „hell“. */
	if (sunsetMin >= we) {
		darkFraction = 0;
	}
	const lightCategory = classifyLight(darkFraction);

	const condition = classifyPrecip(precipMm, rainMm, snowCm, popMax, temperatureInWindow);
	const isWet = condition === 'regen' || condition === 'schnee';

	const summaryLine = buildSummary(condition, lightCategory, temperatureInWindow);

	const forecast: TrainingForecast = {
		date,
		timeStart,
		timeEnd,
		temperatureInWindow,
		precipMmExpected: precipMm,
		snowCmExpected: snowCm,
		precipProbabilityMax: popMax,
		condition,
		lightCategory,
		darkFraction,
		summaryLine,
		fetchedAt: new Date().toISOString(),
		isWet,
		applyLightingHardFilter: lightCategory === 'dunkel'
	};

	cache.set(cacheKey, { forecast, expires: now + CACHE_TTL_MS });
	return forecast;
}

function fallbackForecast(date: string, timeStart: string, timeEnd: string): TrainingForecast {
	const now = new Date().toISOString();
	return {
		date,
		timeStart,
		timeEnd,
		temperatureInWindow: 12,
		precipMmExpected: 0,
		snowCmExpected: 0,
		precipProbabilityMax: 0,
		condition: 'unsicher',
		lightCategory: 'misch',
		darkFraction: 0.4,
		summaryLine: 'Prognose: keine Daten',
		fetchedAt: now,
		isWet: false,
		applyLightingHardFilter: false
	};
}
