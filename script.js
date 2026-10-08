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
