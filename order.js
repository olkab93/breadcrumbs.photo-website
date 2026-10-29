const yearElement = document.querySelector("#current-year");
const menuToggle = document.querySelector(".menu-toggle");
const mainNavigation = document.querySelector(".main-navigation");

// =========================
// YEAR
// =========================

if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
}


// =========================
// MOBILE MENU
// =========================

if (menuToggle && mainNavigation) {
    const closeMenu = () => {
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Otwórz menu");
        mainNavigation.classList.remove("is-open");
    };

    menuToggle.addEventListener("click", () => {
        const isOpen = menuToggle.getAttribute("aria-expanded") === "true";

        menuToggle.setAttribute("aria-expanded", String(!isOpen));
        menuToggle.setAttribute(
            "aria-label",
            isOpen ? "Otwórz menu" : "Zamknij menu"
        );

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
// ORDER FORM
// =========================

const form = document.querySelector("#order-form");
const zinesList = document.querySelector("#zines-list");
const zineTemplate = document.querySelector("#zine-template");
const addZineButton = document.querySelector("#add-zine");
const successSection = document.querySelector("#order-success");
const editionCheckbox = document.querySelector("#include-edition");
const editionQuantityInput = document.querySelector("#edition-quantity");
const printsCheckbox = document.querySelector("#include-prints");
const printPackageSelect = document.querySelector("#print-package");
const printPackageQuantityInput = document.querySelector("#print-package-quantity");
const printSubtotalElement = document.querySelector("#prints-subtotal");
const requestedEditionId = new URLSearchParams(window.location.search).get("edition");
let activeOrderRequestId = sessionStorage.getItem("breadcrumbsActiveOrderRequestId");
let activeOrderPostSent = sessionStorage.getItem("breadcrumbsActiveOrderPostSent") === "true";
let orderSubmissionInProgress = false;
let appliedPromo = null;
let promoValidationRequest = 0;
const ORDER_ENDPOINT = "https://script.google.com/macros/s/AKfycbywufOMqv1wNAPG7WF1spzrVxgFlldTwlnNtJ_TZ8E87dYpJ9ueVzkNDBGPHu_N2CukHA/exec";

let zineCount = 0;
let storeSettings = {
    shipping_standard: 15,
    free_shipping_from: 3,
    discount_from_count: 5,
    discount_percent: 10,
    max_zines_per_order: 5
};

let productCatalog = [];
let productCatalogLoaded = false;
let productCatalogError = null;
const DEFAULT_EDITION = {
    edition_id: "breadcrumbs_001",
    name: "BREADCRUMBS / 001",
    title: "Concrete Jungle",
    price_pln: 39,
    edition_limit: 10,
    available_quantity: 10,
    active: true,
    description: "Pierwszy numer autorskiej serii breadcrumbs. Każda edycja ukazuje się raz na kwartał."
};
let editionCatalog = [DEFAULT_EDITION];
let printPackageCatalog = [
    { package_id: "prints_10", print_count: 10, name: "Mały zestaw", price_pln: 15 },
    { package_id: "prints_25", print_count: 25, name: "Na ulubione wspomnienia", price_pln: 32 },
    { package_id: "prints_50", print_count: 50, name: "Większa kolekcja", price_pln: 55 },
    { package_id: "prints_100", print_count: 100, name: "Duży zestaw", price_pln: 100 }
];

const PRODUCT_CATALOG_CACHE_KEY = "breadcrumbsProductCatalogCache";

function renderPrintPackageOptions() {
    if (!printPackageSelect || !printPackageCatalog.length) return;
    const previous = printPackageSelect.value;
    printPackageSelect.replaceChildren(...printPackageCatalog.map(item => {
        const option = document.createElement("option");
        option.value = item.package_id;
        option.textContent = `${item.print_count} odbitek · ${item.name} · ${formatPrice(item.price_pln)}`;
        return option;
    }));
    if (printPackageCatalog.some(item => item.package_id === previous)) printPackageSelect.value = previous;
}
// Keep the last known catalog available between visits. The live request below
// always refreshes it in the background, while the backend remains authoritative
// when an order is submitted.
const PRODUCT_CATALOG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PRINT_PACKAGE_QUANTITY = 10;

function applyProductCatalogResponse(response) {
    if (!response?.success || !Array.isArray(response.products) || !response.settings) {
        throw new Error('Nie udało się pobrać konfiguracji breadcrumbs.');
    }

    const settingKeys = [
        "shipping_standard", "free_shipping_from", "discount_from_count",
        "discount_percent", "max_zines_per_order"
    ];
    const settings = {};
    for (const key of settingKeys) {
        settings[key] = Number(response.settings[key]);
        if (!Number.isFinite(settings[key])) {
            throw new Error(`Nieprawidłowa wartość ustawienia: ${key}`);
        }
    }
    storeSettings = settings;

    const products = response.products
        .filter(product => product.active !== false)
        .map(product => ({
            product_id: String(product.product_id),
            name: String(product.name),
            format: String(product.format),
            pages: Number(product.pages),
            price_pln: Number(product.price_pln)
        }))
        .filter(product => product.product_id && product.name && product.format &&
            Number.isInteger(product.pages) && Number.isFinite(product.price_pln));

    if (products.length === 0) throw new Error('Brak aktywnych breadcrumbs.');
    productCatalog = products;
    if (Array.isArray(response.editions)) {
        editionCatalog = response.editions.map(edition => ({
            edition_id: String(edition.edition_id || ""),
            name: String(edition.name || ""),
            title: String(edition.title || ""),
            price_pln: Number(edition.price_pln),
            edition_limit: Number(edition.edition_limit),
            available_quantity: Number(edition.available_quantity),
            active: edition.active !== false,
            description: String(edition.description || "")
        })).filter(edition => edition.edition_id && edition.name && edition.title &&
            Number.isFinite(edition.price_pln) && Number.isFinite(edition.edition_limit) &&
            Number.isFinite(edition.available_quantity));
    }
    if (Array.isArray(response.print_packages)) {
        printPackageCatalog = response.print_packages.map(item => ({
            package_id: String(item.package_id || ""),
            print_count: Number(item.print_count),
            name: String(item.name || ""),
            price_pln: Number(item.price_pln),
            active: item.active !== false
        })).filter(item => item.package_id && item.name && Number.isInteger(item.print_count) && Number.isFinite(item.price_pln));
        renderPrintPackageOptions();
    }
    updateEditionUI();
    return products;
}

function readCachedProductCatalog() {
    try {
        const cached = JSON.parse(localStorage.getItem(PRODUCT_CATALOG_CACHE_KEY) || "null");
        if (!cached?.response || Date.now() - cached.savedAt > PRODUCT_CATALOG_CACHE_TTL_MS) {
            return null;
        }
        applyProductCatalogResponse(cached.response);
        return cached.response;
    } catch (error) {
        return null;
    }
}

function loadProductCatalog() {
    return new Promise((resolve, reject) => {
        const callbackName = `productsCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const script = document.createElement('script');
        let settled = false;

        const cleanup = () => {
            delete window[callbackName];
            script.remove();
        };

        window[callbackName] = (response) => {
            if (settled) return;
            settled = true;
            cleanup();

            try {
                applyProductCatalogResponse(response);
                try {
                    localStorage.setItem(PRODUCT_CATALOG_CACHE_KEY, JSON.stringify({
                        savedAt: Date.now(),
                        response
                    }));
                } catch (error) {
                    // Storage may be disabled; the live catalog still renders normally.
                }
                resolve(productCatalog);
            } catch (error) {
                reject(error);
            }
        };

        script.onerror = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('Nie udało się pobrać konfiguracji breadcrumbs.'));
        };

        script.src = `${ORDER_ENDPOINT}?action=products&callback=${encodeURIComponent(callbackName)}&t=${Date.now()}`;
        document.head.appendChild(script);
    });
}


function productFamilyForId(productId) {
    if (productId.startsWith("album_")) return "album";
    if (productId.startsWith("zine_mini_")) return "zine_mini";
    if (productId.startsWith("zine_")) return "zine";
    return "";
}

function isQuantityDiscountEligibleProduct(product) {
    return ["zine", "zine_mini", "album"].includes(
        productFamilyForId(String(product?.product_id || ""))
    );
}

const PRODUCT_PAGES_BY_FAMILY = {
    zine: [16, 32],
    zine_mini: [8, 16],
    album: [8, 16]
};

function getSelectedCatalogProduct(item, number) {
    if (!item) return null;
    const family = item.querySelector(`select[name="zine-${number}-product-kind"]`)?.value;
    const pages = Number(item.querySelector(`input[name="zine-${number}-pages"]:checked`)?.value);
    if (!PRODUCT_PAGES_BY_FAMILY[family]?.includes(pages)) return null;
    return productCatalog.find(product =>
        productFamilyForId(product.product_id) === family && product.pages === pages
    ) || null;
}

function syncZineProduct(item, number) {
    if (!item) return null;

    const familySelect = item.querySelector(`select[name="zine-${number}-product-kind"]`);
    const pageInputs = item.querySelectorAll(`input[name="zine-${number}-pages"]`);
    if (!familySelect || pageInputs.length === 0) return null;
    Array.from(familySelect.options).forEach(option => {
        const allowedPages = PRODUCT_PAGES_BY_FAMILY[option.value] || [];
        option.disabled = !productCatalog.some(product =>
            productFamilyForId(product.product_id) === option.value && allowedPages.includes(product.pages)
        );
    });
    if (!familySelect.value || familySelect.selectedOptions[0]?.disabled) {
        familySelect.value = Array.from(familySelect.options).find(option => !option.disabled)?.value || "";
    }

    const allowedPages = PRODUCT_PAGES_BY_FAMILY[familySelect.value] || [];
    const availablePages = productCatalog
        .filter(product => productFamilyForId(product.product_id) === familySelect.value)
        .map(product => product.pages)
        .filter(pages => allowedPages.includes(pages));
    pageInputs.forEach(input => {
        const isAvailable = availablePages.includes(Number(input.value));
        input.disabled = !isAvailable;
        const optionLabel = input.closest("label");
        if (optionLabel) optionLabel.hidden = !isAvailable;
    });
    const selectedPage = item.querySelector(`input[name="zine-${number}-pages"]:checked`);
    if (!selectedPage || selectedPage.disabled) {
        const firstAvailablePage = Array.from(pageInputs).find(input => !input.disabled);
        if (firstAvailablePage) firstAvailablePage.checked = true;
    }

    const product = getSelectedCatalogProduct(item, number);
    const family = familySelect.value;
    const coverField = item.querySelector(".zine-cover-field");
    const coverInputs = item.querySelectorAll(`input[name="zine-${number}-cover"]`);
    const needsCoverChoice = family !== "album";
    if (coverField) coverField.hidden = !needsCoverChoice;
    coverInputs.forEach(input => {
        input.required = needsCoverChoice;
        if (!needsCoverChoice && input.value === "regular") input.checked = true;
    });

    item.dataset.productId = product?.product_id || "";
    const priceElement = item.querySelector("[data-zine-price]");
    if (priceElement) priceElement.textContent = product ? formatPrice(product.price_pln) : "—";
    return product;
}

// =========================
// ADD ZINE
// =========================

function addZine() {
    if (zineCount >= storeSettings.max_zines_per_order) {
        return;
    }

    zineCount++;

    // Clone template
    const clone = zineTemplate.content.cloneNode(true);

    // Update zine index
    const zineIndex = clone.querySelector(".zine-index");
    if (zineIndex) {
        zineIndex.textContent = zineCount;
    }

    // Update all field names with unique zine number
    const inputs = clone.querySelectorAll('input, textarea, select');
    inputs.forEach((input) => {
        if (input.name === "zine-product-kind") {
            input.name = `zine-${zineCount}-product-kind`;
        } else if (input.name === "zine-pages") {
            input.name = `zine-${zineCount}-pages`;
        } else if (input.name === "zine-title") {
            input.name = `zine-${zineCount}-title`;
        } else if (input.name === "zine-subtitle") {
            input.name = `zine-${zineCount}-subtitle`;
        } else if (input.name === "zine-notes") {
            input.name = `zine-${zineCount}-notes`;
        } else if (input.name === "zine-cover") {
            input.name = `zine-${zineCount}-cover`;
        }
    });

    const zineItem = document.createElement("div");
    zineItem.appendChild(clone);
    zinesList.appendChild(zineItem);

    // Query for the .zine-form-item element within the newly added zine
    const newZineFormItem = zineItem.querySelector(".zine-form-item");

    // Query for inputs in this specific zine
    const productKindSelect = zineItem.querySelector(`select[name="zine-${zineCount}-product-kind"]`);
    const pagesInputs = zineItem.querySelectorAll(`input[name="zine-${zineCount}-pages"]`);
    const coverInputs = zineItem.querySelectorAll(`input[name="zine-${zineCount}-cover"]`);
    const defaultProduct = productCatalog.find(product => product.product_id === "zine_16") || productCatalog[0];

    if (defaultProduct) {
        const defaultFamily = productFamilyForId(defaultProduct.product_id);
        if (productKindSelect) productKindSelect.value = defaultFamily;
        const defaultPage = Array.from(pagesInputs).find(input => Number(input.value) === defaultProduct.pages);
        if (defaultPage) defaultPage.checked = true;
    }

    [productKindSelect, ...pagesInputs].filter(Boolean).forEach(control => {
        control.addEventListener("change", () => {
            const currentNumber = Array.from(zinesList.querySelectorAll(".zine-form-item")).indexOf(newZineFormItem) + 1;
            syncZineProduct(newZineFormItem, currentNumber);
            updateSummary();
        });
    });

    if (coverInputs[0]) coverInputs[0].checked = true;

    syncZineProduct(newZineFormItem, zineCount);

    // Add remove button handler
    const removeButton = zineItem.querySelector(".remove-zine");
    if (removeButton) {
        removeButton.addEventListener("click", () => {
            zineItem.remove();
            zineCount--;
            renumberZines();
            updateAddButton();
            updateSummary();
        });
    }

    updateAddButton();
    updateSummary();

    // Scroll to newly added zine form item with header offset
    if (newZineFormItem && zineIndex.textContent != 1) {
        const header = document.querySelector("header");
        const headerHeight = header ? header.offsetHeight : 0;
        const elementTop = newZineFormItem.getBoundingClientRect().top + window.scrollY;

        window.scrollTo({
            top: elementTop - headerHeight - 20, // 20px additional padding
            behavior: "smooth"
        });
    }
}


// =========================
// RENUMBER ZINES
// =========================

function renumberZines() {
    const zineItems = zinesList.querySelectorAll(".zine-form-item");

    zineItems.forEach((item, index) => {
        const newNumber = index + 1;

        // Update display number
        const zineIndex = item.querySelector(".zine-index");
        if (zineIndex) {
            zineIndex.textContent = newNumber;
        }

        // Update all field names to match new position
        const inputs = item.querySelectorAll('input, textarea, select');
        inputs.forEach((input) => {
            if (input.name.endsWith("-product-kind")) {
                input.name = `zine-${newNumber}-product-kind`;
            } else if (input.name.endsWith("-pages")) {
                input.name = `zine-${newNumber}-pages`;
            } else if (input.name.includes("title")) {
                input.name = `zine-${newNumber}-title`;
            } else if (input.name.includes("subtitle")) {
                input.name = `zine-${newNumber}-subtitle`;
            } else if (input.name.includes("notes")) {
                input.name = `zine-${newNumber}-notes`;
            } else if (input.name.includes("cover")) {
                input.name = `zine-${newNumber}-cover`;
            }
        });
        syncZineProduct(item, newNumber);
    });
}


// =========================
// UPDATE ADD BUTTON
// =========================

function updateAddButton() {
    if (!addZineButton) return;

    if (zineCount >= storeSettings.max_zines_per_order) {
        addZineButton.disabled = true;
    } else {
        addZineButton.disabled = false;
    }
}

if (addZineButton) {
    addZineButton.addEventListener("click", (e) => {
        e.preventDefault();
        addZine();
    });
}


// =========================
// SHIPPING FIELDS
// =========================

const shippingRadios = document.querySelectorAll('input[name="shipping"]');
const lockerFields = document.querySelector("#locker-fields");
const addressFields = document.querySelector("#address-fields");
const pickupRadio = document.querySelector('input[name="shipping"][value="pickup"]');

function updateShippingFields() {
    const selectedValue = document.querySelector('input[name="shipping"]:checked')?.value;

    if (lockerFields) {
        lockerFields.classList.toggle("is-hidden", selectedValue !== "locker");
    }

    if (addressFields) {
        addressFields.classList.toggle("is-hidden", selectedValue !== "address");
    }

    // Update required attributes
    const lockerInput = document.querySelector('input[name="locker"]');
    const streetInput = document.querySelector('input[name="street"]');
    const postalInput = document.querySelector('input[name="postal-code"]');
    const cityInput = document.querySelector('input[name="city"]');
    const addressNameInput = document.querySelector('input[name="address-name"]');

    if (selectedValue === "locker") {
        lockerInput && (lockerInput.required = true);
        streetInput && (streetInput.required = false);
        postalInput && (postalInput.required = false);
        cityInput && (cityInput.required = false);
        addressNameInput && (addressNameInput.required = false);
    } else if (selectedValue === "address") {
        lockerInput && (lockerInput.required = false);
        streetInput && (streetInput.required = true);
        postalInput && (postalInput.required = true);
        cityInput && (cityInput.required = true);
        addressNameInput && (addressNameInput.required = true);
    } else {
        lockerInput && (lockerInput.required = false);
        streetInput && (streetInput.required = false);
        postalInput && (postalInput.required = false);
        cityInput && (cityInput.required = false);
        addressNameInput && (addressNameInput.required = false);
    }
}

shippingRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
        updateShippingFields();
        updateSummary();
    });
});


// =========================
// CALCULATE ORDER
// =========================

function calculateOrder() {
    const zineItems = zinesList.querySelectorAll(".zine-form-item");
    const selectedEdition = editionCheckbox?.checked
        ? editionCatalog.find(edition => edition.edition_id === editionCheckbox.value && edition.active)
        : null;
    const enteredEditionQuantity = Number(editionQuantityInput?.value);
    const editionMaxQuantity = selectedEdition
        ? Math.max(0, Math.floor(Math.min(selectedEdition.available_quantity, selectedEdition.edition_limit)))
        : 0;
    const editionQuantity = selectedEdition && Number.isInteger(enteredEditionQuantity) &&
        enteredEditionQuantity >= 1 && enteredEditionQuantity <= editionMaxQuantity
        ? enteredEditionQuantity
        : 0;
    const editionSubtotal = selectedEdition ? selectedEdition.price_pln * editionQuantity : 0;
    const selectedPrintPackage = printsCheckbox?.checked
        ? printPackageCatalog.find(item => item.package_id === printPackageSelect?.value)
        : null;
    const enteredPrintQuantity = Number(printPackageQuantityInput?.value);
    const printQuantity = selectedPrintPackage && Number.isInteger(enteredPrintQuantity) &&
        enteredPrintQuantity > 0 && enteredPrintQuantity <= MAX_PRINT_PACKAGE_QUANTITY
        ? enteredPrintQuantity
        : 0;
    const printsSubtotal = selectedPrintPackage ? selectedPrintPackage.price_pln * printQuantity : 0;
    let subtotal = 0;
    let discountEligibleCount = 0;
    let discountEligibleSubtotal = 0;

    zineItems.forEach((item, index) => {
        const zineNum = index + 1;
        const product = getSelectedCatalogProduct(item, zineNum);
        if (!product) return;
        subtotal += product.price_pln;
        if (isQuantityDiscountEligibleProduct(product)) {
            discountEligibleCount += 1;
            discountEligibleSubtotal += product.price_pln;
        }
    });

    const count = zineItems.length;
    const discountRate = appliedPromo
        ? appliedPromo.discount_percent / 100
        : discountEligibleCount >= storeSettings.discount_from_count
            ? storeSettings.discount_percent / 100
            : 0;
    const selectedShipping = form?.querySelector('input[name="shipping"]:checked')?.value;
    const shipping = selectedShipping === "pickup"
        ? 0
        : count >= storeSettings.free_shipping_from
            ? 0
            : storeSettings.shipping_standard;
    const promoDiscountSubtotal = subtotal + editionSubtotal + printsSubtotal;
    const discountBase = appliedPromo ? promoDiscountSubtotal : discountEligibleSubtotal;
    const discount = Math.round((discountBase * discountRate + Number.EPSILON) * 100) / 100;
    const total = Math.round((subtotal - discount + editionSubtotal + printsSubtotal + shipping + Number.EPSILON) * 100) / 100;

    return { count, discountEligibleCount, subtotal, discount, shipping, total, discountRate, selectedEdition, editionQuantity, editionSubtotal, selectedPrintPackage, printQuantity, printsSubtotal };
}

// =========================
// FORMAT PRICE
// =========================

function formatPrice(value) {
    return value.toFixed(2).replace(".", ",") + " zł";
}

function updateEditionUI() {
    if (!editionCheckbox) return;
    const edition = editionCatalog.find(item =>
        item.edition_id === (requestedEditionId || editionCheckbox.value) && item.active
    ) || editionCatalog.find(item => item.edition_id === DEFAULT_EDITION.edition_id && item.active);
    if (!edition) {
        editionCheckbox.disabled = true;
        editionCheckbox.checked = false;
        return;
    }

    editionCheckbox.value = edition.edition_id;
    editionCheckbox.disabled = false;
    document.querySelectorAll("[data-edition-field]").forEach(element => {
        const field = element.dataset.editionField;
        if (field === "price_pln") element.textContent = formatPrice(edition.price_pln);
        else if (Object.prototype.hasOwnProperty.call(edition, field)) element.textContent = edition[field];
    });

    if (editionQuantityInput) {
        const maxQuantity = Math.max(0, Math.floor(Math.min(edition.available_quantity, edition.edition_limit)));
        const previousQuantity = Math.max(1, Number(editionQuantityInput.value) || 1);
        editionQuantityInput.min = "1";
        editionQuantityInput.max = String(maxQuantity);
        editionQuantityInput.disabled = maxQuantity === 0;
        if (maxQuantity > 0) editionQuantityInput.value = String(Math.min(previousQuantity, maxQuantity));
        if (maxQuantity === 0) {
            editionCheckbox.checked = false;
            editionCheckbox.disabled = true;
        }
    }
    if (requestedEditionId === edition.edition_id) editionCheckbox.checked = true;
}

editionCheckbox?.addEventListener("change", updateSummary);
editionQuantityInput?.addEventListener("input", updateSummary);
printsCheckbox?.addEventListener("change", updateSummary);
printPackageSelect?.addEventListener("change", updateSummary);
printPackageQuantityInput?.addEventListener("input", () => {
    if (Number(printPackageQuantityInput.value) > MAX_PRINT_PACKAGE_QUANTITY) {
        printPackageQuantityInput.value = String(MAX_PRINT_PACKAGE_QUANTITY);
    }
    updateSummary();
});


// =========================
// UPDATE SUMMARY
// =========================

function updateSummary() {
    const { count, subtotal, discount, shipping, total, discountRate, selectedEdition, editionQuantity, editionSubtotal, selectedPrintPackage, printQuantity, printsSubtotal } = calculateOrder();

    const summaryLines = document.querySelector("#summary-lines");
    const summaryTotal = document.querySelector("#summary-total");

    // Clear summary lines
    if (summaryLines) {
        summaryLines.innerHTML = "";
        if (printSubtotalElement) printSubtotalElement.textContent = formatPrice(selectedPrintPackage ? printsSubtotal : 0);

        if (count > 0 || selectedEdition || selectedPrintPackage) {
            // Group matching products by their exact catalog name from Sheets.
            const selectedProducts = new Map();
            zinesList.querySelectorAll(".zine-form-item").forEach((item, index) => {
                const product = getSelectedCatalogProduct(item, index + 1);
                if (!product) return;

                const selection = selectedProducts.get(product.name);
                if (selection) {
                    selection.quantity += 1;
                    selection.subtotal += product.price_pln;
                } else {
                    selectedProducts.set(product.name, {
                        quantity: 1,
                        subtotal: product.price_pln
                    });
                }
            });

            selectedProducts.forEach((selection, name) => {

                const productLine = document.createElement("div");
                productLine.className = "summary-line";

                const productName = document.createElement("span");
                productName.textContent = selection.quantity > 1
                    ? `${name} × ${selection.quantity}`
                    : name;

                const productPrice = document.createElement("strong");
                productPrice.textContent = formatPrice(selection.subtotal);

                productLine.append(productName, productPrice);
                summaryLines.appendChild(productLine);
            });

            if (selectedEdition) {
                const editionLine = document.createElement("div");
                editionLine.className = "summary-line";
                const editionName = document.createElement("span");
                editionName.textContent = editionQuantity > 1
                    ? `${selectedEdition.name} × ${editionQuantity}`
                    : selectedEdition.name;
                const editionPrice = document.createElement("strong");
                editionPrice.textContent = formatPrice(editionSubtotal);
                editionLine.append(editionName, editionPrice);
                summaryLines.appendChild(editionLine);
            }

            if (selectedPrintPackage) {
                const printsLine = document.createElement("div");
                printsLine.className = "summary-line";
                const printsName = document.createElement("span");
                printsName.textContent = `ODBITKI · ${selectedPrintPackage.print_count} szt. · ${selectedPrintPackage.name} × ${printQuantity}`;
                const printsPrice = document.createElement("strong");
                printsPrice.textContent = formatPrice(printsSubtotal);
                printsLine.append(printsName, printsPrice);
                summaryLines.appendChild(printsLine);
            }

            // Add discount if applicable
            if (discount > 0) {
                const discountLine = document.createElement("div");
                discountLine.className = "summary-line summary-discount";
                discountLine.innerHTML = `
                    <span>${appliedPromo ? `Kod ${appliedPromo.code} — rabat ` : "Rabat "}${Math.round(discountRate * 100)}%</span>
                    <span>−${formatPrice(discount)}</span>
                `;
                summaryLines.appendChild(discountLine);
            }

            // Add shipping
            const isPickup = document.querySelector('input[name="shipping"]:checked')?.value === "pickup";
            const shippingLine = document.createElement("div");
            shippingLine.className = "summary-line";
            shippingLine.innerHTML = `
                <span>${isPickup ? "Odbiór osobisty" : "Wysyłka"}</span>
                <span>${isPickup ? "bez kosztu" : shipping === 0 ? "gratis" : formatPrice(shipping)}</span>
            `;
            summaryLines.appendChild(shippingLine);
        }
    }

    // Update total
    if (summaryTotal) {
        summaryTotal.textContent = formatPrice(total);
    }
}


// =========================
// VALIDATION
// =========================

// =========================
// EMAIL AND PHONE VALIDATION
// =========================

function isValidEmail(email) {
    // Basic email validation: must contain @ and a dot
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidPhone(phone) {
    // Basic phone validation: at least 9 digits
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.length >= 9;
}


// =========================
// ORDER VALIDATION
// =========================

function validateOrder() {
    const errors = [];
    const invalidFields = []; // Track invalid inputs for visual feedback

    // Check if at least one product is added
    const zineItems = zinesList.querySelectorAll(".zine-form-item");
    const hasSelectedEdition = Boolean(editionCheckbox?.checked);
    const hasSelectedPrints = Boolean(printsCheckbox?.checked);
    if (zineItems.length === 0 && !hasSelectedEdition && !hasSelectedPrints) {
        errors.push("Dodaj breadcrumbs, aby kontynuować");
    }
    if (zineItems.length > 0) {
        // Check each product and require cover selection only for zines.
        zineItems.forEach((item, index) => {
            const zineNum = index + 1;
            const product = getSelectedCatalogProduct(item, zineNum);
            const coverSelected = item.querySelector(`input[name="zine-${zineNum}-cover"]:checked`);
            const family = item.querySelector(`select[name="zine-${zineNum}-product-kind"]`)?.value;

            if (!productCatalogLoaded) {
                errors.push(productCatalogError || "Lista produktów jest jeszcze ładowana.");
            } else if (!product) {
                errors.push(`Breadcrumbs ${zineNum}: Wybierz wariant i liczbę stron`);
            }
            if (product && family !== "album" && !coverSelected) {
                errors.push(`Breadcrumbs ${zineNum}: Wybierz typ okładki`);
            }
        });
    }
    if (hasSelectedEdition && !editionCatalog.some(edition => edition.edition_id === editionCheckbox.value && edition.active)) {
        errors.push("Ta edycja nie jest obecnie dostępna");
    }
    if (hasSelectedEdition) {
        const selectedEdition = editionCatalog.find(edition => edition.edition_id === editionCheckbox.value && edition.active);
        const maxQuantity = selectedEdition
            ? Math.max(0, Math.floor(Math.min(selectedEdition.available_quantity, selectedEdition.edition_limit)))
            : 0;
        const quantity = Number(editionQuantityInput?.value);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
            errors.push("Podaj prawidłową liczbę dostępnych egzemplarzy edycji autorskiej");
        }
    }
    if (hasSelectedPrints) {
        const packageExists = printPackageCatalog.some(item => item.package_id === printPackageSelect?.value);
        const quantity = Number(printPackageQuantityInput?.value);
        if (!packageExists) errors.push("Wybierz pakiet odbitek");
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PRINT_PACKAGE_QUANTITY) {
            errors.push(`Liczba pakietów odbitek może wynosić od 1 do ${MAX_PRINT_PACKAGE_QUANTITY}`);
        }
    }

    // Check contact fields
    const nameInput = form.querySelector('input[name="name"]');
    const emailInput = form.querySelector('input[name="email"]');
    const phoneInput = form.querySelector('input[name="phone"]');

    if (!nameInput || !nameInput.value.trim()) {
        errors.push("Podaj swoje imię");
        invalidFields.push(nameInput);
    }

    if (!emailInput || !emailInput.value.trim()) {
        errors.push("Podaj swój e-mail");
        invalidFields.push(emailInput);
    } else if (!isValidEmail(emailInput.value)) {
        errors.push("Podaj prawidłowy adres e-mail (np. user@example.com)");
        invalidFields.push(emailInput);
    }

    if (!phoneInput || !phoneInput.value.trim()) {
        errors.push("Podaj swój numer telefonu");
        invalidFields.push(phoneInput);
    } else if (!isValidPhone(phoneInput.value)) {
        errors.push("Podaj prawidłowy numer telefonu (min. 9 cyfr)");
        invalidFields.push(phoneInput);
    }

    // Check shipping method
    const shippingRadios = form.querySelectorAll('input[name="shipping"]');
    const selectedShipping = Array.from(shippingRadios).find(r => r.checked);

    if (!selectedShipping) {
        errors.push("Wybierz sposób wysyłki");
    } else if (selectedShipping.value === "pickup") {
        if (!appliedPromo?.pickup_allowed) {
            errors.push("Odbiór osobisty wymaga aktywnego kodu promocyjnego, który go udostępnia");
        }
    } else {
        // Check conditional fields based on shipping method
        if (selectedShipping.value === "locker") {
            const lockerInput = form.querySelector('input[name="locker"]');
            if (!lockerInput || !lockerInput.value.trim()) {
                errors.push("Podaj numer Paczkomatu");
                invalidFields.push(lockerInput);
            }
        } else if (selectedShipping.value === "address") {
            const addressNameInput = form.querySelector('input[name="address-name"]');
            const streetInput = form.querySelector('input[name="street"]');
            const postalInput = form.querySelector('input[name="postal-code"]');
            const cityInput = form.querySelector('input[name="city"]');

            if (!addressNameInput || !addressNameInput.value.trim()) {
                errors.push("Podaj imię i nazwisko dla adresu dostawy");
                invalidFields.push(addressNameInput);
            }
            if (!streetInput || !streetInput.value.trim()) {
                errors.push("Podaj ulicę i numer domu");
                invalidFields.push(streetInput);
            }
            if (!postalInput || !postalInput.value.trim()) {
                errors.push("Podaj kod pocztowy");
                invalidFields.push(postalInput);
            }
            if (!cityInput || !cityInput.value.trim()) {
                errors.push("Podaj miasto");
                invalidFields.push(cityInput);
            }
        }
    }

    return { errors, invalidFields };
}

function displayValidationErrors(data) {
    const { errors, invalidFields } = data;

    // Remove old error display if exists
    const oldErrorBox = form.querySelector(".validation-errors");
    if (oldErrorBox) {
        oldErrorBox.remove();
    }

    // Clear all previous invalid field indicators
    form.querySelectorAll("input.input-invalid").forEach(field => {
        field.classList.remove("input-invalid");
    });

    // Mark invalid fields
    let emailInvalid = false;
    let phoneInvalid = false;

    invalidFields.forEach(field => {
        if (field) {
            field.classList.add("input-invalid");
            if (field.name === "email") emailInvalid = true;
            if (field.name === "phone") phoneInvalid = true;
        }
    });

    if (errors.length > 0) {
        const errorBox = document.createElement("div");
        errorBox.className = "validation-errors";
        errorBox.setAttribute("role", "alert");

        const errorTitle = document.createElement("strong");
        errorTitle.textContent = "Sprawdź następujące pola:";

        const errorList = document.createElement("ul");
        errors.forEach(error => {
            const errorItem = document.createElement("li");
            errorItem.textContent = error;
            errorList.appendChild(errorItem);
        });

        errorBox.appendChild(errorTitle);
        errorBox.appendChild(errorList);

        // Insert after the submit button
        const submitButton = form.querySelector(".order-submit");
        if (submitButton) {
            submitButton.parentNode.insertBefore(errorBox, submitButton.nextSibling);
        } else {
            form.insertBefore(errorBox, form.firstChild);
        }

        // Scroll to error box
        errorBox.scrollIntoView({ behavior: "smooth", block: "start" });

        // Focus to phone or email input if they're invalid
        if (phoneInvalid) {
            const phoneInput = form.querySelector('input[name="phone"]');
            if (phoneInput) {
                setTimeout(() => phoneInput.focus(), 100);
            }
        } else if (emailInvalid) {
            const emailInput = form.querySelector('input[name="email"]');
            if (emailInput) {
                setTimeout(() => emailInput.focus(), 100);
            }
        }
    }
}


// =========================
// PROMO CODES
// =========================

function requestPromoValidation(code) {
    return new Promise((resolve, reject) => {
        const callbackName = `promoCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const script = document.createElement("script");
        const timeout = window.setTimeout(() => finish(new Error("Nie udało się sprawdzić kodu. Spróbuj ponownie.")), 15000);

        function cleanup() {
            window.clearTimeout(timeout);
            delete window[callbackName];
            script.remove();
        }

        function finish(error, result) {
            cleanup();
            if (error) reject(error);
            else resolve(result);
        }

        window[callbackName] = (result) => finish(null, result);
        script.onerror = () => finish(new Error("Nie udało się połączyć z systemem kodów promocyjnych."));
        script.src = `${ORDER_ENDPOINT}?action=validate_promo&code=${encodeURIComponent(code)}&callback=${encodeURIComponent(callbackName)}&t=${Date.now()}`;
        document.head.appendChild(script);
    });
}

function setPromoStatus(message, state = "") {
    const status = document.querySelector("#promo-code-status");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", state === "error");
    status.classList.toggle("is-success", state === "success");
}

function clearAppliedPromo() {
    appliedPromo = null;
    if (pickupRadio) {
        pickupRadio.disabled = true;
        pickupRadio.closest(".shipping-option")?.classList.add("shipping-option-disabled");
        if (pickupRadio.checked) {
            pickupRadio.checked = false;
            const lockerRadio = document.querySelector('input[name="shipping"][value="locker"]');
            if (lockerRadio) lockerRadio.checked = true;
        }
    }
    updateShippingFields();
    updateSummary();
}

const promoInput = document.querySelector("#promo-code");
const promoApplyButton = document.querySelector("#apply-promo-code");

if (promoInput && promoApplyButton) {
    promoInput.addEventListener("input", () => {
        promoValidationRequest++;
        promoApplyButton.disabled = false;
        promoApplyButton.textContent = "Zastosuj kod";
        if (appliedPromo) clearAppliedPromo();
        setPromoStatus("");
    });

    promoApplyButton.addEventListener("click", async () => {
        const code = promoInput.value.trim().toUpperCase();
        if (!code) {
            setPromoStatus("Wpisz kod promocyjny.", "error");
            promoInput.focus();
            return;
        }

        const requestNumber = ++promoValidationRequest;
        promoApplyButton.disabled = true;
        promoApplyButton.textContent = "Sprawdzanie…";
        setPromoStatus("");

        try {
            const result = await requestPromoValidation(code);
            if (requestNumber !== promoValidationRequest) return;
            if (!result?.valid) {
                setPromoStatus(result?.error || "Ten kod jest nieaktywny lub nieprawidłowy.", "error");
                return;
            }

            appliedPromo = {
                code: result.code,
                discount_percent: Number(result.discount_percent),
                pickup_allowed: result.pickup_allowed === true
            };
            if (pickupRadio) {
                pickupRadio.disabled = !appliedPromo.pickup_allowed;
                pickupRadio.closest(".shipping-option")?.classList.toggle(
                    "shipping-option-disabled",
                    !appliedPromo.pickup_allowed
                );
            }
            setPromoStatus(
                appliedPromo.pickup_allowed
                    ? `Kod ${appliedPromo.code} aktywny — rabat ${appliedPromo.discount_percent}%. Odbiór osobisty jest dostępny.`
                    : `Kod ${appliedPromo.code} aktywny — rabat ${appliedPromo.discount_percent}%.`,
                "success"
            );
            updateSummary();
        } catch (error) {
            if (requestNumber === promoValidationRequest) {
                setPromoStatus(error.message, "error");
            }
        } finally {
            if (requestNumber === promoValidationRequest) {
                promoApplyButton.disabled = false;
                promoApplyButton.textContent = "Zastosuj kod";
            }
        }
    });
}


// =========================
// FORM SUBMIT
// =========================


async function submitOrderToBackend() {
    const zineItems = Array.from(
        zinesList.querySelectorAll(".zine-form-item")
    );

    const selectedShipping = form.querySelector(
        'input[name="shipping"]:checked'
    );

    const payload = {
        customer_name: form.querySelector('input[name="name"]').value.trim(),
        email: form.querySelector('input[name="email"]').value.trim(),
        phone: form.querySelector('input[name="phone"]').value.trim(),

        shipping_method:
            selectedShipping.value === "locker" ? "paczkomat" :
                selectedShipping.value === "pickup" ? "odbiór osobisty" : "na adres",
        promo_code: appliedPromo?.code || "",

        paczkomat_code:
            selectedShipping.value === "locker"
                ? form.querySelector('input[name="locker"]').value.trim()
                : "",

        recipient_name:
            selectedShipping.value === "address"
                ? form.querySelector('input[name="address-name"]').value.trim()
                : "",

        street:
            selectedShipping.value === "address"
                ? form.querySelector('input[name="street"]').value.trim()
                : "",

        postal_code:
            selectedShipping.value === "address"
                ? form.querySelector('input[name="postal-code"]').value.trim()
                : "",

        city:
            selectedShipping.value === "address"
                ? form.querySelector('input[name="city"]').value.trim()
                : "",

        zines: zineItems.map((item, index) => {
            const number = index + 1;

            const product = getSelectedCatalogProduct(item, number);

            const cover = item.querySelector(`input[name="zine-${number}-cover"]:checked`);

            return {
                product_id: product.product_id,
                title: item.querySelector(
                    `input[name="zine-${number}-title"]`
                )?.value.trim() || "",
                subtitle: item.querySelector(
                    `input[name="zine-${number}-subtitle"]`
                )?.value.trim() || "",
                notes: item.querySelector(
                    `textarea[name="zine-${number}-notes"]`
                )?.value.trim() || "",
                cover_type:
                    cover.value === "regular" ? "zwykła" : "transparentna"
            };
        }),

        editions: editionCheckbox?.checked ? [{
            edition_id: editionCheckbox.value,
            quantity: Number(editionQuantityInput?.value || 1)
        }] : [],

        print_packages: printsCheckbox?.checked ? [{
            package_id: printPackageSelect.value,
            quantity: Number(printPackageQuantityInput.value)
        }] : [],

        notes: ""
    };


    if (activeOrderRequestId) {
        const savedPayload = sessionStorage.getItem(
            "breadcrumbsActiveOrderPayload"
        );

        if (savedPayload) {
            try {
                const previousPayload = JSON.parse(savedPayload);

                Object.keys(payload).forEach(key => delete payload[key]);
                Object.assign(payload, previousPayload);
            } catch (error) {
                console.error(
                    "Nie udało się odtworzyć danych zamówienia:",
                    error
                );

                throw new Error(
                    "Nie udało się odtworzyć poprzedniego zamówienia. " +
                    "Nie wysłano nowego."
                );
            }
        }
    }

    if (!activeOrderRequestId) {
        activeOrderRequestId = window.crypto?.randomUUID
            ? crypto.randomUUID()
            : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        sessionStorage.setItem(
            "breadcrumbsActiveOrderRequestId",
            activeOrderRequestId
        );

        activeOrderPostSent = false;
        sessionStorage.removeItem("breadcrumbsActiveOrderPostSent");
    }

    const requestId = activeOrderRequestId;
    payload.client_request_id = requestId;

    const button = form.querySelector(".order-submit");
    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = "Wysyłanie zamówienia…";

    let status = form.querySelector(".submission-status");

    if (!status) {
        status = document.createElement("p");
        status.className = "submission-status";
        status.setAttribute("role", "status");
        button.insertAdjacentElement("afterend", status);
    }

    status.textContent = "Zapisujemy zamówienie. Nie zamykaj tej strony.";

    try {
        if (!activeOrderPostSent) {
            status.textContent = "Sprawdzamy zabezpieczenie…";
            payload.recaptcha_token = await window.executeRecaptcha("submit_order");
            sessionStorage.setItem(
                "breadcrumbsActiveOrderPayload",
                JSON.stringify(payload)
            );

            // Start the POST and poll its durable status in parallel. The backend
            // records completion before sending email, so the customer need not
            // wait for email delivery to finish.
            activeOrderPostSent = true;
            sessionStorage.setItem(
                "breadcrumbsActiveOrderPostSent",
                "true"
            );
            fetch(ORDER_ENDPOINT, {
                method: "POST",
                mode: "no-cors",
                headers: {
                    "Content-Type": "text/plain;charset=utf-8"
                },
                body: JSON.stringify(payload)
            }).catch((postError) => {
                console.error("Order POST failed; checking the request register:", postError);
            });
        }

        status.textContent = "Sprawdzamy status zamówienia…";

        const result = await waitForOrderResult(requestId, 90000);

        if (!result || result.success !== true) {
            const error = new Error(
                result?.error ||
                "Nie udało się potwierdzić zapisu zamówienia."
            );

            error.code = result?.code || "ORDER_FAILED";
            throw error;
        }

        const successOrder = document.querySelector(".success-order");

        if (successOrder) {
            successOrder.textContent = "";

            const label = document.createTextNode("Numer zamówienia: ");
            const strong = document.createElement("strong");
            strong.textContent = result.order_id;

            successOrder.append(label, strong);
        }

        status.textContent = "";
        activeOrderRequestId = null;
        activeOrderPostSent = false;

        sessionStorage.removeItem("breadcrumbsActiveOrderRequestId");
        sessionStorage.removeItem("breadcrumbsActiveOrderPostSent");
        sessionStorage.removeItem("breadcrumbsActiveOrderPayload");

        form.hidden = true;

        if (successSection) {
            successSection.classList.remove("is-hidden");

            const header = document.querySelector("header");
            const headerHeight = header ? header.offsetHeight : 0;
            const elementTop =
                successSection.getBoundingClientRect().top + window.scrollY;

            window.scrollTo({
                top: elementTop - headerHeight - 20,
                behavior: "smooth"
            });
        }
    } catch (error) {
        console.error("Order submission failed:", error);
        if (error.code === "ORDER_NOT_FOUND") {
            activeOrderPostSent = false;

            sessionStorage.removeItem(
                "breadcrumbsActiveOrderPostSent"
            );

            status.textContent =
                "Nie znaleźliśmy żądania w rejestrze. " +
                "Kliknij przycisk ponownie, aby ponowić wysyłkę.";

            button.disabled = !form.querySelector("#terms-accepted").checked;
            button.textContent = originalText;
            return;
        }

        if (error.code === "RECAPTCHA_REJECTED" || error.code === "RECAPTCHA_NOT_CONFIGURED") {
            activeOrderRequestId = null;
            activeOrderPostSent = false;
            sessionStorage.removeItem("breadcrumbsActiveOrderRequestId");
            sessionStorage.removeItem("breadcrumbsActiveOrderPostSent");
            sessionStorage.removeItem("breadcrumbsActiveOrderPayload");
            status.textContent = error.message || "Weryfikacja CAPTCHA nie powiodła się. Kliknij ponownie, aby spróbować jeszcze raz.";
            status.setAttribute("role", "alert");
            button.disabled = !form.querySelector("#terms-accepted").checked;
            button.textContent = originalText;
            return;
        }

        if (error.code === "ORDER_FAILED") {
            status.textContent =
                "Nie udało się potwierdzić zamówienia. " +
                "Nie wysyłaj go ponownie. Skontaktuj się z obsługą, " +
                "aby sprawdzić, czy zamówienie zostało zapisane.";

            button.disabled = true;
            button.textContent = "Wymaga sprawdzenia";
            return;
        }

        status.textContent = error.message ||
            "Nie udało się potwierdzić zamówienia. Spróbuj ponownie później.";

        status.setAttribute("role", "alert");

        button.disabled = !form.querySelector("#terms-accepted").checked;
        button.textContent = originalText;
    }
}


function waitForOrderResult(requestId, timeoutMs) {
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
        let pollDelay = 500;
        function poll() {
            if (Date.now() - startedAt >= timeoutMs) {
                reject(new Error(
                    "Nie otrzymaliśmy potwierdzenia w ciągu 90 sekund. " +
                    "Sprawdź arkusz przed ponownym wysłaniem zamówienia."
                ));
                return;
            }

            const callbackName =
                `breadcrumbsOrderCallback_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

            const script = document.createElement("script");
            let settled = false;

            function cleanup() {
                delete window[callbackName];
                script.remove();
            }

            window[callbackName] = (response) => {
                if (settled) return;

                settled = true;
                cleanup();

                if (response?.status === "pending") {
                    setTimeout(poll, pollDelay);
                    pollDelay = Math.min(Math.round(pollDelay * 1.5), 2200);
                } else if (response?.status === "complete") {
                    resolve(response.result);
                } else if (response?.status === "not_found") {
                    // The POST is still running and may not have written its first
                    // register row yet. Keep checking briefly before offering retry.
                    if (Date.now() - startedAt < 20000) {
                        setTimeout(poll, pollDelay);
                        pollDelay = Math.min(Math.round(pollDelay * 1.5), 2200);
                    } else {
                        const error = new Error(
                            "Nie znaleziono żądania w rejestrze."
                        );
                        error.code = "ORDER_NOT_FOUND";
                        reject(error);
                    }
                } else {
                    reject(new Error("Nieoczekiwana odpowiedź backendu."));
                }
            };

            script.onerror = () => {
                if (settled) return;

                settled = true;
                cleanup();
                setTimeout(poll, pollDelay);
                pollDelay = Math.min(Math.round(pollDelay * 1.5), 2200);
            };

            script.src =
                `${ORDER_ENDPOINT}?request_id=${encodeURIComponent(requestId)}` +
                `&callback=${encodeURIComponent(callbackName)}` +
                `&t=${Date.now()}`;

            document.head.appendChild(script);
        }

        poll();
    });
}



if (form) {
    const termsCheckbox = form.querySelector("#terms-accepted");
    const submitButton = form.querySelector(".order-submit");

    if (termsCheckbox && submitButton) {
        submitButton.disabled = !termsCheckbox.checked;
        termsCheckbox.addEventListener("change", () => {
            submitButton.disabled = !termsCheckbox.checked;
        });
    }

    form.querySelectorAll("[data-link-placeholder]").forEach((link) => {
        link.addEventListener("click", (event) => event.preventDefault());
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!termsCheckbox?.checked) {
            termsCheckbox?.focus();
            return;
        }

        // Nie uruchamiaj drugiego wysłania równolegle.
        if (orderSubmissionInProgress) {
            return;
        }

        const validationResult = validateOrder();

        if (validationResult.errors.length > 0) {
            displayValidationErrors(validationResult);
            return;
        }

        orderSubmissionInProgress = true;

        try {
            await submitOrderToBackend();
        } finally {
            orderSubmissionInProgress = false;
        }
    });
}


// =========================
// INITIALIZE
// =========================

updateShippingFields();
updateEditionUI();
const hasCachedCatalog = Boolean(readCachedProductCatalog());
if (hasCachedCatalog) {
    productCatalogLoaded = true;
    productCatalogError = null;
    if (addZineButton) addZineButton.textContent = "DODAJ BREADCRUMBS";
    updateAddButton();
    updateSummary();
} else {
    updateSummary();
    if (addZineButton) {
        addZineButton.disabled = true;
        addZineButton.textContent = "Ładowanie breadcrumbs…";
    }
}

// Refresh in the background. A fresh homepage catalog makes the form usable
// immediately; live backend validation remains authoritative at checkout.
loadProductCatalog()
    .then(() => {
        productCatalogLoaded = true;
        productCatalogError = null;
        if (addZineButton) addZineButton.textContent = "DODAJ BREADCRUMBS";
        zinesList?.querySelectorAll(".zine-form-item").forEach((item, index) => {
            syncZineProduct(item, index + 1);
        });
        updateAddButton();
        updateSummary();
    })
    .catch(error => {
        productCatalogError = error.message || "Nie udało się pobrać konfiguracji breadcrumbs.";
        if (!hasCachedCatalog && addZineButton) {
            addZineButton.textContent = "Breadcrumbs niedostępne";
        }
        console.error("Product catalog error:", error);
    });
