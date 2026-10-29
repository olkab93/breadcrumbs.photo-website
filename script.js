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
        mainNavigation.querySelectorAll(".nav-dropdown[open]").forEach(dropdown => {
            dropdown.open = false;
        });
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

// =========================
// PRODUCT CATALOG
// =========================

const productDataElements = document.querySelectorAll(
    "[data-product-names], [data-product-formats], [data-product-pages], [data-product-max-photos], [data-product-prices]"
);

if (productDataElements.length) {
    const PRODUCT_CATALOG_ENDPOINT = "https://script.google.com/macros/s/AKfycbywufOMqv1wNAPG7WF1spzrVxgFlldTwlnNtJ_TZ8E87dYpJ9ueVzkNDBGPHu_N2CukHA/exec";
    const callbackName = `homeProductsCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const catalogScript = document.createElement("script");

    const cleanupCatalogRequest = () => {
        delete window[callbackName];
        catalogScript.remove();
    };

    const syncEditionPurchaseWidth = () => {
        const firstTitleLine = document.querySelector(".edition-copy .edition-title-first-line");
        const purchaseRow = document.querySelector(".edition-copy .edition-purchase-row");
        if (!firstTitleLine || !purchaseRow) return;
        purchaseRow.style.setProperty("--edition-title-line-width", `${firstTitleLine.getBoundingClientRect().width}px`);
    };

    const renderCatalogResponse = (response, saveToCache = false) => {
        if (!response?.success) return;

        if (saveToCache) {
            try {
                localStorage.setItem("breadcrumbsProductCatalogCache", JSON.stringify({
                    savedAt: Date.now(),
                    response
                }));
            } catch (error) {
                // Storage may be disabled; the live catalog still renders normally.
            }
        }

        if (response.settings && typeof response.settings === "object") {
            document.querySelectorAll("[data-store-setting]").forEach(element => {
                const key = element.dataset.storeSetting;
                if (Object.prototype.hasOwnProperty.call(response.settings, key)) {
                    element.textContent = response.settings[key];
                }
            });
        }
        if (Array.isArray(response.editions)) {
            const editionsById = new Map(response.editions.map(edition => [String(edition.edition_id), edition]));
            document.querySelectorAll("[data-edition-id]").forEach(section => {
                const edition = editionsById.get(section.dataset.editionId);
                if (!edition) return;
                section.querySelectorAll("[data-edition-field]").forEach(element => {
                    const field = element.dataset.editionField;
                    if (field === "price_pln" && Number.isFinite(Number(edition.price_pln))) {
                        element.textContent = `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(Number(edition.price_pln))} zł`;
                    } else if (field === "title") {
                        const titleWords = String(edition.title || "").trim().split(/\s+/).filter(Boolean);
                        const firstLine = document.createElement("span");
                        firstLine.className = "edition-title-first-line";
                        firstLine.textContent = titleWords.shift() || "";
                        element.replaceChildren(firstLine);
                        if (titleWords.length) {
                            element.append(document.createElement("br"));
                            const secondLine = document.createElement("span");
                            secondLine.textContent = titleWords.join(" ");
                            element.append(secondLine);
                        }
                    } else if (Object.prototype.hasOwnProperty.call(edition, field)) {
                        element.textContent = edition[field];
                    }
                });
            });
            requestAnimationFrame(syncEditionPurchaseWidth);
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
            const ids = (element.dataset.productNames || element.dataset.productFormats || element.dataset.productPages ||
                element.dataset.productMaxPhotos || element.dataset.productPrices || "")
                .split(",").map(id => id.trim()).filter(Boolean);
            const products = ids.map(id => productsById.get(id)).filter(Boolean);
            if (!products.length) return;

            if (element.hasAttribute("data-product-names")) {
                element.textContent = productBaseName(products[0].name);
            } else if (element.hasAttribute("data-product-formats")) {
                element.textContent = [...new Set(products.map(product => product.format).filter(Boolean))].join(" / ");
            } else if (element.hasAttribute("data-product-pages")) {
                const variantTargets = element.querySelectorAll("[data-product-variant-id]");
                if (variantTargets.length) {
                    variantTargets.forEach(target => {
                        const product = productsById.get(target.dataset.productVariantId);
                        if (product) target.textContent = product.pages;
                    });
                } else {
                    element.textContent = products.map(product => product.pages).join(" / ");
                }
            } else if (element.hasAttribute("data-product-max-photos")) {
                element.textContent = products.map(product => Number(product.pages) * 2).join(" / ");
            } else if (element.hasAttribute("data-product-prices")) {
                element.textContent = products.map(product => formatPrice(product.price_pln)).join(" / ");
            }
        });
    };

    // Reuse the catalog already loaded by the order form while the live request refreshes it.
    try {
        const cached = JSON.parse(localStorage.getItem("breadcrumbsProductCatalogCache") || "null");
        const cacheIsFresh = cached?.response && Date.now() - cached.savedAt <= 24 * 60 * 60 * 1000;
        if (cacheIsFresh) renderCatalogResponse(cached.response);
    } catch (error) {
        // Continue with the live request when local storage is unavailable or invalid.
    }

    window[callbackName] = (response) => {
        cleanupCatalogRequest();
        renderCatalogResponse(response, true);
    };

    catalogScript.onerror = cleanupCatalogRequest;
    catalogScript.src = `${PRODUCT_CATALOG_ENDPOINT}?action=products&callback=${encodeURIComponent(callbackName)}&t=${Date.now()}`;
    document.head.appendChild(catalogScript);
    requestAnimationFrame(syncEditionPurchaseWidth);
    document.fonts?.ready.then(syncEditionPurchaseWidth);
    window.addEventListener("resize", syncEditionPurchaseWidth);
}
