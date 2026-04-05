<script lang="ts">
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<div class="min-h-screen bg-bg-primary flex items-center justify-center px-4">
	<div class="w-full max-w-md">
		<div class="text-center mb-8">
			<h1 class="text-4xl font-bold text-accent tracking-tight">PARKOUR</h1>
			<p class="text-text-secondary mt-2">Portal Login</p>
		</div>

		<!-- Kein use:enhance: klassischer POST → Browser wendet Set-Cookie zuverlässig an (Redirect 303 → /). -->
		<form method="POST" class="bg-bg-card rounded-2xl p-8 shadow-xl border border-border">
			{#if form?.error}
				<div class="bg-danger/10 border border-danger/30 text-danger rounded-lg p-3 mb-6 text-sm">
					{form.error}
				</div>
			{/if}

			<div class="space-y-5">
				<div>
					<label for="username" class="block text-text-secondary text-sm font-medium mb-2">Username</label>
					<input
						id="username"
						name="username"
						type="text"
						autocomplete="username"
						class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
						placeholder="Dein Username"
						required
					/>
				</div>

				<div>
					<label for="password" class="block text-text-secondary text-sm font-medium mb-2">Passwort</label>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
						placeholder="Dein Passwort"
						required
					/>
				</div>

				<button
					type="submit"
					class="w-full bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg px-4 py-3 transition-colors cursor-pointer"
				>
					Anmelden
				</button>
			</div>
		</form>

		<p class="text-center text-text-muted text-sm mt-6">
			Noch kein Account? Du brauchst einen Einladungslink.
		</p>
	</div>
</div>
