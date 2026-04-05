<script lang="ts">
	import { MIN_PASSWORD_LENGTH } from '$lib/passwordPolicy';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let success = $state('');
	let loading = $state(false);

	async function changePassword(e: Event) {
		e.preventDefault();
		error = '';
		success = '';

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
				body: JSON.stringify({ currentPassword, newPassword })
			});

			const result = await res.json();

			if (!res.ok) {
				error = result.error;
				return;
			}

			success = 'Passwort erfolgreich geändert!';
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
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
		<h3 class="text-lg font-semibold text-text-primary mb-4">Passwort ändern</h3>

		<form onsubmit={changePassword} class="space-y-4">
			{#if error}
				<div class="bg-danger/10 border border-danger/30 text-danger rounded-lg p-3 text-sm">{error}</div>
			{/if}
			{#if success}
				<div class="bg-success/10 border border-success/30 text-success rounded-lg p-3 text-sm">{success}</div>
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

			<button type="submit" disabled={loading}
				class="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-3 transition-colors cursor-pointer">
				{loading ? 'Wird geändert...' : 'Passwort ändern'}
			</button>
		</form>
	</div>
</div>
