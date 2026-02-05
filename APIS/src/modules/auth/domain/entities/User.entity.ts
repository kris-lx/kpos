// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - Domain Layer
// ═══════════════════════════════════════════════════════════════════════════

import { AggregateRoot } from '@/shared/domain';

export interface UserProps {
    email: string;
    password: string;
    name: string;
    role: string;
    branchId: string;
    isActive: boolean;
    lastLogin?: Date;
}

export class UserEntity extends AggregateRoot<UserProps> {
    get email(): string {
        return this.props.email;
    }

    get password(): string {
        return this.props.password;
    }

    get name(): string {
        return this.props.name;
    }

    get role(): string {
        return this.props.role;
    }

    get branchId(): string {
        return this.props.branchId;
    }

    get isActive(): boolean {
        return this.props.isActive;
    }

    get lastLogin(): Date | undefined {
        return this.props.lastLogin;
    }

    updateLastLogin(): void {
        this.props.lastLogin = new Date();
    }

    deactivate(): void {
        this.props.isActive = false;
    }

    activate(): void {
        this.props.isActive = true;
    }

    static create(props: UserProps, id?: string): UserEntity {
        return new UserEntity(props, id);
    }
}
