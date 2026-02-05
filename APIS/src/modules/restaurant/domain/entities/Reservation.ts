// ═══════════════════════════════════════════════════════════════════════════
// Restaurant Module - Reservation Entity
// ═══════════════════════════════════════════════════════════════════════════

export enum ReservationStatus {
    PENDING = 'PENDING',
    CONFIRMED = 'CONFIRMED',
    SEATED = 'SEATED',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
    NO_SHOW = 'NO_SHOW',
}

export interface ReservationProps {
    id?: string;
    branchId: string;
    tableId?: string;
    memberId?: string;
    customerName: string;
    phone: string;
    email?: string;
    guestCount: number;
    date: Date;
    time: string;
    duration?: number;
    status?: ReservationStatus;
    note?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export class Reservation {
    public readonly id?: string;
    public readonly branchId: string;
    public readonly tableId?: string;
    public readonly memberId?: string;
    public readonly customerName: string;
    public readonly phone: string;
    public readonly email?: string;
    public readonly guestCount: number;
    public readonly date: Date;
    public readonly time: string;
    public readonly duration: number;
    public readonly status: ReservationStatus;
    public readonly note?: string;
    public readonly createdAt?: Date;
    public readonly updatedAt?: Date;

    constructor(props: ReservationProps) {
        this.id = props.id;
        this.branchId = props.branchId;
        this.tableId = props.tableId;
        this.memberId = props.memberId;
        this.customerName = props.customerName;
        this.phone = props.phone;
        this.email = props.email;
        this.guestCount = props.guestCount;
        this.date = props.date;
        this.time = props.time;
        this.duration = props.duration || 120;
        this.status = props.status || ReservationStatus.PENDING;
        this.note = props.note;
        this.createdAt = props.createdAt;
        this.updatedAt = props.updatedAt;
    }

    public isPending(): boolean {
        return this.status === ReservationStatus.PENDING;
    }

    public isConfirmed(): boolean {
        return this.status === ReservationStatus.CONFIRMED;
    }

    public canBeCancelled(): boolean {
        return [ReservationStatus.PENDING, ReservationStatus.CONFIRMED].includes(this.status);
    }
}
