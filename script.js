const yearElement = document.querySelector("#current-year");
const menuToggle = document.querySelector(".menu-toggle");
const mainNavigation = document.querySelector(".main-navigation");

if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
}

if (menuToggle && mainNavigation) {
    const closeMenu = () => {
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Otwórz menu");
        mainNavigation.classList.remove("is-open");
    };

    menuToggle.addEventListener("click", () => {
        const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
        menuToggle.setAttribute("aria-expanded", String(!isOpen));
        menuToggle.setAttribute("aria-label", isOpen ? "Otwórz menu" : "Zamknij menu");
        mainNavigation.classList.toggle("is-open", !isOpen);
    });

    mainNavigation.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", closeMenu);
    });

    window.addEventListener("resize", () => {
        if (window.innerWidth > 700) {
            closeMenu();
        }
    });
}

const productPanels = document.querySelectorAll("[data-product-panel]");
const productTitles = document.querySelectorAll("[data-product-title]");

if (productPanels.length && productTitles.length) {
    const productPanelsContainer = document.querySelector(".product-panels");
    let titleUpdateScheduled = false;

    const updateProductTitles = () => {
        titleUpdateScheduled = false;
        const viewportCenter = window.innerHeight / 2;
        let activeProduct = null;

        productPanels.forEach((product) => {
            const bounds = product.getBoundingClientRect();
            if (bounds.top <= viewportCenter && bounds.bottom >= viewportCenter) {
                activeProduct = product.dataset.productPanel;
            }
        });

        const isInProductArea = productPanelsContainer
            && productPanelsContainer.getBoundingClientRect().bottom > 0
            && productPanelsContainer.getBoundingClientRect().top < window.innerHeight;

        productTitles.forEach((title) => {
            const isActive = isInProductArea && title.dataset.productTitle === activeProduct;
            title.classList.toggle("is-visible", isActive);
        });

    };

    const scheduleTitleUpdate = () => {
        if (titleUpdateScheduled) return;
        titleUpdateScheduled = true;
        window.requestAnimationFrame(updateProductTitles);
    };

    window.addEventListener("scroll", scheduleTitleUpdate, { passive: true });
    window.addEventListener("resize", scheduleTitleUpdate);
    updateProductTitles();
}


// =========================
// PRODUCT CATALOG
// =========================

const productDataElements = document.querySelectorAll(
    "[data-product-names], [data-product-pages], [data-product-max-photos], [data-product-prices]"
);

if (productDataElements.length) {
    const PRODUCT_CATALOG_ENDPOINT = "https://script.google.com/macros/s/AKfycbyuQKOk4hiUl0BTZ5-FfhAE7YLttMkfTQnhzODmvROTAynmOknFYc-fYHudcHuwPvI8/exec";
    const callbackName = `homeProductsCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const catalogScript = document.createElement("script");

    const cleanupCatalogRequest = () => {
        delete window[callbackName];
        catalogScript.remove();
    };

    window[callbackName] = (response) => {
        cleanupCatalogRequest();
        if (!response?.success) return;

        if (response.settings && typeof response.settings === "object") {
            document.querySelectorAll("[data-store-setting]").forEach(element => {
                const key = element.dataset.storeSetting;
                if (Object.prototype.hasOwnProperty.call(response.settings, key)) {
                    element.textContent = response.settings[key];
                }
            });
        }
        if (!Array.isArray(response.products)) return;

        const productsById = new Map(
            response.products.map(product => [String(product.product_id), product])
        );
        const formatPrice = value => `${new Intl.NumberFormat("pl-PL", {
            maximumFractionDigits: 2
        }).format(Number(value))} PLN`;
        const productBaseName = name => {
            const base = String(name).replace(/\s+\d+\s*$/, "").trim();
            const parts = base.split(/\s+/);
            return parts.length > 1
                ? `${parts[0].toUpperCase()} ${parts.slice(1).join(" ").toLowerCase()}`
                : base.toUpperCase();
        };

        productDataElements.forEach(element => {
            const ids = (element.dataset.productNames || element.dataset.productPages ||
                element.dataset.productMaxPhotos || element.dataset.productPrices || "")
                .split(",").map(id => id.trim()).filter(Boolean);
            const products = ids.map(id => productsById.get(id)).filter(Boolean);
            if (!products.length) return;

            if (element.hasAttribute("data-product-names")) {
                element.textContent = productBaseName(products[0].name);
            } else if (element.hasAttribute("data-product-pages")) {
                element.textContent = products.map(product => product.pages).join(" / ");
            } else if (element.hasAttribute("data-product-max-photos")) {
                element.textContent = products.map(product => Number(product.pages) * 2).join(" / ");
            } else if (element.hasAttribute("data-product-prices")) {
                element.textContent = products.map(product => formatPrice(product.price_pln)).join(" / ");
            }
        });
    };

    catalogScript.onerror = cleanupCatalogRequest;
    catalogScript.src = `${PRODUCT_CATALOG_ENDPOINT}?action=products&callback=${encodeURIComponent(callbackName)}&t=${Date.now()}`;
    document.head.appendChild(catalogScript);
}
