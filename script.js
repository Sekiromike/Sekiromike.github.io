document.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement;

    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();

    // Theme toggle. The saved choice is applied by an inline script in <head>
    // so the page never flashes the wrong theme; this only handles clicks.
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
        const isDark = () => root.dataset.theme
            ? root.dataset.theme === 'dark'
            : prefersDark.matches;
        const syncLabel = () => {
            themeToggle.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
        };
        syncLabel();
        prefersDark.addEventListener('change', syncLabel);
        themeToggle.addEventListener('click', () => {
            const next = isDark() ? 'light' : 'dark';
            root.dataset.theme = next;
            try { localStorage.setItem('theme', next); } catch (error) { /* storage blocked */ }
            syncLabel();
        });
    }

    // Header border once the page has scrolled
    const header = document.querySelector('.site-header');
    if (header) {
        const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
    }

    // Mobile navigation
    const toggle = document.querySelector('.nav-toggle');
    const menu = document.getElementById('nav-links');
    if (toggle && menu) {
        const setOpen = open => {
            toggle.setAttribute('aria-expanded', String(open));
            menu.classList.toggle('open', open);
        };
        toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
        menu.addEventListener('click', event => {
            if (event.target.closest('a')) setOpen(false);
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') setOpen(false);
        });
    }

    // Highlight the nav link for the section in view
    const links = [...document.querySelectorAll('.nav-links a[href^="#"]')];
    const sections = links
        .map(link => document.querySelector(link.getAttribute('href')))
        .filter(Boolean);

    if (!sections.length || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            links.forEach(link => {
                if (link.getAttribute('href') === `#${entry.target.id}`) {
                    link.setAttribute('aria-current', 'location');
                } else {
                    link.removeAttribute('aria-current');
                }
            });
        });
    }, { rootMargin: '-35% 0px -60% 0px' });

    sections.forEach(section => observer.observe(section));
});
