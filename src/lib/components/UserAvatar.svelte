<script lang="ts">
	/**
	 * Profilbild — oder, wenn keines gewählt wurde, ein generiertes
	 * Individual-Muster (Identicon) statt bloss dem Anfangsbuchstaben.
	 * Gleicher Name ergibt immer dasselbe Muster.
	 */
	let {
		src = null,
		username,
		size = 40,
		class: className = ''
	}: { src?: string | null; username: string; size?: number; class?: string } = $props();

	const fallback = $derived(`/api/avatar/${encodeURIComponent(username || '?')}`);
</script>

<img
	src={src ?? fallback}
	alt={username}
	width={size}
	height={size}
	loading="lazy"
	class="shrink-0 rounded-full object-cover ring-1 ring-white/15 {className}"
	style="width:{size}px;height:{size}px"
/>
