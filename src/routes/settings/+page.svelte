<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { MIN_PASSWORD_LENGTH } from '$lib/passwordPolicy';
	import type { PageData } from './$types';
	import { UI_THEME_OPTIONS, type UiThemeId } from '$lib/uiThemes';
	import PushSettings from '$lib/components/PushSettings.svelte';
	import {
		loadDevicePrefs,
		saveDevicePrefs,
		FONT_SIZE_OPTIONS,
		START_PAGE_OPTIONS,
		type DevicePrefs
	} from '$lib/devicePrefs';
	import { onMount } from 'svelte';

	let { data }: { data: PageData } = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);

	let themeSaving = $state(false);
	let themeError = $state('');
	let themeOk = $state('');
	let calendarCopied = $state(false);

	/** Geräte-Einstellungen (localStorage) — Defaults bis onMount lädt. */
	let device = $state<DevicePrefs>({ fontSize: 'normal', motion: 'an', startPage: '/' });
	onMount(() => {
		device = loadDevicePrefs();
	});

	function setDevice<K extends keyof DevicePrefs>(key: K, value: DevicePrefs[K]) {
		device = { ...device, [key]: value };
		saveDevicePrefs(device);
	}

	async function saveUiTheme(theme: UiThemeId) {
		themeError = '';
		themeOk = '';
		themeSaving = true;
		try {
			const res = await fetch('/api/user/ui-theme', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ theme })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				themeError = typeof body.error === 'string' ? body.error : `Fehler ${res.status}`;
				return;
			}
			await invalidateAll();
			themeOk = 'Design gespeichert.';
		} catch {
			themeError = 'Verbindungsfehler';
		} finally {
			themeSaving = false;
		}
	}

	async function changePassword() {
		error = '';

		if (newPassword !== confirmPassword) {
			error = 'Passwörter stimmen nicht überein';
			return;
		}

		if (newPassword.length < MIN_PASSWORD_LENGTH) {
			error = `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`;
			return;
		}

		loading = true;
		try {
			const res = await fetch('/api/auth/change-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ currentPassword, newPassword })
			});

			const raw = await res.text();
			let result: { error?: string; detail?: string } = {};
			try {
				result = raw ? JSON.parse(raw) : {};
			} catch {
				error =
					res.status >= 400
						? `Anfrage fehlgeschlagen (${res.status}). Ist die App erreichbar?`
						: 'Unerwartete Server-Antwort';
				return;
			}

			if (!res.ok) {
				const main =
					(typeof result.error === 'string' && result.error) || `Fehler ${res.status}`;
				const extra =
					typeof result.detail === 'string' && result.detail && !main.includes(result.detail)
						? ` (${result.detail})`
						: '';
				error = main + extra;
				return;
			}

			await goto('/login?pw=changed');
		} catch {
			error = 'Verbindungsfehler';
		} finally {
			loading = false;
		}
	}
</script>

