<script lang="ts">
	import ZugOMeter from '$lib/components/ZugOMeter.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Zug-O-Meter-Vorschau</title></svelte:head>

<div class="mx-auto max-w-xl space-y-4">
	<div>
		<a href="/admin" class="text-sm text-accent hover:underline">← Admin</a>
		<h2 class="mt-1 text-2xl font-bold text-text-primary">Zug-O-Meter-Vorschau</h2>
		<p class="text-sm text-text-muted">
			Alle Stufen so, wie sie auf der Startseite erscheinen — mit echtem Glühen und Animation.
			Gemessen wird über letzte, diese und nächste Woche; die Grenze darüber ist nur hier sichtbar.
		</p>
	</div>
	{#each data.levels as l (l.key)}
		<div class="card-surface p-4">
			<p class="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">{l.range} pro Training</p>
			<ZugOMeter z={l} href={null} />
		</div>
	{/each}
</div>
