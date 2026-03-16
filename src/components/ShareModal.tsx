import { useState, useEffect } from 'react'
import { shareTrip, unshareTrip, getSharedUsers } from '../lib/syncService'
import styles from '../styles/components.module.css'

type Props = {
    tripId: string | number | null
    isOpen: boolean
    onClose: () => void
    onSuccess?: () => void
}

export const ShareModal = ({ tripId, isOpen, onClose, onSuccess }: Props) => {
    const [username, setUsername] = useState('')
    const [sharedUsers, setSharedUsers] = useState<Array<{ user_id: string; username?: string }>>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    useEffect(() => {
        if (isOpen) {
            loadSharedUsers()
        }
    }, [isOpen, tripId])

    const loadSharedUsers = async () => {
        setLoading(true)
        const users = await getSharedUsers(tripId)
        setSharedUsers(users)
        setLoading(false)
    }

    const handleShare = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)
        setLoading(true)

        const result = await shareTrip(tripId, username)
        if (result.success) {
            setSuccess(`Shared with ${username}!`)
            setUsername('')
            await loadSharedUsers()
            onSuccess?.()
        } else {
            setError(result.error || 'Failed to share')
        }
        setLoading(false)
    }

    const handleUnshare = async (userId: string) => {
        setError(null)
        setSuccess(null)
        setLoading(true)

        const result = await unshareTrip(tripId, userId)
        if (result.success) {
            setSuccess('Unshared successfully')
            await loadSharedUsers()
        } else {
            setError(result.error || 'Failed to unshare')
        }
        setLoading(false)
    }

    if (!isOpen) return null

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div
                className={`${styles.modalContent} ${styles.shareModal}`}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="share-modal-title"
            >
                <h3 id="share-modal-title" className={styles.shareTitle}>
                    Share Trip
                </h3>

                <form onSubmit={handleShare} className={styles.shareForm}>
                    <div className={styles.shareRow}>
                        <input
                            type="text"
                            placeholder="Enter username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className={styles.input}
                            disabled={loading}
                        />
                        <button
                            type="submit"
                            disabled={loading || !username.trim()}
                            className={styles.shareBtn}
                        >
                            {loading ? 'Adding...' : 'Share'}
                        </button>
                    </div>
                </form>

                {error && (
                    <div className={styles.statusError}>
                        {error}
                    </div>
                )}

                {success && (
                    <div className={styles.statusSuccess}>
                        {success}
                    </div>
                )}

                <div className={styles.sharedUsers}>
                    <h4 className={styles.sharedTitle}>
                        Shared with ({sharedUsers.length})
                    </h4>
                    {sharedUsers.length === 0 ? (
                        <p className={styles.sharedEmpty}>
                            Not shared with anyone yet
                        </p>
                    ) : (
                        <ul className={styles.sharedList}>
                            {sharedUsers.map(({ user_id, username }) => (
                                <li
                                    key={user_id}
                                    className={styles.sharedItem}
                                >
                                    <span className={styles.sharedName}>{username || user_id}</span>
                                    <button
                                        onClick={() => handleUnshare(user_id)}
                                        disabled={loading}
                                        className={styles.removeBtn}
                                    >
                                        Remove
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className={styles.shareActions}>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className={styles.closeShareBtn}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ShareModal
