<script lang="ts">
	import '../app.css';
	import type { LayoutData } from './$types';
	import { page, navigating } from '$app/stores';
	import { goto, invalidateAll, onNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { pwaInfo } from 'virtual:pwa-info';
	import { loadDevicePrefs, applyDevicePrefs, motionDisabled } from '$lib/devicePrefs';
	import PwaInstallBanner from '$lib/components/PwaInstallBanner.svelte';
	import OfflineIndicator from '$lib/components/OfflineIndicator.svelte';
	import BrandLogo from '$lib/components/BrandLogo.svelte';
	import AppSplash from '$lib/components/AppSplash.svelte';
	import AppNavIcon from '$lib/components/AppNavIcon.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';

type NavIcon =
		| 'home'
		| 'training'
		| 'trip'
		| 'spots'
		| 'finder'
		| 'stats'
		| 'challenge'
		| 'map'
		| 'settings'
		| 'admin'
		| 'user';

	let { data, children }: { data: LayoutData; children: any } = $props();

	$effect(() => {
		if (!browser) return;
		const root = document.documentElement;
		const t = data.user?.uiTheme;

		if (!data.user) {
			root.removeAttribute('data-theme');
			root.classList.add('dark');
			return;
		}

		if (!t || t === 'mate') {
			root.removeAttribute('data-theme');
			root.classList.add('dark');
			return;
		}

		root.dataset.theme = t;
		if (t === 'light') {
			root.classList.remove('dark');
		} else {
			root.classList.add('dark');
		}
	});

	onMount(async () => {
		const prefs = loadDevicePrefs();
		applyDevicePrefs(prefs);

		// Installierte App: gewählte Start-Seite öffnen — nur beim App-Start,
		// nicht bei jeder Rückkehr aufs Dashboard.
		const standalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			(window.navigator as Navigator & { standalone?: boolean }).standalone === true;
		if (
			standalone &&
			prefs.startPage !== '/' &&
			location.pathname === '/' &&
			!sessionStorage.getItem('app-launched')
		) {
			sessionStorage.setItem('app-launched', '1');
			goto(prefs.startPage, { replaceState: true });
		} else {
			sessionStorage.setItem('app-launched', '1');
		}

		// App aus dem Hintergrund zurück → Daten auffrischen. Gedrosselt, damit
		// schnelles Tab-Wechseln nicht bei jedem Fokus den Server abfragt.
		let lastRefresh = Date.now();
		const onVisible = () => {
			if (document.hidden) return;
			if (Date.now() - lastRefresh < 60_000) return;
			lastRefresh = Date.now();
			void invalidateAll();
		};
		document.addEventListener('visibilitychange', onVisible);

		// Kein Cleanup nötig: das Root-Layout lebt so lange wie die Seite.

		// Neuer Service Worker übernimmt (= neues Deployment) → Seite einmal
		// neu laden, damit sofort das neue UI läuft statt erst beim nächsten
		// App-Start. Guard verhindert Reload-Schleifen.
		if ('serviceWorker' in navigator) {
			let reloaded = false;
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				if (reloaded) return;
				reloaded = true;
				location.reload();
			});
		}

		if (!pwaInfo) return;
		const { registerSW } = await import('virtual:pwa-register');
		registerSW({ immediate: true });

		// Selbstheilung: lokales Push-Abo beim Server neu anmelden. Geht das
		// Server-Abo verloren (Datenbank-Cleanup, gelöschte Browserdaten auf
		// anderem Gerät), repariert sich das beim nächsten App-Start von selbst.
		try {
			if ('PushManager' in window && Notification.permission === 'granted' && data.user) {
				const reg = await navigator.serviceWorker.ready;
				const sub = await reg.pushManager.getSubscription();
				if (sub) {
					void fetch('/api/push/subscribe', {
						method: 'POST',
						credentials: 'include',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(sub.toJSON())
					}).catch(() => undefined);
				}
			}
		} catch {
			/* Selbstheilung ist optional */
		}
	});

	/** Weiche Seitenwechsel über die View-Transitions-API (wo verfügbar). */
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		if (motionDisabled()) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	/** Lade-Balken erst nach 120 ms — schnelle Wechsel bleiben balkenfrei. */
	let showNavProgress = $state(false);
	$effect(() => {
		if (!$navigating) {
			showNavProgress = false;
			return;
		}
		const t = setTimeout(() => (showNavProgress = true), 120);
		return () => clearTimeout(t);
	});

