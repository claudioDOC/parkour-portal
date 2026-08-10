<script lang="ts">
	/**
	 * Animierter Start-Splash der installierten App: die drei Logo-Chevrons
	 * fliegen nacheinander ein, dann blendet das Overlay aus.
	 *
	 * Zeigt sich nur im Standalone-Modus (vom Home-Bildschirm gestartet),
	 * einmal pro App-Start (sessionStorage) und nie bei abgeschalteten
	 * Animationen. `pointer-events: none` — blockiert nie die Bedienung.
	 */
	import { onMount } from 'svelte';
	import { loadDevicePrefs } from '$lib/devicePrefs';

	let visible = $state(false);
	let leaving = $state(false);

	onMount(() => {
		const standalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			(window.navigator as Navigator & { standalone?: boolean }).standalone === true;
		if (!standalone) return;
		if (sessionStorage.getItem('splash-shown')) return;
		sessionStorage.setItem('splash-shown', '1');

		if (
			loadDevicePrefs().motion === 'aus' ||
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		)
			return;

		visible = true;
		const t1 = setTimeout(() => (leaving = true), 1050);
		const t2 = setTimeout(() => (visible = false), 1500);
		return () => {
			clearTimeout(t1);
			clearTimeout(t2);
		};
	});
</script>

{#if visible}
	<div class="splash {leaving ? 'splash-leave' : ''}" aria-hidden="true">
		<svg width="140" height="140" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
			<g transform="rotate(-14 256 256)">
				<path class="chev chev-1" d="M96 168 L202 268 L96 368" />
				<path class="chev chev-2" d="M196 168 L302 268 L196 368" />
				<path class="chev chev-3" d="M296 168 L402 268 L296 368" />
			</g>
		</svg>
	</div>
{/if}

<style>
	.splash {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #111214;
		pointer-events: none;
		transition: opacity 0.4s ease;
	}
	.splash-leave {
		opacity: 0;
	}
	.chev {
		fill: none;
		stroke: #fafafa;
		stroke-width: 46;
		stroke-linejoin: miter;
		opacity: 0;
		animation: chev-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}
	/* Staffelung wie im Logo: hinten schwach, vorn voll */
	.chev-1 {
		animation-delay: 0.05s;
		--chev-opacity: 0.25;
	}
	.chev-2 {
		animation-delay: 0.2s;
		--chev-opacity: 0.55;
	}
	.chev-3 {
		animation-delay: 0.35s;
		--chev-opacity: 1;
	}
	@keyframes chev-in {
		from {
			transform: translateX(-56px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: var(--chev-opacity, 1);
		}
	}
</style>
