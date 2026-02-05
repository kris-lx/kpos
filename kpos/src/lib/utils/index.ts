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
    // Lao Kip formatting - no decimal places as Kip is whole numbers
    const formatted = new Intl.NumberFormat('lo-LA', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
    return `₭${formatted}`;
}

/**
 * Format number as currency with custom symbol
 */
export function formatCurrencyWithSymbol(amount: number, symbol: string = '₭', decimals: number = 0): string {
    const formatted = new Intl.NumberFormat('lo-LA', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(amount);
    return `${symbol}${formatted}`;
}

/**
 * Format number with commas
 */
export function formatNumber(num: number, decimals = 0): string {
    return new Intl.NumberFormat('lo-LA', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(num);
}

/**
 * Format date in Lao locale
 */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('lo-LA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...options,
    }).format(d);
}

/**
 * Format date with time
 */
export function formatDateTime(date: Date | string): string {
    return formatDate(date, {
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Format time only
 */
export function formatTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('lo-LA', {
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
 * Validate phone number (Thai format)
 */
export function isValidThaiPhone(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, '');
    return /^0[689]\d{8}$/.test(cleaned);
}

/**
 * Format phone number
 */
export function formatPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
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
