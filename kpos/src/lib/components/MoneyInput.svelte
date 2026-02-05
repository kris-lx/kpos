<script lang="ts">
    import { cn } from "$lib/utils";

    interface Props {
        value: number;
        placeholder?: string;
        min?: number;
        max?: number;
        disabled?: boolean;
        required?: boolean;
        class?: string;
        onchange?: (value: number) => void;
    }

    let {
        value = $bindable(0),
        placeholder = "0",
        min = 0,
        max,
        disabled = false,
        required = false,
        class: className = "",
        onchange
    }: Props = $props();

    let displayValue = $state("");
    let inputRef: HTMLInputElement;

    // Format number with thousand separators
    function formatNumber(num: number): string {
        if (isNaN(num) || num === 0) return "";
        return num.toLocaleString("en-US");
    }

    // Parse formatted string back to number
    function parseNumber(str: string): number {
        const cleaned = str.replace(/,/g, "").replace(/[^\d.-]/g, "");
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }

    // Initialize display value
    $effect(() => {
        if (document.activeElement !== inputRef) {
            displayValue = formatNumber(value);
        }
    });

    function handleInput(e: Event) {
        const target = e.target as HTMLInputElement;
        const cursorPos = target.selectionStart || 0;
        const oldLength = displayValue.length;
        
        // Get raw value and parse
        const rawValue = target.value.replace(/,/g, "");
        const numValue = parseNumber(rawValue);
        
        // Apply min/max constraints
        let constrainedValue = numValue;
        if (min !== undefined && numValue < min) constrainedValue = min;
        if (max !== undefined && numValue > max) constrainedValue = max;
        
        // Update values
        value = constrainedValue;
        displayValue = rawValue; // Keep raw during input
        
        if (onchange) {
            onchange(constrainedValue);
        }
    }

    function handleBlur() {
        displayValue = formatNumber(value);
    }

    function handleFocus() {
        // Show raw number on focus for easier editing
        displayValue = value === 0 ? "" : value.toString();
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
    type="text"
    inputmode="numeric"
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
