// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Value Objects
// ═══════════════════════════════════════════════════════════════════════════

import { ValueObject } from '@/shared/domain';

interface EmailProps {
    value: string;
}

export class Email extends ValueObject<EmailProps> {
    get value(): string {
        return this.props.value;
    }

    private static isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    public static create(email: string): Email {
        if (!email || !this.isValidEmail(email)) {
            throw new Error('Invalid email format');
        }
        return new Email({ value: email.toLowerCase() });
    }
}

interface PasswordProps {
    value: string;
    hashed: boolean;
}

export class Password extends ValueObject<PasswordProps> {
    get value(): string {
        return this.props.value;
    }

    get isHashed(): boolean {
        return this.props.hashed;
    }

    private static isValidPassword(password: string): boolean {
        return password.length >= 8;
    }

    public static create(password: string, hashed = false): Password {
        if (!hashed && !this.isValidPassword(password)) {
            throw new Error('Password must be at least 8 characters');
        }
        return new Password({ value: password, hashed });
    }
}
