/**
 * Prints a full HTML document in place, without opening a new browser
 * tab/window. Report/document print buttons used to build an HTML string
 * and hand it to `window.open('', '_blank')`, which pop-up blockers can
 * silently swallow and which always leaves an extra tab behind even when it
 * works. This renders the same HTML into a hidden offscreen <iframe> and
 * calls print() on it instead, then removes the iframe once printing is done.
 */
export function printHtml(html: string): void {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        iframe.remove();
    };

    iframe.onload = () => {
        const win = iframe.contentWindow;
        if (!win) { cleanup(); return; }
        win.focus();
        win.onafterprint = cleanup;
        win.print();
        // Some browsers don't reliably fire `afterprint` — fall back to a timer.
        setTimeout(cleanup, 5000);
    };

    const doc = iframe.contentDocument;
    if (!doc) { cleanup(); return; }
    doc.open();
    doc.write(html);
    doc.close();
}
