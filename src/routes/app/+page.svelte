<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Android-App — Parkour Portal</title></svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader kicker="Für Android" title="App installieren" />

	<div class="rounded-xl border border-border bg-bg-card p-6">
		{#if data.available}
			<p class="text-text-secondary text-sm">
				Version {data.version} · {data.sizeMb} MB
				{#if data.builtAt}
					· Stand {new Date(data.builtAt).toLocaleDateString('de-CH')}
				{/if}
			</p>
			<a
				href="/app/parkour-portal.apk"
				class="mt-4 inline-block rounded-lg bg-accent px-5 py-3 text-sm font-bold text-[#0c0c0e] transition-colors hover:bg-accent-hover"
			>
				APK herunterladen
			</a>
			<ol class="mt-5 space-y-2 text-sm text-text-secondary">
				<li><span class="text-accent font-bold">1.</span> Datei antippen — Android fragt nach der Erlaubnis „Unbekannte Quellen".</li>
				<li><span class="text-accent font-bold">2.</span> Erlauben und installieren.</li>
				<li><span class="text-accent font-bold">3.</span> Fertig — die App aktualisiert ihre Inhalte danach immer selbst.</li>
			</ol>
		{:else}
			<p class="text-text-secondary text-sm">
				Aktuell ist keine APK hinterlegt. Auf dem Server bauen mit
				<code class="rounded bg-bg-secondary px-1.5 py-0.5 text-xs">./android/build-app.sh</code>
				— das Skript legt sie automatisch hier ab.
			</p>
		{/if}
	</div>

	<div class="rounded-xl border border-dashed border-border p-5 text-sm leading-relaxed text-text-muted">
		<p class="font-semibold text-text-secondary">Warum es fast nie ein APK-Update braucht</p>
		<p class="mt-1">
			Die App ist eine Hülle um das Portal: Alle Inhalte und Funktionen kommen live vom Server.
			Neue Features sind sofort da — ohne Update. Eine neue APK ist nur nötig, wenn sich
			<strong class="text-text-secondary">Name, Icon oder die Adresse</strong> der App ändern.
			Passiert das, erscheint in der App automatisch ein Hinweis mit Download-Link.
		</p>
	</div>

	<div class="rounded-xl border border-border bg-bg-card p-5">
		<p class="font-semibold text-text-primary">iPhone</p>
		<p class="mt-1 text-sm text-text-secondary">
			Dort gibt es keine APK. In Safari öffnen → <strong>Teilen</strong> →
			<strong>Zum Home-Bildschirm</strong>. Ergebnis ist dieselbe App, inklusive
			Benachrichtigungen.
		</p>
	</div>
</div>
