import React, { useState } from 'react';
import { useUsername } from '../context/UsernameContext';
import styles from '../styles/modal.module.css';

const USERNAME_REGEX = /^[A-Za-z0-9]+$/;

type ModalMode = 'username' | 'login' | 'signup';

export const UsernameModal = () => {
  const { username, login, signup, checkUsernameExists, isLoading, error } = useUsername();
  const [mode, setMode] = useState<ModalMode>('username');
  const [inputValue, setInputValue] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [birthday, setBirthday] = useState('');
  const [gender, setGender] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  if (username) {
    return null; // Don't show modal if username is set
  }

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!inputValue.trim()) {
      setLocalError('Please enter a username');
      return;
    }

    if (inputValue.trim().length < 3) {
      setLocalError('Username must be at least 3 characters');
      return;
    }

    if (!USERNAME_REGEX.test(inputValue.trim())) {
      setLocalError('Username must contain only letters and numbers');
      return;
    }

    try {
      const exists = await checkUsernameExists(inputValue.trim());
      if (exists) {
        setMode('login');
      } else {
        setMode('signup');
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to check username');
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const normalizedShortCode = shortCode.trim().toUpperCase();
    if (normalizedShortCode) {
      if (!/^[A-Z0-9]{4,6}$/.test(normalizedShortCode)) {
        setLocalError('Short code must be 4-6 letters or numbers');
        return;
      }
    } else {
      if (!birthday) {
        setLocalError('Please select your birthday');
        return;
      }

      if (!gender) {
        setLocalError('Please select your gender');
        return;
      }
    }

    try {
      if (mode === 'login') {
        await login(inputValue.trim(), birthday, gender, normalizedShortCode);
      } else {
        await signup(inputValue.trim(), birthday, gender, normalizedShortCode);
      }
      // Reset form on success
      setInputValue('');
      setShortCode('');
      setBirthday('');
      setGender('');
      setMode('username');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to authenticate');
    }
  };

  const handleBack = () => {
    setMode('username');
    setShortCode('');
    setBirthday('');
    setGender('');
    setLocalError(null);
  };

  const handleClearAndRetry = () => {
    setShortCode('');
    setBirthday('');
    setGender('');
    setLocalError(null);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {mode === 'username' && (
          <>
            <h2 className={styles.title}>Welcome to Travel Planner!</h2>
            <p className={styles.description}>
              Enter your username to continue.
            </p>

            <form onSubmit={handleUsernameSubmit} className={styles.form}>
              <div className={styles.inputGroup}>
                <input
                  type="text"
                  placeholder="Username (letters and numbers only)"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  disabled={isLoading}
                  className={styles.input}
                  maxLength={32}
                  autoFocus
                />
              </div>

              {(error || localError) && (
                <div className={styles.errorMessage}>
                  {error || localError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className={styles.submitBtn}
              >
                {isLoading ? 'Checking...' : 'Continue'}
              </button>
            </form>
          </>
        )}

        {mode === 'login' && (
          <>
            <h2 className={styles.title}>Welcome back, {inputValue}!</h2>
            <p className={styles.description}>
              Please enter your short code OR birthday + gender to log in.
            </p>

            <form onSubmit={handleAuthSubmit} className={styles.form}>
              <div className={styles.inputGroup}>
                <input
                  type="text"
                  placeholder="Short code (optional, 4-6 letters/numbers)"
                  value={shortCode}
                  onChange={(e) => setShortCode(e.target.value)}
                  disabled={isLoading}
                  className={styles.input}
                  maxLength={6}
                  autoFocus
                />
                <input
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  disabled={isLoading}
                  className={styles.input}
                />
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  disabled={isLoading}
                  className={styles.input}
                >
                  <option value="">Select gender</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="nonbinary">Non-binary</option>
                  <option value="prefer_not">Prefer not to say</option>
                </select>
              </div>

              {(error || localError) && (
                <div className={styles.errorMessage}>
                  {error || localError}
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={handleClearAndRetry}
                      className={styles.retryBtn}
                    >
                      Clear and try again
                    </button>
                  )}
                </div>
              )}

              <div className={styles.buttonGroup}>
                <button
                  type="button"
                  onClick={handleBack}
                  className={styles.backBtn}
                  disabled={isLoading}
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={styles.submitBtn}
                >
                  {isLoading ? 'Logging in...' : 'Log In'}
                </button>
              </div>
            </form>

            <p className={styles.hint}>
              💡 Use short code if you have it. If not, birthday + gender will work.
            </p>
          </>
        )}

        {mode === 'signup' && (
          <>
            <h2 className={styles.title}>Create Account</h2>
            <p className={styles.description}>
              Username "{inputValue}" is available! Please fill in your details to sign up.
            </p>

            <form onSubmit={handleAuthSubmit} className={styles.form}>
              <div className={styles.inputGroup}>
                <input
                  type="text"
                  placeholder="Short code (optional, 4-6 letters/numbers)"
                  value={shortCode}
                  onChange={(e) => setShortCode(e.target.value)}
                  disabled={isLoading}
                  className={styles.input}
                  maxLength={6}
                  autoFocus
                />
                <input
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  disabled={isLoading}
                  className={styles.input}
                  placeholder="Birthday"
                />
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  disabled={isLoading}
                  className={styles.input}
                >
                  <option value="">Select gender *</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="nonbinary">Non-binary</option>
                  <option value="prefer_not">Prefer not to say</option>
                </select>
              </div>

              {(error || localError) && (
                <div className={styles.errorMessage}>
                  {error || localError}
                </div>
              )}

              <div className={styles.buttonGroup}>
                <button
                  type="button"
                  onClick={handleBack}
                  className={styles.backBtn}
                  disabled={isLoading}
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={styles.submitBtn}
                >
                  {isLoading ? 'Creating account...' : 'Sign Up'}
                </button>
              </div>
            </form>

            <p className={styles.hint}>
              💡 Birthday + gender are required. Short code is optional but helps for easier login.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default UsernameModal;
