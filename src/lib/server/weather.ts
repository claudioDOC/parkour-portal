const THUN_LAT = 46.76;
const THUN_LON = 7.63;

export interface WeatherData {
	temperature: number;
	isWet: boolean;
	isDark: boolean;
	precipitation: number;
	weatherLabel: string;
}

interface OpenMeteoResponse {
	current: {
		temperature_2m: number;
		precipitation: number;
		is_day: number;
	};
}

export async function getCurrentWeather(): Promise<WeatherData> {
	const url = `https://api.open-meteo.com/v1/forecast?latitude=${THUN_LAT}&longitude=${THUN_LON}&current=temperature_2m,precipitation,is_day&timezone=Europe%2FZurich`;

	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Open-Meteo API error: ${res.status}`);

		const data: OpenMeteoResponse = await res.json();
		const { temperature_2m, precipitation, is_day } = data.current;

		const isWet = precipitation > 0;
		const isDark = is_day === 0;

		let weatherLabel = '';
		if (isWet && temperature_2m < 1) weatherLabel = 'Schnee';
		else if (isWet) weatherLabel = 'Regen';
		else weatherLabel = 'Trocken';

		if (isDark) weatherLabel += ', Dunkel';
		else weatherLabel += ', Hell';

		if (temperature_2m < 5) weatherLabel += ', Kalt';
		else if (temperature_2m > 25) weatherLabel += ', Warm';

		return {
			temperature: temperature_2m,
			isWet,
			isDark,
			precipitation,
			weatherLabel
		};
	} catch (err) {
		console.error('Wetter-API Fehler:', err);
		return {
			temperature: 15,
			isWet: false,
			isDark: false,
			precipitation: 0,
			weatherLabel: 'Unbekannt (API nicht erreichbar)'
		};
	}
}
