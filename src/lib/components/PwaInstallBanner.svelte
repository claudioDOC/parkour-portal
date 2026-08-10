<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	const DISMISS_KEY = 'pwa-install-prompt-dismissed';

	interface BeforeInstallPromptEvent extends Event {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let deferred = $state<BeforeInstallPromptEvent | null>(null);
	let installing = $state(false);
	/** iOS kennt kein `beforeinstallprompt` — dort führen wir per Anleitung durch. */
	let showIosHint = $state(false);

	function alreadyInstalled(): boolean {
		if (!browser) return true;
		if (window.matchMedia('(display-mode: standalone)').matches) return true;
		return 'standalone' in window.navigator && (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
	}

	function isIos(): boolean {
		if (!browser) return false;
		const ua = navigator.userAgent;
		// iPadOS meldet sich seit 13 als Macintosh — Touch-Punkte entlarven es.
		return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
	}

	function isSafari(): boolean {
		if (!browser) return false;
		const ua = navigator.userAgent;
		// Nur Safari kann auf iOS zum Home-Bildschirm hinzufügen.
		return /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
	}

	function isDismissed(): boolean {
		try {
			return localStorage.getItem(DISMISS_KEY) === '1';
		} catch {
			return false;
		}
	}

	onMount(() => {
		if (!browser || alreadyInstalled() || isDismissed()) return;

		if (isIos()) {
			showIosHint = true;
			return;
		}

		const onBeforeInstall = (e: Event) => {
			e.preventDefault();
			deferred = e as BeforeInstallPromptEvent;
		};

		window.addEventListener('beforeinstallprompt', onBeforeInstall, { capture: true });

		const onInstalled = () => {
			deferred = null;
		};
		window.addEventListener('appinstalled', onInstalled);

		return () => {
			window.removeEventListener('beforeinstallprompt', onBeforeInstall, { capture: true });
			window.removeEventListener('appinstalled', onInstalled);
		};
	});

	function dismiss() {
		deferred = null;
		showIosHint = false;
		try {
			localStorage.setItem(DISMISS_KEY, '1');
		} catch {
			/* ignore */
		}
	}

	async function install() {
		if (!deferred) return;
		installing = true;
		try {
			await deferred.prompt();
			await deferred.userChoice;
		} catch {
			/* abgebrochen */
		} finally {
			installing = false;
			deferred = null;
		}
	}
</script>

{#if deferred || showIosHint}
	<div
		class="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 left-4 sm:bottom-4 sm:left-auto z-[60] max-w-sm sm:w-full sm:max-w-sm mx-auto sm:mx-0"
		role="dialog"
		aria-labelledby="pwa-install-title"
	>
		<div class="relative bg-bg-card border border-border rounded-2xl shadow-2xl p-4 pt-5 pr-12 border-accent/30">
			<button
				type="button"
				class="absolute top-2 right-2 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
				onclick={dismiss}
				aria-label="Schließen"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			{#if showIosHint}
				<p id="pwa-install-title" class="text-text-primary font-semibold text-sm">
					Als App aufs iPhone
				</p>
				{#if isSafari()}
					<ol class="mt-2 space-y-1.5 text-xs leading-relaxed text-text-secondary">
						<li class="flex gap-2">
							<span class="text-accent font-bold">1.</span>
							<span>Unten in der Leiste auf <strong class="text-text-primary">Teilen</strong> tippen (Quadrat mit Pfeil nach oben).</span>
						</li>
						<li class="flex gap-2">
							<span class="text-accent font-bold">2.</span>
							<span>Nach unten scrollen zu <strong class="text-text-primary">Zum Home-Bildschirm</strong>.</span>
						</li>
						<li class="flex gap-2">
							<span class="text-accent font-bold">3.</span>
							<span>Mit <strong class="text-text-primary">Hinzufügen</strong> bestätigen — fertig.</span>
						</li>
					</ol>
					<p class="mt-2.5 text-[11px] leading-snug text-text-muted">
						Danach läuft das Portal im Vollbild und kann Benachrichtigungen schicken.
					</p>
				{:else}
					<p class="mt-2 text-xs leading-relaxed text-text-secondary">
						Öffne diese Seite in <strong class="text-text-primary">Safari</strong> — nur dort lässt
						sie sich über <strong class="text-text-primary">Teilen → Zum Home-Bildschirm</strong> als
						App installieren.
					</p>
				{/if}
			{:else}
				<p id="pwa-install-title" class="text-text-primary font-semibold text-sm">App installieren?</p>
				<p class="mt-1 text-xs leading-snug text-text-muted">
					Vollbild, schnellerer Start und Benachrichtigungen zu Trainings.
				</p>
				<button
					type="button"
					class="mt-3 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0c0c0e] transition-colors hover:bg-accent-hover disabled:opacity-60"
					onclick={install}
					disabled={installing}
				>
					{installing ? '…' : 'Jetzt installieren'}
				</button>
			{/if}
		</div>
	</div>
{/if}
