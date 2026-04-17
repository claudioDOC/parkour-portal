/// <reference types="vite-plugin-pwa/svelte" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-pwa/client" />

declare global {
	namespace App {
		interface Locals {
			user: {
				id: number;
				username: string;
				role: 'admin' | 'spotmanager' | 'member';
				trainingAttendance: 'implicit' | 'opt_in';
				autoAbsentWeekdays: string[];
				uiTheme: import('$lib/uiThemes').UiThemeId;
			} | null;
		}
	}
}

export {};
