export type UserIdentity = {
        user_id?: string | null;
        username: string;
        birthday?: string | null;
        gender?: string | null;
        short_code?: string | null;
        issync?: boolean;
};

const STORAGE_KEY = 'travel_planner_user';
const LEGACY_KEY = 'travel_planner_username';

export function isBrowser(): boolean {
        return typeof window !== 'undefined';
}

export function getLocalUserIdentity(): UserIdentity | null {
        if (!isBrowser()) return null;
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;

        try {
                const parsed = JSON.parse(raw) as UserIdentity;
                if (!parsed.username) return null;
                if (!parsed.short_code && (!parsed.birthday || !parsed.gender)) return null;
                return parsed;
        } catch {
                return null;
        }
}

export function setLocalUserIdentity(identity: UserIdentity): void {
        if (!isBrowser()) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
        if (identity.username) {
                localStorage.setItem(LEGACY_KEY, identity.username);
        }
}

export function clearLocalUserIdentity(): void {
        if (!isBrowser()) return;
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_KEY);
}

export function getLegacyUsername(): string | null {
        if (!isBrowser()) return null;
        return localStorage.getItem(LEGACY_KEY);
}

export function isLocalUserId(userId?: string | null): boolean {
        return !!userId && userId.startsWith('local-');
}

export function generateLocalUserId(): string {
        const rand = Math.random().toString(36).slice(2, 8);
        return `local-${Date.now()}-${rand}`;
}

export function generateShortCode(length: number = 5): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let out = '';
        for (let i = 0; i < length; i += 1) {
                out += chars[Math.floor(Math.random() * chars.length)];
        }
        return out;
}

export function normalizeShortCode(value?: string | null): string | null {
        if (!value) return null;
        return value.trim().toUpperCase();
}