let mobileMoreOpen = $state(false);

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
		{ href: '/trips', label: 'Trips', icon: 'trip' },
		{ href: '/challenges', label: 'Challenges', icon: 'challenge' },
		{ href: '/map', label: 'Map', icon: 'map' },
		{ href: '/statistik', label: 'Statistik', icon: 'stats' },
		{ href: '/profil', label: 'Profil', icon: 'user' },
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

	const mobilePrimaryNav: { href: string; label: string; icon: NavIcon; emphasize?: boolean }[] = [
		{ href: '/finder', label: 'Finder', icon: 'finder' },
		{ href: '/spots', label: 'Spots', icon: 'spots' },
		{ href: '/training', label: 'Training', icon: 'training', emphasize: true },
		{ href: '/statistik', label: 'Stats', icon: 'stats' }
	];
</script>

<svelte:head>
	<title>Parkour Portal</title>
	{#if pwaInfo}
		{@html pwaInfo.webManifest.linkTag}
	{/if}
</svelte:head>

<AppSplash />

{#if showNavProgress}
	<div class="nav-progress" aria-hidden="true"></div>
{/if}

{#if !data.user}
	{@render children()}
{:else}
	<div class="min-h-screen">
		<!-- pt rechnet die Statusleiste/Notch dazu, sonst klebt das Logo darunter. -->
		<header
			class="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center border-b border-border bg-bg-secondary/95 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md"
		>
			<a href="/" class="flex items-center gap-2.5" aria-label="Zum Dashboard">
				<BrandLogo size={36} class="shrink-0 rounded-lg shadow-md shadow-accent/25 ring-1 ring-white/15" />
				<div class="leading-none">
					<h1 class="font-display text-xl font-semibold uppercase tracking-[0.14em] text-text-primary">Parkour</h1>
					<p class="font-display text-[11px] uppercase tracking-[0.28em] text-accent-hot/90">Portal</p>
				</div>
			</a>
		</header>

		{#if mobileMoreOpen}
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div
				class="md:hidden fixed inset-x-0 top-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[64] bg-black/55"
				onclick={() => (mobileMoreOpen = false)}
			></div>
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div
				class="md:hidden fixed inset-x-2 bottom-[calc(4.95rem+env(safe-area-inset-bottom))] z-[70] rounded-2xl border border-border bg-bg-secondary px-3 py-3 shadow-2xl"
				onclick={(e) => e.stopPropagation()}
			>
				<!-- Grabber wie bei nativen Sheets -->
				<div class="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" aria-hidden="true"></div>

				<!-- App-Grid: grosse Kacheln statt Liste -->
				<div class="grid grid-cols-3 gap-2">
					{#each [
						{ href: '/profil', label: 'Profil', icon: 'user' as const },
						{ href: '/challenges', label: 'Challenges', icon: 'challenge' as const },
						{ href: '/trips', label: 'Trips', icon: 'trip' as const },
						{ href: '/map', label: 'Map', icon: 'map' as const },
						{ href: '/statistik', label: 'Statistik', icon: 'stats' as const },
						{ href: '/settings', label: 'Settings', icon: 'settings' as const }
					] as item (item.href)}
						{@const active = isActive(item.href)}
						<a
							href={item.href}
							onclick={() => (mobileMoreOpen = false)}
							class="flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3.5 text-center transition-all active:scale-95 {active
								? 'border-accent/50 bg-accent/12 text-accent'
								: 'border-white/5 bg-bg-hover/60 text-text-secondary'}"
						>
							<AppNavIcon name={item.icon} class="h-6 w-6 {active ? 'text-accent' : 'text-text-primary'}" />
							<span class="text-[11px] font-semibold leading-tight">{item.label}</span>
						</a>
					{/each}
				</div>

				<div class="mt-2 flex gap-2">
					{#if data.user?.role === 'admin'}
						<a
							href="/admin"
							onclick={() => (mobileMoreOpen = false)}
							class="flex flex-1 items-center justify-center gap-2 rounded-xl border border-accent-hot/30 bg-accent-hot/10 px-3 py-2.5 text-sm font-semibold text-accent-hot transition-all active:scale-95"
						>
							<AppNavIcon name="admin" class="h-4 w-4" />
							Admin
						</a>
					{/if}
					<button
						type="button"
						onclick={handleLogout}
						class="flex flex-1 items-center justify-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm font-semibold text-danger transition-all active:scale-95"
					>
						<AppNavIcon name="logout" class="h-4 w-4" />
						Abmelden
					</button>
				</div>
			</div>
		{/if}

		<aside
			class="max-md:hidden fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-bg-secondary/95 shadow-[var(--shadow-nav)] backdrop-blur-md"
		>
			<div class="border-b border-border bg-gradient-to-b from-white/[0.03] to-transparent px-5 pb-5 pt-7">
				<a href="/" class="flex items-center gap-3" aria-label="Zum Dashboard">
					<BrandLogo size={44} class="shrink-0 rounded-xl shadow-lg shadow-accent/25 ring-1 ring-white/15" />
					<div>
						<h1 class="font-display text-3xl font-semibold uppercase tracking-[0.12em] text-text-primary">Parkour</h1>
						<p class="font-display text-xs uppercase tracking-[0.32em] text-accent-hot">Portal</p>
					</div>
				</a>
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
					<a href="/profil" aria-label="Zum Profil">
						<UserAvatar src={data.user?.avatar} username={data.user?.username ?? '?'} size={40} />
					</a>
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

		<main
			class="relative min-h-screen pb-24 pt-[calc(57px+env(safe-area-inset-top))] md:ml-64 md:pb-0 md:pt-0"
		>
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

		<nav
			class="md:hidden fixed inset-x-0 bottom-0 z-[65] border-t border-white/10 bg-bg-secondary/96 px-2 pb-[env(safe-area-inset-bottom)] pt-0 backdrop-blur-md"
			aria-label="Mobile Navigation"
		>
			<div class="grid grid-cols-5 items-stretch gap-1">
				{#each mobilePrimaryNav as item}
					{@const mobileActive = !mobileMoreOpen && isActive(item.href)}
					<a
						href={item.href}
						onclick={() => (mobileMoreOpen = false)}
						class={`group flex h-full flex-col items-center justify-center px-1 py-0 text-[11px] font-semibold transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
							mobileActive
								? 'text-text-primary'
								: 'text-text-secondary hover:text-text-primary'
						} ${item.emphasize ? 'rounded-xl pb-0' : ''} ${!item.emphasize && mobileActive ? 'bg-white/[0.07] shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]' : ''}`}
					>
						<span
							class={item.emphasize
								? `-mt-4 mb-0.5 flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
										mobileActive
											? 'border-accent/40 bg-bg-card text-accent shadow-[0_10px_26px_rgb(0_0_0/0.5),0_0_0_1px_rgb(var(--color-accent-rgb)/0.22)] scale-[1.03]'
											: 'border-border bg-bg-card text-text-secondary shadow-[0_8px_22px_rgb(0_0_0/0.35)] group-active:scale-95'
									}`
								: `mb-0.5 transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${mobileActive ? 'scale-105 text-accent drop-shadow-[0_0_10px_rgb(var(--color-accent-rgb)/0.2)]' : 'group-active:scale-95'}`}
						>
							<AppNavIcon name={item.icon} class={item.emphasize ? 'h-5 w-5' : 'h-4 w-4'} />
						</span>
						<span class={`transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${mobileActive ? 'tracking-[0.01em]' : ''}`}>{item.label}</span>
					</a>
				{/each}
				<button
					type="button"
					onclick={() => (mobileMoreOpen = !mobileMoreOpen)}
					aria-expanded={mobileMoreOpen}
					class={`group flex h-full flex-col items-center justify-center px-1 py-0 text-[11px] font-semibold transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
						mobileMoreOpen
							? 'text-text-primary bg-white/[0.07] shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]'
							: 'text-text-secondary hover:text-text-primary'
					}`}
				>
					<span class={`mb-0.5 transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${mobileMoreOpen ? 'scale-105 text-accent drop-shadow-[0_0_10px_rgb(var(--color-accent-rgb)/0.2)]' : 'group-active:scale-95'}`}>
						<AppNavIcon name="settings" class="h-4 w-4" />
					</span>
					<span class={`transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${mobileMoreOpen ? 'tracking-[0.01em]' : ''}`}>Mehr</span>
				</button>
			</div>
		</nav>

		<OfflineIndicator />
		<PwaInstallBanner />
	</div>
{/if}
