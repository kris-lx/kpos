import { describe, expect, it } from 'vitest';
import { pickStrictPrinter } from './printerRouting';

const printers = [
    { id: 'receipt-default', type: 'receipt', connectionType: 'network', isDefault: true, isActive: true },
    { id: 'label-usb', type: 'label', connectionType: 'usb', isDefault: true, isActive: true },
    { id: 'label-network', type: 'label', connectionType: 'network', isActive: true },
    { id: 'label-disabled', type: 'label', connectionType: 'network', isDefault: true, isActive: false },
];

describe('pickStrictPrinter', () => {
    it('never falls back across receipt and label printer types', () => {
        expect(pickStrictPrinter(printers, 'label', 'network')?.id).toBe('label-network');
        expect(pickStrictPrinter(printers, 'receipt', 'usb')).toBeNull();
    });

    it('prefers an active default within the requested type and connection', () => {
        expect(pickStrictPrinter(printers, 'receipt', 'network')?.id).toBe('receipt-default');
        expect(pickStrictPrinter(printers, 'label', 'usb')?.id).toBe('label-usb');
    });
});
