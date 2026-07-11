// Tracks whether direct WebUSB printing has already failed with a
// non-recoverable OS/driver error (e.g. Windows has bound its own driver to
// the printer's USB interface, blocking raw access) this session. Once that
// happens, retrying WebUSB on every print click just pops the device picker
// again for no reason before falling back — so we skip straight to the
// print dialog for the rest of the tab's lifetime instead.
let usbPrintUnavailable = false;

export function isUsbPrintUnavailable(): boolean {
    return usbPrintUnavailable;
}

export function markUsbPrintUnavailable(): void {
    usbPrintUnavailable = true;
}
