(() => {
    const STORAGE_KEY = "breadcrumbs-cookie-preferences-v1";
    const defaults = { necessary: true, analytics: false, marketing: false };

    function readPreferences() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (saved && typeof saved === "object") {
                return { ...defaults, ...saved, necessary: true };
            }
        } catch (error) {
            console.warn("Nie udało się odczytać ustawień cookies.", error);
        }
        return null;
    }

    let preferences = readPreferences();
    const listeners = new Set();

    function save(next) {
        preferences = { ...defaults, ...next, necessary: true };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
        } catch (error) {
            console.warn("Nie udało się zapisać ustawień cookies.", error);
        }
        listeners.forEach((listener) => listener({ ...preferences }));
        render();
    }

    function render() {
        const existing = document.querySelector("#cookie-consent");
        if (existing) existing.remove();

        if (preferences) return;

        const banner = document.createElement("section");
        banner.id = "cookie-consent";
        banner.className = "cookie-consent";
        banner.setAttribute("aria-labelledby", "cookie-consent-title");
        banner.setAttribute("role", "region");
        banner.innerHTML = `
            <div class="cookie-consent-copy">
                <h2 id="cookie-consent-title">Pliki cookies</h2>
                <p>Używamy niezbędnych plików cookies i podobnych technologii, w tym Google reCAPTCHA, aby chronić formularz zamówienia. Obecnie nie korzystamy z analitycznych ani reklamowych plików cookies. Ustawienia możesz zmienić w dowolnym momencie.</p>
                <details class="cookie-consent-settings">
                    <summary>Szczegóły</summary>
                    <p>Niezbędne: zawsze aktywne — pomagają zabezpieczyć i obsłużyć zamówienie. Opcjonalne: analityczne i marketingowe — obecnie nie są używane.</p>
                </details>
            </div>
            <div class="cookie-consent-actions">
                <button class="cookie-button cookie-button-secondary" type="button" data-cookie-choice="necessary">Tylko niezbędne</button>
                <button class="cookie-button cookie-button-primary" type="button" data-cookie-choice="all">Akceptuję wszystkie</button>
            </div>`;

        banner.addEventListener("click", (event) => {
            const button = event.target.closest("[data-cookie-choice]");
            if (!button) return;
            save(button.dataset.cookieChoice === "all"
                ? { necessary: true, analytics: true, marketing: true }
                : defaults);
        });
        document.body.appendChild(banner);
    }

    window.breadcrumbsCookieConsent = {
        getPreferences: () => ({ ...(preferences || defaults) }),
        hasConsent: (category) => category === "necessary" || Boolean(preferences?.[category]),
        onChange(listener) {
            if (typeof listener !== "function") return () => {};
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        show: () => { preferences = null; render(); },
        update: save
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
        render();
    }
})();
