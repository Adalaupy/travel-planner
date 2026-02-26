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
                className={styles.modalContent}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="share-modal-title"
                style={{ minWidth: '450px' }}
            >
                <h3 id="share-modal-title" style={{ margin: '0 0 16px', fontSize: '1.25rem', fontWeight: 700 }}>
                    Share Trip
                </h3>

                <form onSubmit={handleShare} style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <input
                            type="text"
                            placeholder="Enter username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className={styles.input}
                            disabled={loading}
                            style={{ flex: 1 }}
                        />
                        <button
                            type="submit"
                            disabled={loading || !username.trim()}
                            style={{
                                padding: '10px 16px',
                                backgroundColor: loading || !username.trim() ? '#d1d5db' : '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: loading || !username.trim() ? 'not-allowed' : 'pointer',
                                fontWeight: '600',
                                fontSize: '14px',
                                minWidth: '90px',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                                if (!loading && username.trim()) {
                                    e.currentTarget.style.backgroundColor = '#059669'
                                }
                            }}
                            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                                if (!loading && username.trim()) {
                                    e.currentTarget.style.backgroundColor = '#10b981'
                                }
                            }}
                        >
                            {loading ? 'Adding...' : 'Share'}
                        </button>
                    </div>
                </form>

                {error && (
                    <div style={{ color: '#dc2626', fontSize: '14px', marginBottom: '12px' }}>
                        {error}
                    </div>
                )}

                {success && (
                    <div style={{ color: '#16a34a', fontSize: '14px', marginBottom: '12px' }}>
                        {success}
                    </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 8px' }}>
                        Shared with ({sharedUsers.length})
                    </h4>
                    {sharedUsers.length === 0 ? (
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0' }}>
                            Not shared with anyone yet
                        </p>
                    ) : (
                        <ul style={{ listStyle: 'none', padding: '0', margin: '0' }}>
                            {sharedUsers.map(({ user_id, username }) => (
                                <li
                                    key={user_id}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '8px',
                                        borderBottom: '1px solid #e5e7eb',
                                    }}
                                >
                                    <span style={{ fontSize: '14px' }}>{username || user_id}</span>
                                    <button
                                        onClick={() => handleUnshare(user_id)}
                                        disabled={loading}
                                        style={{
                                            padding: '6px 12px',
                                            fontSize: '13px',
                                            backgroundColor: loading ? '#fca5a5' : '#ef4444',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: loading ? 'not-allowed' : 'pointer',
                                            fontWeight: '600',
                                            transition: 'all 0.2s',
                                        }}
                                        onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                                            if (!loading) {
                                                e.currentTarget.style.backgroundColor = '#dc2626'
                                            }
                                        }}
                                        onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                                            if (!loading) {
                                                e.currentTarget.style.backgroundColor = '#ef4444'
                                            }
                                        }}
                                    >
                                        Remove
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        style={{
                            padding: '10px 16px',
                            backgroundColor: loading ? '#e5e7eb' : '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '14px',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                            if (!loading) {
                                e.currentTarget.style.backgroundColor = '#4b5563'
                            }
                        }}
                        onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                            if (!loading) {
                                e.currentTarget.style.backgroundColor = '#6b7280'
                            }
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ShareModal
