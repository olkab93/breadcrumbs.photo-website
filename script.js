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
