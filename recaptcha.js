// Publiczny site key reCAPTCHA v3 dla domeny breadcrumbs.photo.
window.RECAPTCHA_SITE_KEY = "6Ldy3PUtAAAAAJ-m2uMJNrh0rMTjHz2LvlffBOln";
window.RECAPTCHA_BACKEND_ENDPOINT = "https://script.google.com/macros/s/AKfycbywufOMqv1wNAPG7WF1spzrVxgFlldTwlnNtJ_TZ8E87dYpJ9ueVzkNDBGPHu_N2CukHA/exec";

window.loadRecaptcha = function () {
    if (!window.RECAPTCHA_SITE_KEY) {
        return Promise.reject(new Error("Ochrona formularza nie jest jeszcze skonfigurowana. Skontaktuj się z breadcrumbs.photo."));
    }
    if (window.grecaptcha?.execute) return Promise.resolve();
    if (window._breadcrumbsRecaptchaPromise) return window._breadcrumbsRecaptchaPromise;

    window._breadcrumbsRecaptchaPromise = new Promise((resolve, reject) => {
        const callbackName = "breadcrumbsRecaptchaReady";
        const script = document.createElement("script");
        const timer = setTimeout(() => reject(new Error("Nie udało się załadować zabezpieczenia CAPTCHA.")), 12000);
        window[callbackName] = () => { clearTimeout(timer); delete window[callbackName]; resolve(); };
        script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(window.RECAPTCHA_SITE_KEY)}&onload=${callbackName}`;
        script.onerror = () => { clearTimeout(timer); delete window[callbackName]; reject(new Error("Nie udało się załadować zabezpieczenia CAPTCHA.")); };
        document.head.appendChild(script);
    }).catch((error) => {
        // Allow a later retry if loading failed because of a temporary network issue.
        window._breadcrumbsRecaptchaPromise = null;
        throw error;
    });
    return window._breadcrumbsRecaptchaPromise;
};

window.executeRecaptcha = async function (action) {
    await window.loadRecaptcha();
    return window.grecaptcha.execute(window.RECAPTCHA_SITE_KEY, { action });
};

window.verifyRecaptchaForHomepage = function (token, action) {
    return new Promise((resolve, reject) => {
        const callbackName = `breadcrumbsCaptchaCheck_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const script = document.createElement("script");
        const cleanup = () => { delete window[callbackName]; script.remove(); clearTimeout(timer); };
        const timer = setTimeout(() => { cleanup(); reject(new Error("Nie udało się sprawdzić zabezpieczenia. Spróbuj ponownie.")); }, 12000);
        window[callbackName] = (result) => { cleanup(); result?.valid ? resolve() : reject(new Error(result?.error || "Weryfikacja CAPTCHA nie powiodła się. Spróbuj ponownie.")); };
        script.onerror = () => { cleanup(); reject(new Error("Nie udało się sprawdzić zabezpieczenia. Spróbuj ponownie.")); };
        script.src = `${window.RECAPTCHA_BACKEND_ENDPOINT}?action=verify_recaptcha&token=${encodeURIComponent(token)}&recaptcha_action=${encodeURIComponent(action)}&callback=${encodeURIComponent(callbackName)}&t=${Date.now()}`;
        document.head.appendChild(script);
    });
};

// Load the API while the order page is open, so submit does not pay its load cost.
if (document.querySelector("#order-form")) {
    window.loadRecaptcha().catch((error) => {
        console.warn("reCAPTCHA preloading failed; it will retry on submit:", error);
    });
}
