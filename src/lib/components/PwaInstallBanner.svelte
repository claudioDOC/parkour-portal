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

{#if deferred}
	<div
		class="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] max-w-sm sm:w-full sm:max-w-sm mx-auto sm:mx-0"
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
			<p id="pwa-install-title" class="text-text-primary font-semibold text-sm">App installieren?</p>
			<button
				type="button"
				class="mt-3 w-full bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors disabled:opacity-60"
				onclick={install}
				disabled={installing}
			>
				{installing ? '…' : 'Jetzt installieren'}
			</button>
		</div>
	</div>
{/if}
