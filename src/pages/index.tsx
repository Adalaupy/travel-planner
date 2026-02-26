import Link from 'next/link'
import styles from '../styles/home.module.css'

export default function Home() {
    return (
        <main className={styles.main}>
            <div className={styles.hero}>
                <h1 className={styles.title}>Welcome to Travel Planner</h1>
                <p className={styles.subtitle}>
                    Plan your trips with ease. Track packing, manage expenses, organize itineraries, and more.
                </p>
                <Link href="/my-trips" className={styles.cta}>
                    Get Started →
                </Link>
            </div>
            
            <div className={styles.features}>
                <div className={styles.feature}>
                    <div className={styles.featureIcon}>📦</div>
                    <h3>Packing Lists</h3>
                    <p>Organize items by category with drag-and-drop reordering</p>
                </div>
                <div className={styles.feature}>
                    <div className={styles.featureIcon}>👥</div>
                    <h3>Travelers</h3>
                    <p>Manage trip participants with unique icons</p>
                </div>
                <div className={styles.feature}>
                    <div className={styles.featureIcon}>💰</div>
                    <h3>Expenses</h3>
                    <p>Track shared costs and calculate settlements</p>
                </div>
                <div className={styles.feature}>
                    <div className={styles.featureIcon}>🗺️</div>
                    <h3>Itinerary</h3>
                    <p>Plan day-by-day with Google Maps integration</p>
                </div>
            </div>
        </main>
    )
}
