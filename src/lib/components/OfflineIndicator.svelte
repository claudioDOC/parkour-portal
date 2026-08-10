<script lang="ts">
	import { onMount } from 'svelte';

	let offline = $state(false);

	onMount(() => {
		offline = !navigator.onLine;
		const goOffline = () => (offline = true);
		const goOnline = () => (offline = false);
		window.addEventListener('offline', goOffline);
		window.addEventListener('online', goOnline);
		return () => {
			window.removeEventListener('offline', goOffline);
			window.removeEventListener('online', goOnline);
		};
	});
</script>

{#if offline}
	<!-- Sitzt unter der mobilen Kopfleiste bzw. oben am Rand der Desktop-Ansicht. -->
	<div
		class="fixed inset-x-0 top-[calc(57px+env(safe-area-inset-top))] z-[55] md:top-0 md:left-64"
		role="status"
		aria-live="polite"
	>
		<div
			class="mx-auto flex max-w-6xl items-center justify-center gap-2 bg-amber-500/90 px-4 py-1.5 text-center text-xs font-semibold text-[#0c0c0e]"
		>
			<span aria-hidden="true">📡</span>
			<span>Offline — du siehst gespeicherte Daten. Änderungen sind gerade nicht möglich.</span>
		</div>
	</div>
{/if}
