// EMVco Merchant-Presented QR Code payload — used for "scan to pay" QR codes
// (a customer's banking app scans this and it pre-fills the merchant account,
// amount, and currency). Extracted from documents/design/+page.svelte so the
// receipt designer preview and the live printed receipt encode identically.

// EMVco TLV (Tag-Length-Value) encoding
function encodeTLV(tag: string, value: string): string {
    const length = value.length.toString(16).padStart(2, '0').toUpperCase();
    return tag + length + value;
}

// CRC16-CCITT calculation for EMVco
function calculateCRC16(data: string): string {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    return (crc & 0xFFFF).toString(16).padStart(4, '0').toUpperCase();
}

export interface EMVcoPayloadInput {
    merchantAccount?: string;
    amount?: number;
    currency?: string;
    transactionId?: string;
    countryCode?: string;
}

// Generate an EMVco-compliant QR code payload string.
export function generateEMVcoPayload(data: EMVcoPayloadInput): string {
    // Payload Format Indicator (ID 00)
    const payloadFormat = encodeTLV('00', '01');

    // Point of Initiation Method (ID 01) - 11 = Static, 12 = Dynamic
    const poiMethod = encodeTLV('01', '12');

    // Merchant Account Information (ID 26-51)
    const merchantInfo = encodeTLV('26', data.merchantAccount || '00020101021226580016TH.PROMPTPAY011511234567890352034005802TH530376454541612.34545802TH5910TEST STORE6007BANGKOK6304');

    // Transaction Currency (ID 53)
    const currCode = data.currency || '418';
    const currency = encodeTLV('53', currCode);

    // Transaction Amount (ID 54)
    const amount = data.amount ? encodeTLV('54', data.amount.toFixed(2)) : '';

    // Tip or Convenience Fee Indicator (ID 55)
    const tipIndicator = encodeTLV('55', '02');

    // Transaction Currency (ID 56) — same as main currency
    const tipCurrency = encodeTLV('56', currCode);

    // Tip or Convenience Fee Amount (ID 57)
    const tipAmount = encodeTLV('57', '0.00');

    // Country Code (ID 58)
    const countryCode = encodeTLV('58', data.countryCode || 'LA');

    // Merchant Name (ID 59)
    const merchantName = encodeTLV('59', data.merchantAccount?.split(':')[0] || 'STORE');

    // Merchant City (ID 60) — generic placeholder
    const merchantCity = encodeTLV('60', 'VIENTIANE');

    // Postal Code (ID 61)
    const postalCode = encodeTLV('61', '01000');

    // Additional Data Field Template (ID 62)
    const additionalData = encodeTLV('62', data.transactionId ? encodeTLV('05', data.transactionId) : '');

    // CRC (ID 63) - CRC16-CCITT
    const payloadWithoutCrc = payloadFormat + poiMethod + merchantInfo + currency + amount + tipIndicator + tipCurrency + tipAmount + countryCode + merchantName + merchantCity + postalCode + additionalData;
    const crc = calculateCRC16(payloadWithoutCrc);
    const crcField = encodeTLV('63', crc);

    return payloadWithoutCrc + crcField;
}