<div class="space-y-6 max-w-2xl">
	<div>
		<h2 class="text-2xl font-bold text-text-primary">Einstellungen</h2>
		<p class="text-text-secondary mt-1">Angemeldet als <span class="text-text-primary font-medium">{data.user?.username}</span></p>
	</div>

	<div class="bg-bg-card rounded-xl border border-border p-6">
		<h3 class="text-lg font-semibold text-text-primary mb-1">Design</h3>
		<p class="text-text-muted text-sm mb-4">
			Wähle ein Farbschema — wird mit deinem Account gespeichert und auf allen Geräten übernommen.
		</p>
		{#if themeError}
			<div class="bg-danger/10 border border-danger/30 text-danger rounded-lg p-3 text-sm mb-4">{themeError}</div>
		{/if}
		{#if themeOk}
			<div class="bg-success/10 border border-success/30 text-success rounded-lg p-3 text-sm mb-4">{themeOk}</div>
		{/if}
		<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
			{#each UI_THEME_OPTIONS as opt (opt.id)}
				<button
					type="button"
					disabled={themeSaving}
					onclick={() => saveUiTheme(opt.id)}
					class={`cursor-pointer rounded-xl border px-4 py-3 text-left text-sm transition-colors disabled:opacity-50 ${
						data.user?.uiTheme === opt.id
							? 'border-accent bg-accent/10 ring-1 ring-accent/30'
							: 'border-border bg-bg-secondary hover:border-accent/40 hover:bg-bg-hover'
					}`}
				>
					<span class="flex items-center justify-between gap-2">
						<span class="font-semibold text-text-primary">{opt.label}</span>
						<!-- Farbvorschau: Hintergrund + beide Akzente -->
						<span class="flex shrink-0 -space-x-1.5" aria-hidden="true">
							<span class="h-5 w-5 rounded-full border border-white/20" style="background:{opt.swatch[0]}"></span>
							<span class="h-5 w-5 rounded-full border border-black/20" style="background:{opt.swatch[1]}"></span>
							<span class="h-5 w-5 rounded-full border border-black/20" style="background:{opt.swatch[2]}"></span>
						</span>
					</span>
					<span class="mt-0.5 block text-text-muted text-xs leading-snug">{opt.hint}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="bg-bg-card rounded-xl border border-border p-6">
		<h3 class="text-lg font-semibold text-text-primary mb-1">App</h3>
		<p class="text-text-muted text-sm mb-4">
			Gilt für dieses Gerät — auf dem Handy und am Computer getrennt einstellbar.
		</p>

		<div class="space-y-5">
			<div>
				<p class="text-text-secondary text-sm font-medium mb-2">Schriftgrösse</p>
				<div class="grid grid-cols-3 gap-2">
					{#each FONT_SIZE_OPTIONS as opt (opt.id)}
						<button
							type="button"
							onclick={() => setDevice('fontSize', opt.id)}
							class={`cursor-pointer rounded-xl border px-3 py-2.5 text-center transition-colors ${
								device.fontSize === opt.id
									? 'border-accent bg-accent/10 ring-1 ring-accent/30'
									: 'border-border bg-bg-secondary hover:border-accent/40 hover:bg-bg-hover'
							}`}
						>
							<span
								class="block font-semibold text-text-primary"
								style="font-size:{opt.id === 'klein' ? '0.8rem' : opt.id === 'gross' ? '1.05rem' : '0.9rem'}"
							>Aa</span>
							<span class="mt-0.5 block text-[11px] leading-tight text-text-muted">{opt.label}</span>
						</button>
					{/each}
				</div>
			</div>

			<div>
				<p class="text-text-secondary text-sm font-medium mb-2">Start-Seite der App</p>
				<p class="text-text-muted text-xs mb-2">
					Welche Seite die installierte App beim Öffnen zeigt.
				</p>
				<div class="flex flex-wrap gap-2">
					{#each START_PAGE_OPTIONS as opt (opt.id)}
						<button
							type="button"
							onclick={() => setDevice('startPage', opt.id)}
							class={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
								device.startPage === opt.id
									? 'border-accent bg-accent/15 text-accent'
									: 'border-border bg-bg-secondary text-text-secondary hover:border-accent/40 hover:text-text-primary'
							}`}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>

			<label class="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-bg-secondary px-3 py-3">
				<span>
					<span class="block text-sm font-medium text-text-primary">Animationen</span>
					<span class="block text-xs leading-snug text-text-muted">
						Weiche Seitenwechsel und Übergänge. Ausschalten spart Akku und wirkt ruhiger.
					</span>
				</span>
				<input
					type="checkbox"
					checked={device.motion === 'an'}
					onchange={(e) => setDevice('motion', e.currentTarget.checked ? 'an' : 'aus')}
					class="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]"
				/>
			</label>
		</div>
	</div>

	{#if data.calendarUrl}
		<div class="bg-bg-card rounded-xl border border-border p-6">
			<h3 class="text-lg font-semibold text-text-primary mb-1">Kalender-Abo</h3>
			<p class="text-text-muted text-sm mb-3">
				Trainings und Trips direkt in deiner Kalender-App — aktualisiert sich selbst, Absagen
				erscheinen als abgesagte Termine.
			</p>
			<div class="flex flex-wrap items-center gap-2">
				<input
					type="text"
					readonly
					value={data.calendarUrl}
					onclick={(e) => e.currentTarget.select()}
					class="min-w-0 flex-1 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary focus:outline-none focus:border-accent"
				/>
				<button
					type="button"
					onclick={async () => {
						try {
							await navigator.clipboard.writeText(data.calendarUrl ?? '');
							calendarCopied = true;
							setTimeout(() => (calendarCopied = false), 2000);
						} catch {
							/* Auswahl per Klick aufs Feld bleibt als Fallback */
						}
					}}
					class="cursor-pointer rounded-lg border border-accent/40 px-4 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/10"
				>
					{calendarCopied ? 'Kopiert ✓' : 'Link kopieren'}
				</button>
			</div>
			<p class="text-text-muted text-xs mt-2">
				iPhone: Einstellungen → Kalender → Accounts → Kalenderabo. Google Kalender: Weitere
				Kalender → Per URL. Link einfügen, fertig.
			</p>
		</div>
	{/if}

	<PushSettings />

	<div class="bg-bg-card rounded-xl border border-border p-6">
		<h3 class="text-lg font-semibold text-text-primary mb-2">Passwort ändern</h3>
		<p class="text-text-muted text-sm mb-4">
			Nach dem Speichern wirst du abgemeldet und meldest dich mit dem neuen Passwort wieder an.
		</p>

		<form
			class="space-y-4"
			onsubmit={(e) => {
				e.preventDefault();
				void changePassword();
			}}
		>
			{#if error}
				<div class="bg-danger/10 border border-danger/30 text-danger rounded-lg p-3 text-sm">{error}</div>
			{/if}
			<div>
				<label for="current" class="block text-text-secondary text-sm font-medium mb-2">Aktuelles Passwort</label>
				<input id="current" type="password" bind:value={currentPassword} required
					class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors" />
			</div>
			<div>
				<label for="new" class="block text-text-secondary text-sm font-medium mb-2">Neues Passwort</label>
				<input
					id="new"
					type="password"
					bind:value={newPassword}
					required
					minlength={MIN_PASSWORD_LENGTH}
					placeholder="Mindestens {MIN_PASSWORD_LENGTH} Zeichen"
					class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
				/>
			</div>
			<div>
				<label for="confirm" class="block text-text-secondary text-sm font-medium mb-2">Neues Passwort bestätigen</label>
				<input id="confirm" type="password" bind:value={confirmPassword} required
					class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors" />
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full cursor-pointer rounded-lg bg-accent px-4 py-3 font-semibold text-[#0c0c0e] transition-colors hover:bg-accent-hover disabled:opacity-50"
			>
				{loading ? 'Wird geändert...' : 'Passwort ändern'}
			</button>
		</form>
	</div>
</div>
