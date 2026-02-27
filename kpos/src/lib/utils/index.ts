// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with conflict resolution
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}

/**
 * Format number as Lao Kip currency (₭)
 */
export function formatCurrency(amount: number): string {
    if (amount == null || isNaN(amount)) return '₭0.00';
    const formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
    return `₭${formatted}`;
}

/**
 * Format number as currency with custom symbol
 */
export function formatCurrencyWithSymbol(amount: number | null | undefined, symbol: string = '₭', decimals: number = 0): string {
    if (amount == null || isNaN(Number(amount))) return `${symbol}0`;
    const formatted = new Intl.NumberFormat('lo-LA', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(Number(amount));
    return `${symbol}${formatted}`;
}

/**
 * Format number with commas
 */
export function formatNumber(num: number | null | undefined, decimals = 0): string {
    if (num === null || num === undefined || isNaN(Number(num))) return '0';
    return new Intl.NumberFormat('lo-LA', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(Number(num));
}

// Map app locale codes to BCP47 tags
const LOCALE_BCP47: Record<string, string> = {
    lo: 'lo-LA',
    th: 'th-TH',
    zh: 'zh-CN',
    ja: 'ja-JP',
    en: 'en-US',
};

/**
 * Get BCP47 locale string from app locale code
 */
export function getDateLocale(locale?: string): string {
    if (!locale) {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('kpos_locale');
            if (stored && LOCALE_BCP47[stored]) return LOCALE_BCP47[stored];
        }
        return 'lo-LA';
    }
    return LOCALE_BCP47[locale] || 'lo-LA';
}

/**
 * Format date respecting current app locale (lo/th/zh/ja/en)
 */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions, locale?: string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat(getDateLocale(locale), {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...options,
    }).format(d);
}

/**
 * Format date with time respecting current app locale
 */
export function formatDateTime(date: Date | string, locale?: string): string {
    return formatDate(date, {
        hour: '2-digit',
        minute: '2-digit',
    }, locale);
}

/**
 * Format time only
 */
export function formatTime(date: Date | string, locale?: string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat(getDateLocale(locale), {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(d);
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
    fn: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle = false;
    return (...args: Parameters<T>) => {
        if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

/**
 * Generate unique ID
 */
export function generateId(prefix = ''): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

/**
 * Parse barcode/QR code
 */
export function parseBarcode(code: string): { type: string; value: string } {
    // EAN-13
    if (/^\d{13}$/.test(code)) {
        return { type: 'EAN13', value: code };
    }
    // EAN-8
    if (/^\d{8}$/.test(code)) {
        return { type: 'EAN8', value: code };
    }
    // UPC-A
    if (/^\d{12}$/.test(code)) {
        return { type: 'UPCA', value: code };
    }
    // Generic code
    return { type: 'CODE', value: code };
}

/**
 * Validate phone number (Lao format: 20xxxxxxxx, 10 digits total)
 */
export function isValidLaoPhone(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, '');
    return /^20\d{8}$/.test(cleaned);
}

/**
 * Validate phone number (Thai format)
 */
export function isValidThaiPhone(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, '');
    return /^0[689]\d{8}$/.test(cleaned);
}

/**
 * Format phone number (Lao: 20xx xxx xxxx)
 */
export function formatPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10 && cleaned.startsWith('20')) {
        return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
    }
    if (cleaned.length === 10) {
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
}

/**
 * Format money input: xxx,xxx,xxx.xx
 */
export function formatMoneyInput(value: string | number): string {
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Parse money input back to number
 */
export function parseMoneyInput(value: string): number {
    return parseFloat(value.replace(/,/g, '')) || 0;
}

/**
 * Enforce phone input: only digits, max 10, must start with 20
 */
export function enforcePhoneInput(value: string): string {
    return value.replace(/\D/g, '').slice(0, 10);
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safe JSON parse
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
    try {
        return JSON.parse(json) as T;
    } catch {
        return fallback;
    }
}

/**
 * Truncate text
 */
export function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Generate receipt number
 */
export function generateReceiptNumber(branchCode: string): string {
    const date = new Date();
    const yy = date.getFullYear().toString().slice(-2);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${branchCode}${yy}${mm}${dd}${random}`;
}
