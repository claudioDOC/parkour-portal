<script lang="ts">
	import { MIN_PASSWORD_LENGTH } from '$lib/passwordPolicy';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<div class="flex min-h-screen items-center justify-center px-4 py-10">
	<div class="w-full max-w-md">
		<div class="text-center mb-8">
			<h1 class="text-4xl font-bold text-accent tracking-tight">PARKOUR</h1>
			<p class="text-text-secondary mt-2">Account erstellen</p>
		</div>

		<!-- Klassischer POST wie Login: Set-Cookie + Redirect zuverlässig (kein fetch/CSRF-Cookies). -->
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
						placeholder="Wähle einen Username"
						required
						minlength="3"
					/>
				</div>

				<div>
					<label for="password" class="block text-text-secondary text-sm font-medium mb-2">Passwort</label>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="new-password"
						class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
						placeholder="Mindestens {MIN_PASSWORD_LENGTH} Zeichen"
						required
						minlength={MIN_PASSWORD_LENGTH}
					/>
				</div>

				<div>
					<label for="passwordConfirm" class="block text-text-secondary text-sm font-medium mb-2"
						>Passwort bestätigen</label
					>
					<input
						id="passwordConfirm"
						name="passwordConfirm"
						type="password"
						autocomplete="new-password"
						class="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent transition-colors"
						placeholder="Passwort wiederholen"
						required
					/>
				</div>

				<button
					type="submit"
					class="w-full cursor-pointer rounded-lg bg-accent px-4 py-3 font-semibold text-[#0c0c0e] transition-colors hover:bg-accent-hover"
				>
					Registrieren
				</button>
			</div>
		</form>

		<p class="text-center text-text-muted text-sm mt-6">
			Bereits einen Account? <a href="/login" class="text-accent hover:underline">Anmelden</a>
		</p>
	</div>
</div>
