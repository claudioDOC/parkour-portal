<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { MIN_PASSWORD_LENGTH } from '$lib/passwordPolicy';
	import type { PageData } from './$types';
	import { UI_THEME_OPTIONS, type UiThemeId } from '$lib/uiThemes';

	let { data }: { data: PageData } = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);

	let themeSaving = $state(false);
	let themeError = $state('');
	let themeOk = $state('');

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
					class={`rounded-xl border px-4 py-3 text-left text-sm transition-colors disabled:opacity-50 ${
						data.user?.uiTheme === opt.id
							? 'border-accent bg-accent/10 ring-1 ring-accent/30'
							: 'border-border bg-bg-secondary hover:border-accent/40 hover:bg-bg-hover'
					}`}
				>
					<span class="font-semibold text-text-primary">{opt.label}</span>
					<span class="mt-0.5 block text-text-muted text-xs leading-snug">{opt.hint}</span>
				</button>
			{/each}
		</div>
	</div>

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
