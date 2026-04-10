<script lang="ts">
	import type { PageProps } from './$types';

	let { form, data }: PageProps = $props();
</script>

<div class="flex min-h-screen items-center justify-center px-4 py-10">
	<div class="w-full max-w-md">
		<div class="mb-8 text-center">
			<div
				class="urban-cut mx-auto mb-4 flex h-14 w-14 items-center justify-center bg-gradient-to-br from-accent from-20% to-accent-hot font-display text-3xl font-bold leading-none text-[#0c0c0e] shadow-lg shadow-accent/40 ring-1 ring-white/25"
			>
				P
			</div>
			<h1 class="font-display text-4xl font-semibold uppercase tracking-[0.08em] text-text-primary">Parkour</h1>
			<p class="font-display mt-1 text-sm uppercase tracking-[0.35em] text-accent-hot">Portal</p>
			<p class="mt-3 text-sm text-text-secondary">Melde dich an, um fortzufahren</p>
		</div>

		<!-- Kein use:enhance: klassischer POST → Browser wendet Set-Cookie zuverlässig an (Redirect 303 → /). -->
		<form method="POST" class="card-surface rounded-lg p-8 ring-1 ring-white/10">
			{#if data.flash}
				<div class="bg-success/10 border border-success/30 text-success rounded-lg p-3 mb-6 text-sm">
					{data.flash}
				</div>
			{/if}
			{#if form?.error}
				<div class="bg-danger/10 border border-danger/30 text-danger rounded-lg p-3 mb-6 text-sm">
					{form.error}
				</div>
			{/if}

			<div class="space-y-5">
				<div>
					<label for="username" class="mb-2 block text-sm font-medium text-text-secondary">Username</label>
					<input
						id="username"
						name="username"
						type="text"
						autocomplete="username"
						class="focus-ring w-full rounded-lg border border-border bg-bg-secondary px-4 py-3 text-text-primary transition-colors placeholder:text-text-muted focus:border-accent/70"
						placeholder="Dein Username"
						required
					/>
				</div>

				<div>
					<label for="password" class="mb-2 block text-sm font-medium text-text-secondary">Passwort</label>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						class="focus-ring w-full rounded-xl border border-border bg-bg-secondary px-4 py-3 text-text-primary transition-colors placeholder:text-text-muted focus:border-accent/60"
						placeholder="Dein Passwort"
						required
					/>
				</div>

				<button
					type="submit"
					class="focus-ring urban-cut w-full cursor-pointer bg-accent px-4 py-3.5 font-display text-lg font-semibold uppercase tracking-[0.12em] text-[#0c0c0e] shadow-md shadow-accent/35 transition-colors hover:bg-accent-hover"
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
