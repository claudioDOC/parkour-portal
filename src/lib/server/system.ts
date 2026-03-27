import os from 'node:os';
import path from 'node:path';
import { statfs } from 'node:fs/promises';

export type SystemSnapshot = {
	hostname: string;
	platform: string;
	uptimeSeconds: number;
	memory: {
		total: number;
		free: number;
		used: number;
		usedPercent: number;
	};
	process: {
		rss: number;
		heapUsed: number;
	};
	load: {
		avg1: number;
		avg5: number;
		avg15: number;
		cpus: number;
	};
	disk: {
		path: string;
		total: number;
		free: number;
		used: number;
		usedPercent: number;
	} | null;
};

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

export async function getSystemSnapshot(): Promise<SystemSnapshot> {
	const totalMem = os.totalmem();
	const freeMem = os.freemem();
	const usedMem = totalMem - freeMem;

	const [la1, la5, la15] = os.loadavg();
	const mu = process.memoryUsage();

	let disk: SystemSnapshot['disk'] = null;
	const diskPath = path.resolve(process.cwd(), 'data');
	try {
		const s = await statfs(diskPath);
		const bsize = Number(s.bsize);
		const blocks = Number(s.blocks);
		const bavail = Number(s.bavail);
		const total = blocks * bsize;
		const free = bavail * bsize;
		const used = total - free;
		disk = {
			path: diskPath,
			total,
			free,
			used,
			usedPercent: total > 0 ? round2((used / total) * 100) : 0
		};
	} catch {
		try {
			const s = await statfs(process.cwd());
			const bsize = Number(s.bsize);
			const blocks = Number(s.blocks);
			const bavail = Number(s.bavail);
			const total = blocks * bsize;
			const free = bavail * bsize;
			const used = total - free;
			disk = {
				path: process.cwd(),
				total,
				free,
				used,
				usedPercent: total > 0 ? round2((used / total) * 100) : 0
			};
		} catch {
			disk = null;
		}
	}

	return {
		hostname: os.hostname(),
		platform: os.platform(),
		uptimeSeconds: Math.floor(os.uptime()),
		memory: {
			total: totalMem,
			free: freeMem,
			used: usedMem,
			usedPercent: totalMem > 0 ? round2((usedMem / totalMem) * 100) : 0
		},
		process: {
			rss: mu.rss,
			heapUsed: mu.heapUsed
		},
		load: {
			avg1: round2(la1),
			avg5: round2(la5),
			avg15: round2(la15),
			cpus: os.cpus().length
		},
		disk
	};
}
