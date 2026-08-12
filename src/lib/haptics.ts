/** Kurzes haptisches Feedback (Android; iOS ignoriert vibrate stillschweigend). */
import { browser } from '$app/environment';

export function tapFeedback(ms = 8): void {
	if (!browser) return;
	try {
		if (document.documentElement.dataset.motion === 'aus') return;
		navigator.vibrate?.(ms);
	} catch {
		/* Haptik ist Deko */
	}
}
