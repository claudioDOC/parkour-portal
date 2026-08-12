<script lang="ts">
	/**
	 * Aktivierungs-Dialog beim App-Start: erscheint bei JEDEM Start, solange
	 * Push auf diesem Gerät nicht aktiv ist. „Später" schiebt nur bis zum
	 * nächsten Tag auf — die Gruppe soll erreichbar sein.
	 *
	 * Erzwingen im Wortsinn kann keine Website (Browser verlangen Zustimmung),
	 * das hier ist das erlaubte Maximum.
	 */
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { enablePushOnThisDevice, hasLocalSubscription, pushSupported } from '$lib/pushClient';

	const SNOOZE_KEY = 'push-nag-until';

	type Variant = 'ask' | 'denied' | 'ios-install';
	let visible = $state(false);
	let variant = $state<Variant>('ask');
	let busy = $state(false);
	let successFlash = $state(false);

	function snoozed(): boolean {
		try {
			return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
		} catch {
			return false;
		}
	}

	function snooze(hours: number) {
		try {
			localStorage.setItem(SNOOZE_KEY, String(Date.now() + hours * 3_600_000));
		} catch {
			/* ohne Storage nervt es halt öfter */
		}
		visible = false;
	}

	function isIosWithoutApp(): boolean {
		const ua = navigator.userAgent;
		const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
		const standalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			(window.navigator as Navigator & { standalone?: boolean }).standalone === true;
		return ios && !standalone;
	}

	onMount(async () => {
		if (!browser || snoozed()) return;

		if (!pushSupported()) {
			if (isIosWithoutApp()) {
				variant = 'ios-install';
				visible = true;
			}
			return;
		}
		if (await hasLocalSubscription()) return; // alles gut, kein Dialog
		variant = Notification.permission === 'denied' ? 'denied' : 'ask';
		visible = true;
	});

	async function activate() {
		busy = true;
		try {
			const result = await enablePushOnThisDevice();
			if (result === 'ok') {
				successFlash = true;
				setTimeout(() => (visible = false), 1600);
			} else if (result === 'denied') {
				variant = 'denied';
			} else {
				snooze(4); // technisches Problem — nicht in Endlosschleife nerven
			}
		} finally {
			busy = false;
		}
	}
</script>

{#if visible}
	<div
		class="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[80] mx-auto max-w-md md:bottom-6 md:right-6 md:left-auto"
		role="dialog"
		aria-labelledby="push-onboarding-title"
	>
		<div class="rounded-2xl border border-accent/35 bg-bg-card p-4 shadow-2xl">
			{#if successFlash}
				<p class="py-2 text-center text-sm font-semibold text-success">
					✓ Benachrichtigungen aktiv — du verpasst nichts mehr.
				</p>
			{:else if variant === 'ask'}
				<p id="push-onboarding-title" class="font-semibold text-text-primary">
					🔔 Benachrichtigungen gehören dazu
				</p>
				<p class="mt-1 text-sm leading-snug text-text-secondary">
					Training-Erinnerung am Vorabend, <strong>Spot fix um 16:15</strong> und Absagen —
					ohne Push verpasst du, wo gezogen wird.
				</p>
				<div class="mt-3 flex gap-2">
					<button
						type="button"
						onclick={activate}
						disabled={busy}
						class="flex-1 cursor-pointer rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0c0c0e] transition-colors hover:bg-accent-hover disabled:opacity-50"
					>
						{busy ? '…' : 'Jetzt aktivieren'}
					</button>
					<button
						type="button"
						onclick={() => snooze(20)}
						class="cursor-pointer rounded-lg border border-border px-4 py-2.5 text-sm text-text-muted transition-colors hover:text-text-primary"
					>
						Später
					</button>
				</div>
			{:else if variant === 'denied'}
				<p id="push-onboarding-title" class="font-semibold text-text-primary">
					🔕 Benachrichtigungen sind blockiert
				</p>
				<p class="mt-1 text-sm leading-snug text-text-secondary">
					Dein Browser blockiert Meldungen für das Portal. Erlaube sie in den
					Website-Einstellungen (Schloss-Symbol neben der Adresse) und lade neu — sonst
					verpasst du Spot fix und Absagen.
				</p>
				<button
					type="button"
					onclick={() => snooze(72)}
					class="mt-3 w-full cursor-pointer rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
				>
					Verstanden
				</button>
			{:else}
				<p id="push-onboarding-title" class="font-semibold text-text-primary">
					📲 Installiere zuerst die App
				</p>
				<p class="mt-1 text-sm leading-snug text-text-secondary">
					Auf dem iPhone gibt es Benachrichtigungen nur in der installierten App:
					in Safari <strong>Teilen → Zum Home-Bildschirm</strong>, dann dort öffnen
					und Push aktivieren.
				</p>
				<button
					type="button"
					onclick={() => snooze(20)}
					class="mt-3 w-full cursor-pointer rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
				>
					Später
				</button>
			{/if}
		</div>
	</div>
{/if}
