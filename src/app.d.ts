declare global {
	namespace App {
		interface Locals {
			user: {
				id: number;
				username: string;
				role: 'admin' | 'spotmanager' | 'member';
				trainingAttendance: 'implicit' | 'opt_in';
				autoAbsentWeekdays: string[];
			} | null;
		}
	}
}

export {};
