<script lang="ts">
	import '../app.css';
	import type { LayoutData } from './$types';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import PwaInstallBanner from '$lib/components/PwaInstallBanner.svelte';
	import AppNavIcon from '$lib/components/AppNavIcon.svelte';

	type NavIcon = 'home' | 'training' | 'spots' | 'finder' | 'stats' | 'settings' | 'admin';

	let { data, children }: { data: LayoutData; children: any } = $props();

	onMount(async () => {
		if (!pwaInfo) return;
		const { registerSW } = await import('virtual:pwa-register');
		registerSW({ immediate: true });
	});

	let mobileMenuOpen = $state(false);

	/** Täglich genutzt — schlanke Hauptnavigation */
	const navMain: { href: string; label: string; icon: NavIcon }[] = [
		{ href: '/', label: 'Dashboard', icon: 'home' },
		{ href: '/training', label: 'Training', icon: 'training' },
		{ href: '/spots', label: 'Spots', icon: 'spots' }
	];

	/** „Special Feature“-Bereich (z. B. Spot-Finder), optisch hervorgehoben */
	const navDiscover: { href: string; label: string; icon: NavIcon }[] = [
		{ href: '/finder', label: 'Spot-Finder', icon: 'finder' }
	];

	/** Statistik, Konto, Verwaltung — wie Admin abgesetzt */
	const navMore: { href: string; label: string; icon: NavIcon }[] = [
		{ href: '/statistik', label: 'Statistik', icon: 'stats' },
		{ href: '/settings', label: 'Einstellungen', icon: 'settings' }
	];

	const isActive = (href: string) => {
		if (href === '/') return $page.url.pathname === '/';
		return $page.url.pathname.startsWith(href);
	};

	function navLinkClass(href: string, variant: 'default' | 'feature' = 'default'): string {
		const active = isActive(href);
		const base = [
			'relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-all duration-200',
			active
				? 'bg-accent/10 text-accent shadow-[inset_4px_0_0_0_var(--color-accent)] ring-1 ring-inset ring-accent-hot/25'
				: 'text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:translate-x-0.5'
		].join(' ');
		if (variant === 'feature') {
			return (
				base +
				(active
					? ''
					: ' border border-dashed border-accent-hot/30 bg-accent-hot/[0.06] hover:border-accent-hot/45')
			);
		}
		return base;
	}

	function navSectionLabel(className: string): string {
		return `px-3 pb-1.5 pt-1 font-display text-[10px] font-semibold uppercase tracking-[0.24em] ${className}`;
	}

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
	<div class="min-h-screen">
		<header
			class="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-border bg-bg-secondary/95 px-4 py-3 backdrop-blur-md"
		>
			<div class="flex items-center gap-2.5">
				<div
					class="urban-cut flex h-9 w-9 shrink-0 items-center justify-center bg-gradient-to-br from-accent from-25% to-accent-hot font-display text-lg font-bold leading-none text-[#0c0c0e] shadow-md shadow-accent/35 ring-1 ring-white/20"
				>
					P
				</div>
				<div class="leading-none">
					<h1 class="font-display text-xl font-semibold uppercase tracking-[0.14em] text-text-primary">Parkour</h1>
					<p class="font-display text-[11px] uppercase tracking-[0.28em] text-accent-hot/90">Portal</p>
				</div>
			</div>
			<button
				type="button"
				onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
				class="focus-ring rounded-lg p-2 text-text-primary"
				aria-expanded={mobileMenuOpen}
				aria-label="Menü"
			>
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
				<nav
					class="absolute top-[57px] left-0 right-0 space-y-0.5 border-b border-border bg-bg-secondary p-3 shadow-lg"
					onclick={(e) => e.stopPropagation()}
				>
					{#each navMain as item}
						<a
							href={item.href}
							onclick={() => (mobileMenuOpen = false)}
							class={navLinkClass(item.href)}
						>
							<AppNavIcon name={item.icon} />
							<span>{item.label}</span>
						</a>
					{/each}
					<div class="mt-2 border-t border-border pt-2">
						<p class={navSectionLabel('text-accent-hot/90')}>Special Feature</p>
						{#each navDiscover as item}
							<a
								href={item.href}
								onclick={() => (mobileMenuOpen = false)}
								class={navLinkClass(item.href, 'feature')}
							>
								<AppNavIcon name={item.icon} />
								<span>{item.label}</span>
							</a>
						{/each}
					</div>
					<div class="mt-2 border-t border-border pt-2">
						<p class={navSectionLabel('text-text-muted')}>Mehr</p>
						{#each navMore as item}
							<a
								href={item.href}
								onclick={() => (mobileMenuOpen = false)}
								class={navLinkClass(item.href)}
							>
								<AppNavIcon name={item.icon} />
								<span>{item.label}</span>
							</a>
						{/each}
						{#if data.user?.role === 'admin'}
							<a
								href="/admin"
								onclick={() => (mobileMenuOpen = false)}
								class={navLinkClass('/admin')}
							>
								<AppNavIcon name="admin" />
								<span>Admin</span>
							</a>
						{/if}
					</div>
					<button
						type="button"
						onclick={handleLogout}
						class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-danger transition-colors hover:bg-danger/10"
					>
						<AppNavIcon name="logout" />
						<span>Abmelden</span>
					</button>
				</nav>
			</div>
		{/if}

		<aside
			class="max-md:hidden fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-bg-secondary/95 shadow-[var(--shadow-nav)] backdrop-blur-md"
		>
			<div class="border-b border-border bg-gradient-to-b from-white/[0.03] to-transparent px-5 pb-5 pt-7">
				<div class="flex items-center gap-3">
					<div
						class="urban-cut flex h-11 w-11 items-center justify-center bg-gradient-to-br from-accent from-25% to-accent-hot font-display text-2xl font-bold leading-none text-[#0c0c0e] shadow-lg shadow-accent/35 ring-1 ring-white/25"
					>
						P
					</div>
					<div>
						<h1 class="font-display text-3xl font-semibold uppercase tracking-[0.12em] text-text-primary">Parkour</h1>
						<p class="font-display text-xs uppercase tracking-[0.32em] text-accent-hot">Portal</p>
					</div>
				</div>
			</div>

			<nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-4">
				{#each navMain as item}
					<a href={item.href} class={navLinkClass(item.href)}>
						<AppNavIcon name={item.icon} />
						<span>{item.label}</span>
					</a>
				{/each}

				<div class="mx-2 mt-3 border-t border-border pt-3">
					<p class={navSectionLabel('text-accent-hot/90')}>Special Feature</p>
					{#each navDiscover as item}
						<a href={item.href} class={navLinkClass(item.href, 'feature')}>
							<AppNavIcon name={item.icon} />
							<span>{item.label}</span>
						</a>
					{/each}
				</div>

				<div class="mx-2 mt-3 border-t border-border pt-3">
					<p class={navSectionLabel('text-text-muted')}>Mehr</p>
					{#each navMore as item}
						<a href={item.href} class={navLinkClass(item.href)}>
							<AppNavIcon name={item.icon} />
							<span>{item.label}</span>
						</a>
					{/each}
					{#if data.user?.role === 'admin'}
						<a href="/admin" class={navLinkClass('/admin')}>
							<AppNavIcon name="admin" />
							<span>Admin</span>
						</a>
					{/if}
				</div>
			</nav>

			<div class="border-t border-border p-3">
				<div
					class="flex items-center gap-3 rounded-md border border-white/5 bg-bg-hover/90 px-3 py-3 shadow-inner shadow-black/20"
				>
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/25 to-accent/5 text-sm font-bold text-accent ring-1 ring-accent/20"
					>
						{data.user?.username.charAt(0).toUpperCase()}
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-semibold text-text-primary">{data.user?.username}</p>
						<p class="text-xs text-text-muted">
							{data.user?.role === 'spotmanager'
								? 'Spot-Manager'
								: data.user?.role === 'admin'
									? 'Admin'
									: 'Mitglied'}
						</p>
					</div>
					<button
						type="button"
						onclick={handleLogout}
						class="focus-ring shrink-0 rounded-lg p-2 text-text-muted transition-colors hover:text-danger"
						title="Abmelden"
					>
						<AppNavIcon name="logout" class="h-5 w-5" />
					</button>
				</div>
			</div>
		</aside>

		<main class="relative min-h-screen pt-[57px] md:ml-64 md:pt-0">
			<div
				class="pointer-events-none absolute right-0 top-16 h-64 w-64 rounded-full bg-accent/[0.09] blur-3xl md:right-8 md:top-24 md:h-80 md:w-80"
				aria-hidden="true"
			></div>
			<div
				class="pointer-events-none absolute bottom-32 left-4 h-48 w-48 rounded-full bg-accent-hot/15 blur-3xl md:left-8"
				aria-hidden="true"
			></div>
			<div class="relative z-10 mx-auto max-w-6xl p-4 md:p-8 md:pb-12">
				{@render children()}
			</div>
		</main>

		<PwaInstallBanner />
	</div>
{/if}
