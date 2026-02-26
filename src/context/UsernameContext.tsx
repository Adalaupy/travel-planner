import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import {
    UserIdentity,
    clearLocalUserIdentity,
    generateLocalUserId,
    getLegacyUsername,
    getLocalUserIdentity,
    isBrowser,
    isLocalUserId,
    normalizeShortCode,
    setLocalUserIdentity,
} from '../lib/userIdentity';

const USERNAME_REGEX = /^[A-Za-z0-9]+$/;

interface UsernameContextType {
    username: string | null;
    userId: string | null;
    birthday: string | null;
    gender: string | null;
    shortCode: string | null;
    isLoading: boolean;
    error: string | null;
    checkIdentityAvailable: (username: string, birthday: string, gender: string, shortCode: string) => Promise<boolean>;
    checkUsernameExists: (username: string) => Promise<boolean>;
    login: (username: string, birthday: string, gender: string, shortCode: string) => Promise<void>;
    signup: (username: string, birthday: string, gender: string, shortCode: string) => Promise<void>;
    setIdentity: (username: string, birthday: string, gender: string, shortCode: string) => Promise<void>;
    loadIdentity: () => Promise<void>;
    clearIdentity: () => void;
    logout: () => void;
}

const UsernameContext = createContext<UsernameContextType | undefined>(undefined);

