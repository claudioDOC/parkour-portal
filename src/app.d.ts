declare global {
	namespace App {
		interface Locals {
			user: {
				id: number;
				username: string;
				role: 'admin' | 'spotmanager' | 'member';
			} | null;
		}
	}
}

export {};
