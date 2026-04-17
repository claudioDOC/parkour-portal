<script lang="ts">
	type Name =
		| 'home'
		| 'training'
		| 'trip'
		| 'spots'
		| 'finder'
		| 'stats'
		| 'settings'
		| 'admin'
		| 'logout';

	let { name, class: className = 'h-5 w-5 shrink-0' }: { name: Name; class?: string } = $props();
	const stroke = 'currentColor';
</script>

<!-- Heroicons-style 24 outline, stroke 1.75 -->
{#if name === 'home'}
	<svg class={className} fill="none" viewBox="0 0 24 24" stroke={stroke} stroke-width="1.75" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
	</svg>
{:else if name === 'training'}
	<svg class={className} fill="none" viewBox="0 0 24 24" stroke={stroke} stroke-width="1.75" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5a2.25 2.25 0 0 0 2.25-2.25m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5a2.25 2.25 0 0 1 2.25 2.25v7.5" />
	</svg>
{:else if name === 'trip'}
	<svg class={className} fill="none" viewBox="0 0 24 24" stroke={stroke} stroke-width="1.75" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6h16.5M6 6V4.875A1.125 1.125 0 0 1 7.125 3.75h9.75A1.125 1.125 0 0 1 18 4.875V6M4.5 6h15a1.5 1.5 0 0 1 1.5 1.5v8.25a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7.5A1.5 1.5 0 0 1 4.5 6Z" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M9 11.25h6M9 14.25h3" />
	</svg>
{:else if name === 'spots'}
	<svg class={className} fill="none" viewBox="0 0 24 24" stroke={stroke} stroke-width="1.75" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
	</svg>
{:else if name === 'finder'}
	<svg class={className} fill="none" viewBox="0 0 24 24" stroke={stroke} stroke-width="1.75" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
	</svg>
{:else if name === 'stats'}
	<svg class={className} fill="none" viewBox="0 0 24 24" stroke={stroke} stroke-width="1.75" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
	</svg>
{:else if name === 'settings'}
	<svg class={className} fill="none" viewBox="0 0 24 24" stroke={stroke} stroke-width="1.75" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
	</svg>
{:else if name === 'admin'}
	<svg class={className} fill="none" viewBox="0 0 24 24" stroke={stroke} stroke-width="1.75" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
	</svg>
{:else if name === 'logout'}
	<svg class={className} fill="none" viewBox="0 0 24 24" stroke={stroke} stroke-width="1.75" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
	</svg>
{/if}
