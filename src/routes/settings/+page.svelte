<script lang="ts">
	import { goto } from '$app/navigation';
	import { MIN_PASSWORD_LENGTH } from '$lib/passwordPolicy';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);

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

<div class="space-y-6 max-w-lg">
	<div>
		<h2 class="text-2xl font-bold text-text-primary">Einstellungen</h2>
		<p class="text-text-secondary mt-1">Angemeldet als <span class="text-text-primary font-medium">{data.user?.username}</span></p>
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
