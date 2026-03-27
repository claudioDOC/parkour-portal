import { join, resolve } from 'node:path';

/** Schreibziel für neue Uploads (neben DB unter `data/`, in Prod meist beschreibbar). */
export function getUploadWriteDir(): string {
	return join(process.cwd(), 'data', 'uploads');
}

/** Lesen: zuerst data/uploads, dann legacy static/uploads. */
export function getUploadReadDirs(): string[] {
	return [getUploadWriteDir(), join(process.cwd(), 'static', 'uploads')];
}
