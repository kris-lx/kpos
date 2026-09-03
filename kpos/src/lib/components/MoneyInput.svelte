<script lang="ts">
    import { cn } from "$lib/utils";

    interface Props {
        id?: string;
        value: number;
        placeholder?: string;
        min?: number;
        max?: number;
        disabled?: boolean;
        required?: boolean;
        class?: string;
        "aria-label"?: string;
        onchange?: (value: number) => void;
    }

    let {
        id,
        value = $bindable(0),
        placeholder = "0.00",
        min = 0,
        max,
        disabled = false,
        required = false,
        class: className = "",
        "aria-label": ariaLabel,
        onchange
    }: Props = $props();

    let displayValue = $state("");
    let inputRef: HTMLInputElement;

    // xxx,xxx,xxx.xx — thousand separators, always exactly 2 decimal places.
    function formatNumber(num: number): string {
        if (isNaN(num)) return "";
        return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function parseNumber(str: string): number {
        const cleaned = str.replace(/,/g, "").replace(/[^\d.-]/g, "");
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }

    // Live-format while typing: reinsert thousand separators on every
    // keystroke (not just on blur) per the "xxx,xxx,xxx.xx while entering
    // the amount" requirement — cursor position is recomputed from the
    // digit count before it so inserting/removing commas doesn't jump the
    // caret to the end.
    function formatRawInput(raw: string): string {
        // Keep at most one decimal point and up to 2 decimal digits while typing.
        let cleaned = raw.replace(/[^\d.]/g, "");
        const firstDot = cleaned.indexOf(".");
        if (firstDot !== -1) {
            cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
        }
        const [intPart, decPart] = cleaned.split(".");
        const intFormatted = intPart ? Number(intPart).toLocaleString("en-US") : "";
        if (decPart !== undefined) return `${intFormatted}.${decPart}`;
        return cleaned.endsWith(".") ? `${intFormatted}.` : intFormatted;
    }

    $effect(() => {
        if (document.activeElement !== inputRef) {
            displayValue = formatNumber(value);
        }
    });

    function digitsBefore(str: string, pos: number): number {
        return str.slice(0, pos).replace(/[^\d.]/g, "").length;
    }

    function positionAtDigitCount(str: string, digitCount: number): number {
        let count = 0;
        for (let i = 0; i < str.length; i++) {
            if (/[\d.]/.test(str[i])) count++;
            if (count >= digitCount) return i + 1;
        }
        return str.length;
    }

    function handleInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const cursorPos = target.selectionStart ?? target.value.length;
        const digitCountBeforeCursor = digitsBefore(target.value, cursorPos);

        const formatted = formatRawInput(target.value);
        const numValue = parseNumber(formatted);

        let constrainedValue = numValue;
        if (min !== undefined && numValue < min) constrainedValue = min;
        if (max !== undefined && numValue > max) constrainedValue = max;

        value = constrainedValue;
        displayValue = formatted;

        requestAnimationFrame(() => {
            if (inputRef) {
                const newPos = positionAtDigitCount(formatted, digitCountBeforeCursor);
                inputRef.setSelectionRange(newPos, newPos);
            }
        });

        if (onchange) {
            onchange(constrainedValue);
        }
    }

    function handleBlur() {
        displayValue = formatNumber(value);
    }

    function handleFocus() {
        // Keep the formatted value on focus too (xxx,xxx,xxx.xx at all times)
        // — only clear when the value is genuinely zero, matching the old
        // "empty means 0" placeholder behavior.
        displayValue = value === 0 ? "" : formatNumber(value);
    }

    function handleKeyDown(e: KeyboardEvent) {
        // Allow: backspace, delete, tab, escape, enter, decimal point
        if ([8, 9, 27, 13, 46, 110, 190].includes(e.keyCode) ||
            // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
            (e.keyCode >= 65 && e.keyCode <= 90 && (e.ctrlKey || e.metaKey)) ||
            // Allow: home, end, left, right
            (e.keyCode >= 35 && e.keyCode <= 39)) {
            return;
        }
        // Ensure that it is a number and stop the keypress if not
        if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
            e.preventDefault();
        }
    }
</script>

<input
    bind:this={inputRef}
    {id}
    type="text"
    inputmode="decimal"
    aria-label={ariaLabel}
    {placeholder}
    {disabled}
    {required}
    value={displayValue}
    oninput={handleInput}
    onblur={handleBlur}
    onfocus={handleFocus}
    onkeydown={handleKeyDown}
    class={cn(
        "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-right tabular-nums",
        "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
    )}
/>
