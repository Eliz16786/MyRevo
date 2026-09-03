(function () {

    const isMobilePhone = /Mobi|Android/i.test(navigator.userAgent);
    
    const isMobileDesktopMode = navigator.maxTouchPoints > 0 && screen.width < 600 && window.innerWidth >= 1000;

    if (isMobilePhone && !isMobileDesktopMode) {
        blockMobile();
        return;
    }

    if (isMobileDesktopMode) {
        document.documentElement.classList.add('is-mobile-device');
        enableDesktopLayout();
        return;
    }

    enableDesktopLayout();

    function enableDesktopLayout() {
        let viewport = document.querySelector('meta[name="viewport"]');

        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            document.head.appendChild(viewport);
        }

        viewport.content = 'width=1300';

        const style = document.createElement('style');
        style.textContent = `
            html, body {
                min-width: 1300px;
                overflow-x: auto;
                overflow-y: auto;
            }
        `;
        document.head.appendChild(style);
    }

    function blockMobile() {
        const hideStyle = document.createElement('style');
        hideStyle.id = 'device-check-hide';
        hideStyle.textContent = `
            body > *:not(#device-check-overlay) {
                display: none !important;
            }
        `;
        document.head.appendChild(hideStyle);

        const overlay = document.createElement('div');
        overlay.id = 'device-check-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 2rem;
            font-family: sans-serif;
            background: #ffffff;
            color: #333333;
            z-index: 999999;
        `;

        overlay.innerHTML = `
            <title>MyRevo - Device Check</title>
            <h2 style="font-size: 1.5rem; margin-bottom: 1rem; color: #8a64e2;">
                Please use a bigger screen.
            </h2>
            <p style="font-size: 1rem; max-width: 28rem; line-height: 1.5;">
                MyRevo works best on a laptop, computer, or tablet.
                <strong>On a phone, switch your browser to
                "Desktop site" mode to continue.</strong>
            </p>
        `;

        document.body.appendChild(overlay);
    }

})();