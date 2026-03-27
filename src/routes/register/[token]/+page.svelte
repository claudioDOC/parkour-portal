<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let username = $state('');
	let password = $state('');
	let passwordConfirm = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleRegister(e: Event) {
		e.preventDefault();
		error = '';

		if (password !== passwordConfirm) {
			error = 'Passwörter stimmen nicht überein';
			return;
		}

		loading = true;

		try {
			const res = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password, token: data.token })
			});

			const result = await res.json();

			if (!res.ok) {
				error = result.error;
				return;
			}

			goto('/');
		} catch {
			error = 'Verbindungsfehler';
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen bg-bg-primary flex items-center justify-center px-4">
	<div class="w-full max-w-md">
		<div class="text-center mb-8">
			<h1 class="text-4xl font-bold text-accent tracking-tight">PARKOUR</h1>
			<p class="text-text-secondary mt-2">Account erstellen</p>
		</div>

		<form onsubmit={handleRegister} class="bg-bg-card rounded-2xl p-8 shadow-xl border border-border">
			{#if error}
				<div class="bg-danger/10 border border-danger/30 text-danger rounded-lg p-3 mb-6 text-sm">
					{error}
				</div>
			{/if}

			<div class="space-y-5">
				<div>
					<label for="username" class="block text-text-secondary text-sm font-medium mb-2">Username</label>
					<input
						id="username"
						type="text"
						bind:value={username}
						class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
						placeholder="Wähle einen Username"
						required
						minlength="3"
					/>
				</div>

				<div>
					<label for="password" class="block text-text-secondary text-sm font-medium mb-2">Passwort</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
						placeholder="Mindestens 6 Zeichen"
						required
						minlength="6"
					/>
				</div>

				<div>
					<label for="passwordConfirm" class="block text-text-secondary text-sm font-medium mb-2">Passwort bestätigen</label>
					<input
						id="passwordConfirm"
						type="password"
						bind:value={passwordConfirm}
						class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
						placeholder="Passwort wiederholen"
						required
					/>
				</div>

				<button
					type="submit"
					disabled={loading}
					class="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-3 transition-colors cursor-pointer"
				>
					{loading ? 'Laden...' : 'Registrieren'}
				</button>
			</div>
		</form>

		<p class="text-center text-text-muted text-sm mt-6">
			Bereits einen Account? <a href="/login" class="text-accent hover:underline">Anmelden</a>
		</p>
	</div>
</div>
