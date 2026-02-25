
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useUsername } from '../context/UsernameContext'
import styles from '../styles/header.module.css'

export const Header = () => {
  const router = useRouter()
  const { username, logout } = useUsername()
  const isHome = router.pathname === '/'
  const isMyTrips = router.pathname === '/my-trips'

  const handleLogout = () => {
    logout()
    router.push('/')
  }

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
            <button onClick={handleLogout} className={styles.logoutBtn}>
              Logout
            </button>
          </div>
        )}

      </div>
    </header>
  )
}

export default Header
