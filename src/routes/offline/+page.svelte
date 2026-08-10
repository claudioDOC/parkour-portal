<script lang="ts">
	import { onMount } from 'svelte';

	let online = $state(true);

	onMount(() => {
		online = navigator.onLine;
		const update = () => {
			online = navigator.onLine;
			// Sobald das Netz zurück ist, direkt zurück auf die zuletzt gewollte Seite.
			if (online) history.back();
		};
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
		};
	});
</script>

<svelte:head>
	<title>Offline – Parkour Portal</title>
</svelte:head>

<div class="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
	<div
		class="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-border bg-bg-card text-4xl"
		aria-hidden="true"
	>
		📡
	</div>
	<h1 class="font-display text-2xl font-semibold uppercase tracking-[0.1em] text-text-primary">
		Keine Verbindung
	</h1>
	<p class="mt-3 max-w-sm text-sm text-text-secondary">
		Diese Seite ist noch nicht offline verfügbar. Bereits geöffnete Spots, Trainings und Bilder
		kannst du weiterhin ansehen — sie liegen im Gerätespeicher.
	</p>

	<div class="mt-6 flex flex-wrap items-center justify-center gap-2">
		<button
			type="button"
			onclick={() => location.reload()}
			class="cursor-pointer rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-[#0c0c0e] transition-colors hover:bg-accent-hover"
		>
			Erneut versuchen
		</button>
		<a
			href="/"
			class="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
		>
			Zum Dashboard
		</a>
	</div>

	{#if online}
		<p class="mt-4 text-xs text-success">Verbindung ist wieder da …</p>
	{/if}
</div>