async function upsertUserIdentity(identity: UserIdentity): Promise<UserIdentity> {
    const { username, birthday, gender } = identity;
    const normalizedShortCode = normalizeShortCode(identity.short_code);
    const hasBirthdayGender = !!birthday && !!gender;

    if (normalizedShortCode) {
        const { data: existingByCode, error: fetchByCodeError } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('short_code', normalizedShortCode)
            .maybeSingle();

        if (fetchByCodeError) {
            throw fetchByCodeError;
        }

        if (existingByCode) {
            return {
                ...identity,
                user_id: existingByCode.user_id ?? existingByCode.id,
                birthday: existingByCode.birthday ?? birthday ?? null,
                gender: existingByCode.gender ?? gender ?? null,
                short_code: existingByCode.short_code ?? normalizedShortCode,
                issync: true,
            };
        }
    }

    if (hasBirthdayGender) {
        const { data: existing, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('birthday', birthday)
            .eq('gender', gender)
            .maybeSingle();

        if (fetchError) {
            throw fetchError;
        }

        if (existing) {
            return {
                ...identity,
                user_id: existing.user_id ?? existing.id,
                short_code: existing.short_code ?? normalizedShortCode ?? null,
                issync: true,
            };
        }
    }

    if (!hasBirthdayGender) {
        throw new Error('Birthday and gender are required to create a new user');
    }

    const { data: created, error: insertError } = await supabase
        .from('users')
        .insert([
            {
                username,
                birthday,
                gender,
                short_code: normalizedShortCode ?? null,
            },
        ])
        .select()
        .single();

    if (insertError) {
        throw insertError;
    }

    return {
        ...identity,
        user_id: created.user_id ?? created.id,
        short_code: created.short_code ?? normalizedShortCode ?? null,
        issync: true,
    };
}

export const UsernameProvider = ({ children }: { children: ReactNode }) => {
    const [username, setUsernameState] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [birthday, setBirthday] = useState<string | null>(null);
    const [gender, setGender] = useState<string | null>(null);
    const [shortCode, setShortCode] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const saveIdentityToState = (identity: UserIdentity | null) => {
        setUsernameState(identity?.username ?? null);
        setUserId(identity?.user_id ?? null);
        setBirthday(identity?.birthday ?? null);
        setGender(identity?.gender ?? null);
        setShortCode(identity?.short_code ?? null);
    };

    const validateIdentity = (inputUsername: string, inputBirthday: string, inputGender: string, inputShortCode: string): string | null => {
        if (!inputUsername || inputUsername.trim().length < 3) {
            return 'Username must be at least 3 characters';
        }
        if (!USERNAME_REGEX.test(inputUsername.trim())) {
            return 'Username must contain only letters and numbers';
        }

        const normalizedShortCode = normalizeShortCode(inputShortCode);
        if (normalizedShortCode) {
            if (!/^[A-Z0-9]{4,6}$/.test(normalizedShortCode)) {
                return 'Short code must be 4-6 letters or numbers';
            }
            return null;
        }

        if (!inputBirthday) {
            return 'Please select your birthday';
        }
        if (!inputGender) {
            return 'Please select your gender';
        }
        return null;
    };

    const checkUsernameExists = async (inputUsername: string): Promise<boolean> => {
        if (!inputUsername || inputUsername.trim().length < 3) {
            return false;
        }
        if (!USERNAME_REGEX.test(inputUsername.trim())) {
            return false;
        }

        try {
            const { data, error: queryError } = await supabase
                .from('users')
                .select('username')
                .eq('username', inputUsername.trim())
                .limit(1);

            if (queryError) {
                throw queryError;
            }

            return !!data && data.length > 0;
        } catch (err) {
            console.error('Error checking if username exists:', err);
            return false;
        }
    };

    const checkIdentityAvailable = async (
        inputUsername: string,
        inputBirthday: string,
        inputGender: string,
        inputShortCode: string,
    ): Promise<boolean> => {
        const validationError = validateIdentity(inputUsername, inputBirthday, inputGender, inputShortCode);
        if (validationError) {
            setError(validationError);
            return false;
        }

        const normalizedShortCode = normalizeShortCode(inputShortCode);

        try {
            const query = supabase
                .from('users')
                .select('user_id')
                .eq('username', inputUsername.trim());

            const { data, error: queryError } = normalizedShortCode
                ? await query.eq('short_code', normalizedShortCode).maybeSingle()
                : await query.eq('birthday', inputBirthday).eq('gender', inputGender).maybeSingle();

            if (queryError) {
                throw queryError;
            }

            return !data;
        } catch (err) {
            console.error('Error checking identity availability:', err);
            setError('Failed to check username availability');
            return false;
        }
    };

    const loadIdentity = async () => {
        try {
            setIsLoading(true);
            setError(null);

            if (!isBrowser()) {
                setIsLoading(false);
                return;
            }

            const stored = getLocalUserIdentity();
            if (!stored) {
                const legacy = getLegacyUsername();
                if (legacy) {
                    clearLocalUserIdentity();
                }
                saveIdentityToState(null);
                return;
            }

            saveIdentityToState(stored);

            if (!navigator.onLine) {
                return;
            }

            const synced = await upsertUserIdentity(stored);
            setLocalUserIdentity(synced);
            saveIdentityToState(synced);

            if (isLocalUserId(stored.user_id)) {
                await db.users.where('user_id').equals(stored.user_id ?? '').modify({
                    user_id: synced.user_id,
                    issync: true,
                    username: synced.username,
                    birthday: synced.birthday ?? null,
                    gender: synced.gender ?? null,
                    short_code: synced.short_code ?? null,
                });

                await db.trips
                    .filter((t) => t.owner_id === stored.user_id)
                    .modify({ owner_id: synced.user_id });
            }
        } catch (err) {
            console.error('Error loading identity:', err);
            setError('Failed to load username');
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (inputUsername: string, inputBirthday: string, inputGender: string, inputShortCode: string) => {
        try {
            setError(null);
            setIsLoading(true);

            const validationError = validateIdentity(inputUsername, inputBirthday, inputGender, inputShortCode);
            if (validationError) {
                setError(validationError);
                throw new Error(validationError);
            }

            const normalizedUsername = inputUsername.trim();
            const normalizedShortCode = normalizeShortCode(inputShortCode);

            if (!navigator.onLine) {
                throw new Error('Cannot login while offline. Please check your internet connection.');
            }

            // Try to find existing user with these credentials
            const query = supabase
                .from('users')
                .select('*')
                .eq('username', normalizedUsername);

            const { data: existing, error: fetchError } = normalizedShortCode
                ? await query.eq('short_code', normalizedShortCode).maybeSingle()
                : await query.eq('birthday', inputBirthday).eq('gender', inputGender).maybeSingle();

            if (fetchError) {
                throw fetchError;
            }

            if (!existing) {
                throw new Error('Invalid credentials. Please check your short code or birthday/gender and try again.');
            }

            const resolved: UserIdentity = {
                user_id: existing.user_id ?? existing.id,
                username: existing.username,
                birthday: existing.birthday ?? null,
                gender: existing.gender ?? null,
                short_code: existing.short_code ?? null,
                issync: true,
            };

            await db.users.add({
                user_id: resolved.user_id ?? null,
                issync: true,
                username: resolved.username,
                birthday: resolved.birthday ?? null,
                gender: resolved.gender ?? null,
                short_code: resolved.short_code ?? null,
            });

            setLocalUserIdentity(resolved);
            saveIdentityToState(resolved);
        } catch (err) {
            console.error('Error logging in:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to log in';
            setError(errorMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const signup = async (inputUsername: string, inputBirthday: string, inputGender: string, inputShortCode: string) => {
        try {
            setError(null);
            setIsLoading(true);

            const validationError = validateIdentity(inputUsername, inputBirthday, inputGender, inputShortCode);
            if (validationError) {
                setError(validationError);
                throw new Error(validationError);
            }

            const normalizedUsername = inputUsername.trim();
            const normalizedShortCode = normalizeShortCode(inputShortCode);

            if (!navigator.onLine) {
                const localUser: UserIdentity = {
                    user_id: generateLocalUserId(),
                    username: normalizedUsername,
                    birthday: inputBirthday || null,
                    gender: inputGender || null,
                    short_code: normalizedShortCode,
                    issync: false,
                };

                await db.users.add({
                    user_id: localUser.user_id ?? null,
                    issync: false,
                    username: localUser.username,
                    birthday: localUser.birthday ?? null,
                    gender: localUser.gender ?? null,
                    short_code: localUser.short_code ?? null,
                });

                setLocalUserIdentity(localUser);
                saveIdentityToState(localUser);
                return;
            }

            const resolved = await upsertUserIdentity({
                user_id: null,
                username: normalizedUsername,
                birthday: inputBirthday || null,
                gender: inputGender || null,
                short_code: normalizedShortCode,
                issync: true,
            });

            await db.users.add({
                user_id: resolved.user_id ?? null,
                issync: true,
                username: resolved.username,
                birthday: resolved.birthday ?? null,
                gender: resolved.gender ?? null,
                short_code: resolved.short_code ?? null,
            });

            setLocalUserIdentity(resolved);
            saveIdentityToState(resolved);
        } catch (err) {
            console.error('Error signing up:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to sign up';
            setError(errorMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const setIdentity = async (inputUsername: string, inputBirthday: string, inputGender: string, inputShortCode: string) => {
        try {
            setError(null);
            setIsLoading(true);

            const validationError = validateIdentity(inputUsername, inputBirthday, inputGender, inputShortCode);
            if (validationError) {
                setError(validationError);
                return;
            }

            const normalizedUsername = inputUsername.trim();
            const normalizedShortCode = normalizeShortCode(inputShortCode);

            if (!navigator.onLine) {
                const localUser: UserIdentity = {
                    user_id: generateLocalUserId(),
                    username: normalizedUsername,
                    birthday: inputBirthday || null,
                    gender: inputGender || null,
                    short_code: normalizedShortCode,
                    issync: false,
                };

                await db.users.add({
                    user_id: localUser.user_id ?? null,
                    issync: false,
                    username: localUser.username,
                    birthday: localUser.birthday ?? null,
                    gender: localUser.gender ?? null,
                    short_code: localUser.short_code ?? null,
                });

                setLocalUserIdentity(localUser);
                saveIdentityToState(localUser);
                return;
            }

            const resolved = await upsertUserIdentity({
                user_id: null,
                username: normalizedUsername,
                birthday: inputBirthday || null,
                gender: inputGender || null,
                short_code: normalizedShortCode,
                issync: true,
            });

            await db.users.add({
                user_id: resolved.user_id ?? null,
                issync: true,
                username: resolved.username,
                birthday: resolved.birthday ?? null,
                gender: resolved.gender ?? null,
                short_code: resolved.short_code ?? null,
            });

            setLocalUserIdentity(resolved);
            saveIdentityToState(resolved);
        } catch (err) {
            console.error('Error setting identity:', err);
            setError(err instanceof Error ? err.message : 'Failed to set username');
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const clearIdentity = () => {
        clearLocalUserIdentity();
        saveIdentityToState(null);
        setError(null);
    };

    const logout = () => {
        clearIdentity();
    };

    useEffect(() => {
        loadIdentity();
    }, []);

    return (
        <UsernameContext.Provider
            value={{
                username,
                userId,
                birthday,
                gender,
                shortCode,
                isLoading,
                error,
                checkIdentityAvailable,
                checkUsernameExists,
                login,
                signup,
                setIdentity,
                loadIdentity,
                clearIdentity,
                logout,
            }}
        >
            {children}
        </UsernameContext.Provider>
    );
};

export const useUsername = () => {
    const context = useContext(UsernameContext);
    if (!context) {
        throw new Error('useUsername must be used within UsernameProvider');
    }
    return context;
};
