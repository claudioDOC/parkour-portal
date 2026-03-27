/**
 * Regionen für Spot-Finder: mehrere Gemeinden auf einwahlbar (Arbeitsweg / Pendeln).
 * Strings müssen exakt mit `spots.city` in der DB übereinstimmen.
 */
export type CityRegion = { id: string; label: string; cities: string[] };

export const CITY_REGIONS: CityRegion[] = [
	{
		id: 'thun',
		label: 'Thun & Umgebung',
		cities: ['Thun', 'Hünibach', 'Steffisburg', 'Heimberg']
	},
	{
		id: 'bern',
		label: 'Bern & Umgebung',
		cities: [
			'Bern',
			'Niederwangen',
			'Worb',
			'Ittigen',
			'Bümpliz',
			'Kehrsatz',
			'Belp'
		]
	},
	{
		id: 'muensingen',
		label: 'Münsingen & Umgebung',
		cities: ['Münsingen', 'Rubigen']
	}
];
