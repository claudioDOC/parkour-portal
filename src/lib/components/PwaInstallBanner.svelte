<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	/** Bump if banner content changes so Nutzer den neuen Hinweis sehen */
	const DISMISS_KEY = 'pwa-install-hint-v2';

	/** Chromium: deferred install prompt */
	interface BeforeInstallPromptEvent extends Event {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let deferred = $state<BeforeInstallPromptEvent | null>(null);
	/** Card visible (until dismissed); not only when browser fires beforeinstallprompt */
	let visible = $state(false);
	let installing = $state(false);

	function alreadyInstalled(): boolean {
		if (!browser) return true;
		if (window.matchMedia('(display-mode: standalone)').matches) return true;
		return 'standalone' in window.navigator && (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
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

		visible = true;

		const onBeforeInstall = (e: Event) => {
			e.preventDefault();
			deferred = e as BeforeInstallPromptEvent;
		};

		// Capture phase: runs before other listeners (e.g. from registerSW)
		window.addEventListener('beforeinstallprompt', onBeforeInstall, { capture: true });

		const onInstalled = () => {
			deferred = null;
			visible = false;
		};
		window.addEventListener('appinstalled', onInstalled);

		return () => {
			window.removeEventListener('beforeinstallprompt', onBeforeInstall, { capture: true });
			window.removeEventListener('appinstalled', onInstalled);
		};
	});

	function dismiss() {
		visible = false;
		deferred = null;
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
			/* user dismissed native dialog or error */
		} finally {
			installing = false;
			deferred = null;
			if (alreadyInstalled()) visible = false;
		}
	}
</script>

{#if visible}
	<div
		class="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] max-w-sm sm:w-full sm:max-w-sm mx-auto sm:mx-0"
		role="region"
		aria-label="App installieren"
	>
		<div
			class="relative bg-bg-card border border-border rounded-2xl shadow-2xl p-4 pt-5 pr-12 border-accent/20"
		>
			<button
				type="button"
				class="absolute top-2 right-2 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
				onclick={dismiss}
				aria-label="Hinweis schließen"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
			<p class="text-text-primary font-semibold text-sm">App auf dem Handy</p>
			<p class="text-text-secondary text-xs mt-1 leading-relaxed">
				Für schnellen Zugriff vom Startbildschirm – mit eigenem Fenster ohne Browser-Leiste.
			</p>
			{#if deferred}
				<button
					type="button"
					class="mt-3 w-full bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors disabled:opacity-60"
					onclick={install}
					disabled={installing}
				>
					{installing ? '…' : 'Jetzt installieren'}
				</button>
			{/if}
			<p class="text-text-muted text-[11px] mt-3 leading-relaxed border-t border-border pt-3">
				<strong class="text-text-secondary">Manuell:</strong>
				<strong>Chrome / Android:</strong> Menü (⋮) → <em>App installieren</em> oder <em>Zum Startbildschirm hinzufügen</em>.
				<strong class="ml-1">Safari / iPhone:</strong> Teilen-Button → <em>Zum Home-Bildschirm</em>.
			</p>
		</div>
	</div>
{/if}
