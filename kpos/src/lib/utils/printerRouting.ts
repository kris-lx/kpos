export type PrinterDocumentType = 'receipt' | 'label';
export type PrinterConnectionType = 'network' | 'usb' | 'serial' | 'bluetooth' | 'windowsPrint';

export interface PrinterCandidate {
    id: string;
    type?: string;
    connectionType?: string;
    isDefault?: boolean;
    isActive?: boolean;
}

/**
 * Printer routing must never cross document types. A default kitchen or
 * receipt printer is not a valid fallback for barcode labels, and vice versa.
 */
export function pickStrictPrinter<T extends PrinterCandidate>(
    printers: T[],
    documentType: PrinterDocumentType,
    connectionType?: PrinterConnectionType,
): T | null {
    const candidates = printers.filter((printer) =>
        printer.isActive !== false
        && printer.type === documentType
        && (!connectionType || printer.connectionType === connectionType),
    );
    return candidates.find((printer) => printer.isDefault) || candidates[0] || null;
}

export function createPrintIdempotencyKey(prefix: string): string {
    const random = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}:${random}`;
}
