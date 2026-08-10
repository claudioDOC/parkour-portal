<script lang="ts">
	/** Profilbild oder Initialen-Kreis als Fallback. */
	let {
		src = null,
		username,
		size = 40,
		class: className = ''
	}: { src?: string | null; username: string; size?: number; class?: string } = $props();
</script>

{#if src}
	<img
		{src}
		alt={username}
		width={size}
		height={size}
		loading="lazy"
		class="shrink-0 rounded-full object-cover ring-1 ring-white/15 {className}"
		style="width:{size}px;height:{size}px"
	/>
{:else}
	<div
		class="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/25 to-accent/5 font-bold text-accent ring-1 ring-accent/20 {className}"
		style="width:{size}px;height:{size}px;font-size:{Math.max(11, Math.round(size * 0.4))}px"
		aria-hidden="true"
	>
		{username.charAt(0).toUpperCase()}
	</div>
{/if}
