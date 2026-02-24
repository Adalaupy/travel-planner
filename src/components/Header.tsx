
import Link from 'next/link'
import { useRouter } from 'next/router'
import styles from '../styles/header.module.css'

export const Header = () => {
  const router = useRouter()
  const isHome = router.pathname === '/'
  const isMyTrips = router.pathname === '/my-trips'

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
      </div>
    </header>
  )
}

export default Header
