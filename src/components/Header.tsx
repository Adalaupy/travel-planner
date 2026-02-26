
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { useUsername } from '../context/UsernameContext'
import styles from '../styles/header.module.css'

export const Header = () => {
    const router = useRouter()
    const { username, logout } = useUsername()
    const isHome = router.pathname === '/'
    const isMyTrips = router.pathname === '/my-trips'
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

    const handleLogout = () => {
        setShowLogoutConfirm(false)
        logout()
        router.push('/')
    }

    const handleOpenLogoutConfirm = () => setShowLogoutConfirm(true)
    const handleCloseLogoutConfirm = () => setShowLogoutConfirm(false)

    return (
        <header className={styles.header}>
            <div className={styles.container}>
                <Link href="/" className={styles.logo}>
                    ✈️ Travel Planner
                </Link>
                <nav className={styles.nav}>
                    <Link href="/" className={isHome ? styles.navLinkActive : styles.navLink}>
                        Home
                    </Link>
                    <Link href="/my-trips" className={isMyTrips ? styles.navLinkActive : styles.navLink}>
                        My Trips
                    </Link>
                </nav>
                {username && (
                    <div className={styles.userGreeting}>
                        👋 Hello, <span className={styles.username}>{username}</span>!
                        <button onClick={handleOpenLogoutConfirm} className={styles.logoutBtn}>
                            Logout
                        </button>
                    </div>
                )}

            </div>
            {showLogoutConfirm && (
                <div className={styles.modalOverlay} role="presentation" onClick={handleCloseLogoutConfirm}>
                    <div
                        className={styles.modal}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="logout-confirm-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 id="logout-confirm-title" className={styles.modalTitle}>
                            Log out?
                        </h3>
                        <p className={styles.modalText}>
                            You will be signed out and redirected to the home page.
                        </p>
                        <div className={styles.modalActions}>
                            <button className={styles.modalCancelBtn} onClick={handleCloseLogoutConfirm}>
                                Cancel
                            </button>
                            <button className={styles.modalConfirmBtn} onClick={handleLogout}>
                                Log out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </header>
    )
}

export default Header
