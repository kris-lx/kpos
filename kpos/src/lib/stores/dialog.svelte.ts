// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Global Dialog Store
// Replaces native window.confirm()/window.alert() (which are blocking,
// unstyled, and inconsistent across browsers/locales) with an in-app modal.
// Call dialogStore.confirm()/alert() from anywhere — a single <GlobalDialog />
// mounted once in the root layout renders whatever's currently queued.
// ═══════════════════════════════════════════════════════════════════════════

export type DialogVariant = 'info' | 'danger' | 'success' | 'warning';

interface DialogState {
    open: boolean;
    mode: 'confirm' | 'alert' | 'prompt';
    title: string;
    message: string;
    variant: DialogVariant;
    confirmLabel: string;
    cancelLabel: string;
    inputLabel: string;
    inputPlaceholder: string;
    inputType: 'text' | 'textarea';
    initialValue: string;
    resolve: ((value: boolean | string | null) => void) | null;
}

function defaultState(): DialogState {
    return {
        open: false,
        mode: 'alert',
        title: '',
        message: '',
        variant: 'info',
        confirmLabel: 'OK',
        cancelLabel: 'Cancel',
        inputLabel: '',
        inputPlaceholder: '',
        inputType: 'text',
        initialValue: '',
        resolve: null,
    };
}

let state = $state<DialogState>(defaultState());

export interface DialogOptions {
    title?: string;
    variant?: DialogVariant;
    confirmLabel?: string;
    cancelLabel?: string;
}

export interface PromptDialogOptions extends DialogOptions {
    inputLabel?: string;
    inputPlaceholder?: string;
    inputType?: 'text' | 'textarea';
    initialValue?: string;
}

export const dialogStore = {
    get state() { return state; },

    /** Replaces window.confirm(message) — resolves true/false. */
    confirm(message: string, options: DialogOptions = {}): Promise<boolean> {
        return new Promise((resolve) => {
            state = {
                open: true,
                mode: 'confirm',
                title: options.title ?? '',
                message,
                variant: options.variant ?? 'warning',
                confirmLabel: options.confirmLabel ?? 'common.confirm',
                cancelLabel: options.cancelLabel ?? 'common.cancel',
                inputLabel: '', inputPlaceholder: '', inputType: 'text', initialValue: '',
                resolve: (value) => resolve(value === true),
            };
        });
    },

    /** Replaces window.alert(message) — resolves once dismissed. */
    alert(message: string, options: DialogOptions = {}): Promise<void> {
        return new Promise((resolve) => {
            state = {
                open: true,
                mode: 'alert',
                title: options.title ?? '',
                message,
                variant: options.variant ?? 'info',
                confirmLabel: options.confirmLabel ?? 'common.ok',
                cancelLabel: options.cancelLabel ?? 'common.cancel',
                inputLabel: '', inputPlaceholder: '', inputType: 'text', initialValue: '',
                resolve: () => resolve(),
            };
        });
    },

    /** Replaces window.prompt(message) with an accessible app dialog. */
    prompt(message: string, options: PromptDialogOptions = {}): Promise<string | null> {
        return new Promise((resolve) => {
            state = {
                open: true,
                mode: 'prompt',
                title: options.title ?? '',
                message,
                variant: options.variant ?? 'info',
                confirmLabel: options.confirmLabel ?? 'common.confirm',
                cancelLabel: options.cancelLabel ?? 'common.cancel',
                inputLabel: options.inputLabel ?? '',
                inputPlaceholder: options.inputPlaceholder ?? '',
                inputType: options.inputType ?? 'text',
                initialValue: options.initialValue ?? '',
                resolve: (value) => resolve(typeof value === 'string' ? value : null),
            };
        });
    },

    respond(value: boolean | string | null) {
        state.resolve?.(value);
        state = defaultState();
    },
};
