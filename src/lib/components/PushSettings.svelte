<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { PUSH_PREF_KEYS, PUSH_PREF_LABELS, DEFAULT_PUSH_PREFS, type PushPrefs } from '$lib/pushPrefs';

	/** Base64url (VAPID) → Bytes, wie von der Push-API verlangt. */
	function urlBase64ToBytes(base64String: string): BufferSource {
		const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
		const raw = atob(base64);
		const output = new Uint8Array(raw.length);
		for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
		return output.buffer as ArrayBuffer;
	}

	type State = 'laden' | 'nicht_unterstuetzt' | 'nicht_konfiguriert' | 'blockiert' | 'aus' | 'an';

	let pushState = $state<State>('laden');
	let prefs = $state<PushPrefs>({ ...DEFAULT_PUSH_PREFS });
	let publicKey = $state('');
	let devices = $state<{ id: number; label: string; since: string }[]>([]);
	let busy = $state(false);
	let message = $state('');
	let errorMsg = $state('');
	/** iOS zeigt die Push-Abfrage nur, wenn die App vom Homescreen läuft. */
	let iosNeedsInstall = $state(false);

	const supported = () =>
		browser && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

	function isIos(): boolean {
		if (!browser) return false;
		return /iphone|ipad|ipod/i.test(navigator.userAgent);
	}

	function isStandalone(): boolean {
		if (!browser) return false;
		if (window.matchMedia('(display-mode: standalone)').matches) return true;
		return (navigator as Navigator & { standalone?: boolean }).standalone === true;
	}

	onMount(async () => {
		if (!supported()) {
			// Auf iOS liegt es fast immer daran, dass die App im Safari-Tab läuft.
			iosNeedsInstall = isIos() && !isStandalone();
			pushState = 'nicht_unterstuetzt';
			return;
		}

		try {
			const res = await fetch('/api/push/config', { credentials: 'include' });
			if (!res.ok) {
				pushState = 'nicht_konfiguriert';
				return;
			}
			const data = await res.json();
			publicKey = data.publicKey ?? '';
			prefs = { ...DEFAULT_PUSH_PREFS, ...(data.prefs ?? {}) };
			devices = data.devices ?? [];
			if (!data.enabled || !publicKey) {
				pushState = 'nicht_konfiguriert';
				return;
			}
		} catch {
			pushState = 'nicht_konfiguriert';
			return;
		}

		if (Notification.permission === 'denied') {
			pushState = 'blockiert';
			return;
		}

		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.getSubscription();
		pushState = sub ? 'an' : 'aus';

		// Diagnose-Daten für die Fehlersuche (frisch lesen — oben schon geprüft)
		const perm = Notification.permission as NotificationPermission;
		diag = {
			permission:
				perm === 'granted' ? 'erteilt' : perm === 'denied' ? 'blockiert' : 'noch nicht gefragt',
			sw: reg.active
				? `aktiv${reg.waiting ? ' (Update wartet — App einmal ganz schliessen)' : ''}`
				: 'fehlt',
			sub: sub ? new URL(sub.endpoint).hostname : 'keins auf diesem Gerät'
		};
	});

	let diag = $state<{ permission: string; sw: string; sub: string } | null>(null);
	let localMsg = $state('');

	/**
	 * Zeigt eine Benachrichtigung DIREKT an — ohne Server und Push-Dienst.
	 * Erscheint hier nichts, liegt das Problem an Browser-/System-Einstellungen,
	 * nicht am Portal.
	 */
	async function localTest() {
		localMsg = '';
		try {
			const reg = await navigator.serviceWorker.ready;
			await reg.showNotification('Lokaler Test — Parkour Portal', {
				body: 'Wenn du das siehst, kann dieses Gerät Benachrichtigungen anzeigen.',
				icon: '/pwa-192x192.png?v=7',
				tag: 'local-test'
			});
			localMsg =
				'Anzeige ausgelöst. Erschien KEINE Meldung, blockiert dein Browser oder dein System die Anzeige (Nicht-stören-Modus, Firefox „Benachrichtigungen pausieren“, Systemeinstellungen).';
		} catch (err) {
			localMsg = `Anzeige fehlgeschlagen: ${err instanceof Error ? err.message : err}`;
		}
	}

	async function refreshDevices() {
		try {
			const res = await fetch('/api/push/config', { credentials: 'include' });
			if (res.ok) devices = (await res.json()).devices ?? [];
		} catch {
			/* Anzeige bleibt beim alten Stand */
		}
	}

	async function enable() {
		errorMsg = '';
		message = '';
		busy = true;
		try {
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				pushState = permission === 'denied' ? 'blockiert' : 'aus';
				return;
			}

			const reg = await navigator.serviceWorker.ready;
			let sub = await reg.pushManager.getSubscription();
			if (!sub) {
				sub = await reg.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: urlBase64ToBytes(publicKey)
				});
			}

			const res = await fetch('/api/push/subscribe', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(sub.toJSON())
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				errorMsg = typeof body.error === 'string' ? body.error : `Fehler ${res.status}`;
				return;
			}

			pushState = 'an';
			message = 'Benachrichtigungen sind aktiviert.';
			await refreshDevices();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Aktivierung fehlgeschlagen';
		} finally {
			busy = false;
		}
	}

	async function disable() {
		errorMsg = '';
		message = '';
		busy = true;
		try {
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.getSubscription();
			if (sub) {
				await fetch('/api/push/unsubscribe', {
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ endpoint: sub.endpoint })
				}).catch(() => undefined);
				await sub.unsubscribe();
			}
			pushState = 'aus';
			message = 'Benachrichtigungen auf diesem Gerät ausgeschaltet.';
			await refreshDevices();
		} catch {
			errorMsg = 'Abmelden fehlgeschlagen';
		} finally {
			busy = false;
		}
	}

	async function togglePref(key: keyof PushPrefs) {
		const next = { ...prefs, [key]: !prefs[key] };
		prefs = next;
		errorMsg = '';
		try {
			const res = await fetch('/api/push/config', {
				method: 'PATCH',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prefs: next })
			});
			if (!res.ok) {
				prefs = { ...prefs, [key]: !next[key] };
				errorMsg = 'Einstellung konnte nicht gespeichert werden.';
			}
		} catch {
			prefs = { ...prefs, [key]: !next[key] };
			errorMsg = 'Verbindungsfehler';
		}
	}

	async function sendTest() {
		errorMsg = '';
		message = '';
		busy = true;
		try {
			const res = await fetch('/api/push/test', { method: 'POST', credentials: 'include' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				errorMsg = typeof body.error === 'string' ? body.error : `Fehler ${res.status}`;
				return;
			}
			message =
				body.sent > 0
					? `Test verschickt an ${body.sent} Gerät${body.sent === 1 ? '' : 'e'}.`
					: 'Kein Gerät erreicht — ist Push auf diesem Gerät aktiv?';
		} catch {
			errorMsg = 'Verbindungsfehler';
		} finally {
			busy = false;
		}
	}
</script>

<div class="bg-bg-card rounded-xl border border-border p-6">
	<h3 class="text-lg font-semibold text-text-primary mb-1">Benachrichtigungen</h3>
	<p class="text-text-muted text-sm mb-4">
		Erinnerungen an Trainings und Neuigkeiten — direkt aufs Handy, auch wenn die App zu ist.
		Die Freigabe gilt pro Gerät, die Auswahl unten für deinen Account.
	</p>

	{#if errorMsg}
		<div class="bg-danger/10 border border-danger/30 text-danger rounded-lg p-3 text-sm mb-4">{errorMsg}</div>
	{/if}
	{#if message}
		<div class="bg-success/10 border border-success/30 text-success rounded-lg p-3 text-sm mb-4">{message}</div>
	{/if}

	{#if pushState === 'laden'}
		<p class="text-text-muted text-sm">Laden …</p>
	{:else if pushState === 'nicht_unterstuetzt'}
		<div class="rounded-lg border border-border bg-bg-secondary p-4 text-sm text-text-secondary">
			{#if iosNeedsInstall}
				<p class="font-semibold text-text-primary mb-1">Zuerst zum Home-Bildschirm hinzufügen</p>
				<p>
					Auf dem iPhone sind Benachrichtigungen nur möglich, wenn die App installiert ist:
					in Safari auf <strong>Teilen</strong> → <strong>Zum Home-Bildschirm</strong> tippen,
					danach die App über das neue Symbol öffnen und hier wieder aufrufen.
				</p>
			{:else}
				<p>Dieser Browser unterstützt keine Push-Benachrichtigungen.</p>
			{/if}
		</div>
	{:else if pushState === 'nicht_konfiguriert'}
		<div class="rounded-lg border border-border bg-bg-secondary p-4 text-sm text-text-secondary">
			Push ist auf dem Server nicht eingerichtet (VAPID-Schlüssel fehlen).
		</div>
	{:else if pushState === 'blockiert'}
		<div class="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-text-secondary">
			<p class="font-semibold text-danger mb-1">In den Browser-Einstellungen blockiert</p>
			<p>
				Erlaube Benachrichtigungen für diese Seite in den Website-Einstellungen deines Browsers und
				lade die Seite neu.
			</p>
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-2">
			{#if pushState === 'an'}
				<span class="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
					Auf diesem Gerät aktiv
				</span>
				<button
					type="button"
					onclick={disable}
					disabled={busy}
					class="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
				>
					Ausschalten
				</button>
				<button
					type="button"
					onclick={sendTest}
					disabled={busy}
					class="cursor-pointer rounded-lg border border-accent/40 px-4 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
				>
					Test senden
				</button>
			{:else}
				<button
					type="button"
					onclick={enable}
					disabled={busy}
					class="cursor-pointer rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-[#0c0c0e] transition-colors hover:bg-accent-hover disabled:opacity-50"
				>
					{busy ? '…' : 'Auf diesem Gerät einschalten'}
				</button>
			{/if}
		</div>

		{#if devices.length > 0}
			<div class="mt-4">
				<p class="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-1.5">
					Registrierte Geräte ({devices.length})
				</p>
				<ul class="space-y-1">
					{#each devices as d (d.id)}
						<li class="rounded-lg bg-bg-secondary px-3 py-2 text-sm text-text-primary">
							{d.label}
							<span class="text-text-muted text-xs ml-1">seit {new Date(d.since + 'Z').toLocaleDateString('de-CH')}</span>
						</li>
					{/each}
				</ul>
				<p class="text-text-muted text-xs mt-1.5">
					Fehlt dein Handy? Dann dort in der App die Einstellungen öffnen und Push einschalten —
					die Freigabe gilt pro Gerät.
				</p>
			</div>
		{/if}

		<div class="mt-4 rounded-lg border border-dashed border-border p-3">
			<p class="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-2">
				Fehlersuche
			</p>
			{#if diag}
				<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
					<dt class="text-text-muted">Berechtigung</dt>
					<dd class="text-text-primary">{diag.permission}</dd>
					<dt class="text-text-muted">Service Worker</dt>
					<dd class="text-text-primary">{diag.sw}</dd>
					<dt class="text-text-muted">Push-Dienst</dt>
					<dd class="text-text-primary break-all">{diag.sub}</dd>
				</dl>
			{/if}
			<button
				type="button"
				onclick={localTest}
				class="mt-2.5 cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:text-text-primary"
			>
				Lokalen Test anzeigen
			</button>
			<p class="text-text-muted text-[11px] leading-snug mt-1.5">
				Der lokale Test umgeht Server und Push-Dienst komplett — er prüft nur, ob dieses Gerät
				überhaupt Meldungen anzeigen darf.
			</p>
			{#if localMsg}
				<p class="mt-2 text-xs text-text-secondary">{localMsg}</p>
			{/if}
		</div>

		{#if pushState === 'an'}
			<div class="mt-5 space-y-2 border-t border-border pt-4">
				<p class="text-text-secondary text-xs font-semibold uppercase tracking-wide">Wobei melden?</p>
				{#each PUSH_PREF_KEYS as key (key)}
					<label
						class="flex cursor-pointer items-start gap-3 rounded-lg bg-bg-secondary px-3 py-2.5 transition-colors hover:bg-bg-hover"
					>
						<input
							type="checkbox"
							checked={prefs[key]}
							onchange={() => togglePref(key)}
							class="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
						/>
						<span class="min-w-0">
							<span class="block text-sm font-medium text-text-primary">{PUSH_PREF_LABELS[key].title}</span>
							<span class="block text-xs leading-snug text-text-muted">{PUSH_PREF_LABELS[key].hint}</span>
						</span>
					</label>
				{/each}
			</div>
		{/if}
	{/if}
</div>
