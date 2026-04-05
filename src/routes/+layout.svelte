<script lang="ts">
	import '../app.css';
	import type { LayoutData } from './$types';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import PwaInstallBanner from '$lib/components/PwaInstallBanner.svelte';

	let { data, children }: { data: LayoutData; children: any } = $props();

	onMount(async () => {
		if (!pwaInfo) return;
		const { registerSW } = await import('virtual:pwa-register');
		registerSW({ immediate: true });
	});

	let mobileMenuOpen = $state(false);

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: '⌂' },
		{ href: '/training', label: 'Training', icon: '◷' },
		{ href: '/spots', label: 'Spots', icon: '◎' },
		{ href: '/finder', label: 'Spot-Finder', icon: '⚡' },
		{ href: '/statistik', label: 'Statistik', icon: '▤' },
		{ href: '/settings', label: 'Einstellungen', icon: '⚙' }
	];

	const isActive = (href: string) => {
		if (href === '/') return $page.url.pathname === '/';
		return $page.url.pathname.startsWith(href);
	};

	async function handleLogout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		goto('/login');
	}
</script>

<svelte:head>
	<title>Parkour Portal</title>
	{#if pwaInfo}
		{@html pwaInfo.webManifest.linkTag}
	{/if}
</svelte:head>

{#if !data.user}
	{@render children()}
{:else}
	<div class="min-h-screen bg-bg-primary">
		<header class="md:hidden fixed top-0 left-0 right-0 z-50 bg-bg-secondary border-b border-border px-4 py-3 flex items-center justify-between">
			<h1 class="text-xl font-bold text-accent tracking-tight">PARKOUR</h1>
			<button onclick={() => mobileMenuOpen = !mobileMenuOpen} class="text-text-primary p-2">
				{#if mobileMenuOpen}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
				{/if}
			</button>
		</header>

		{#if mobileMenuOpen}
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="md:hidden fixed inset-0 z-40 bg-black/60" onclick={() => mobileMenuOpen = false} role="none">
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
				<nav class="absolute top-[57px] left-0 right-0 bg-bg-secondary border-b border-border p-4 space-y-1" onclick={(e) => e.stopPropagation()}>
					{#each navItems as item}
						<a
							href={item.href}
							onclick={() => mobileMenuOpen = false}
							class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors {isActive(item.href) ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'}"
						>
							<span class="text-lg">{item.icon}</span>
							<span class="font-medium">{item.label}</span>
						</a>
					{/each}
					{#if data.user?.role === 'admin'}
						<a
							href="/admin"
							onclick={() => mobileMenuOpen = false}
							class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors {isActive('/admin') ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'}"
						>
							<span class="text-lg">⚙</span>
							<span class="font-medium">Admin</span>
						</a>
					{/if}
					<button onclick={handleLogout} class="flex items-center gap-3 px-4 py-3 rounded-lg w-full text-left text-danger hover:bg-danger/10 transition-colors">
						<span class="text-lg">⏻</span>
						<span class="font-medium">Abmelden</span>
					</button>
				</nav>
			</div>
		{/if}

		<aside class="max-md:hidden flex fixed top-0 left-0 bottom-0 w-64 bg-bg-secondary border-r border-border flex-col z-50">
			<div class="p-6">
				<h1 class="text-2xl font-bold text-accent tracking-tight">PARKOUR</h1>
				<p class="text-text-muted text-sm mt-1">Portal</p>
			</div>

			<nav class="flex-1 px-3 space-y-1">
				{#each navItems as item}
					<a
						href={item.href}
						class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors {isActive(item.href) ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'}"
					>
						<span class="text-lg">{item.icon}</span>
						<span class="font-medium">{item.label}</span>
					</a>
				{/each}
				{#if data.user?.role === 'admin'}
					<div class="pt-4 mt-4 border-t border-border">
						<a
							href="/admin"
							class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors {isActive('/admin') ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'}"
						>
							<span class="text-lg">⚙</span>
							<span class="font-medium">Admin</span>
						</a>
					</div>
				{/if}
			</nav>

			<div class="p-3 border-t border-border">
				<div class="flex items-center gap-3 px-4 py-3">
					<div class="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm font-bold">
						{data.user?.username.charAt(0).toUpperCase()}
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-text-primary text-sm font-medium truncate">{data.user?.username}</p>
						<p class="text-text-muted text-xs">{data.user?.role === 'spotmanager' ? 'Spot-Manager' : data.user?.role === 'admin' ? 'Admin' : 'Mitglied'}</p>
					</div>
					<button onclick={handleLogout} class="text-text-muted hover:text-danger transition-colors" title="Abmelden">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
					</button>
				</div>
			</div>
		</aside>

		<main class="md:ml-64 pt-[57px] md:pt-0 min-h-screen">
			<div class="p-4 md:p-8 max-w-6xl">
				{@render children()}
			</div>
		</main>

		<PwaInstallBanner />
	</div>
{/if}
