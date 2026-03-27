<script lang="ts">
	import { goto } from '$app/navigation';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleLogin(e: Event) {
		e.preventDefault();
		error = '';
		loading = true;

		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			});

			const data = await res.json();

			if (!res.ok) {
				error = data.error;
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
			<p class="text-text-secondary mt-2">Portal Login</p>
		</div>

		<form onsubmit={handleLogin} class="bg-bg-card rounded-2xl p-8 shadow-xl border border-border">
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
						placeholder="Dein Username"
						required
					/>
				</div>

				<div>
					<label for="password" class="block text-text-secondary text-sm font-medium mb-2">Passwort</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
						placeholder="Dein Passwort"
						required
					/>
				</div>

				<button
					type="submit"
					disabled={loading}
					class="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-3 transition-colors cursor-pointer"
				>
					{loading ? 'Laden...' : 'Anmelden'}
				</button>
			</div>
		</form>

		<p class="text-center text-text-muted text-sm mt-6">
			Noch kein Account? Du brauchst einen Einladungslink.
		</p>
	</div>
</div>
