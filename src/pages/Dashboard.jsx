import { useState, useEffect } from 'react'
import { auth } from '../../firebase.config'
import { signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import './Dashboard.css'

function Dashboard() {
    const [user, setUser] = useState(null)
    const [userData, setUserData] = useState(null)
    const [linkEmail, setLinkEmail] = useState('')
    const [showLinkModal, setShowLinkModal] = useState(false)
    const [linkType, setLinkType] = useState('')
    const [error, setError] = useState('')
    const navigate = useNavigate()

    const [currentPills, setCurrentPills] = useState([
        { id: 1, name: 'John Doe', medicine: 'Aspirin', time: '08:00 AM', status: 'missed' },
        { id: 2, name: 'Jane Smith', medicine: 'Vitamin D', time: '01:00 PM', status: 'taken' },
    ])

    const notifications = [
        { id: 1, message: 'Aspirin taken', date: 'Jan 15, 08:05' },
        { id: 2, message: 'Vitamin D missed', date: 'Jan 14, 13:30' },
        { id: 3, message: 'New Vitamin C scheduled', date: 'Jan 13, 09:00' },
    ]

    useEffect(() => {
        const currentUser = auth.currentUser
        if (currentUser) {
            setUser(currentUser)
            fetchUserData(currentUser)
        }
    }, [])

    const fetchUserData = async (currentUser) => {
        try {
            const token = await currentUser.getIdToken()
            const res = await fetch('http://localhost:3000/api/users/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setUserData(data)
            }
        } catch (error) {
            console.error('Error fetching user data:', error)
        }
    }

    const handleLogout = async () => {
        await signOut(auth)
        navigate('/login')
    }

    const handleLink = async () => {
        if (!linkEmail.trim()) return
        setError('')

        try {
            const token = await auth.currentUser.getIdToken()
            const endpoint = linkType === 'caregiver' ? 'link-caregiver' : 'link-patient'

            const res = await fetch(`http://localhost:3000/api/users/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ email: linkEmail })
            })

            if (res.ok) {
                alert(`${linkType === 'caregiver' ? 'Caregiver' : 'Patient'} linked successfully!`)
                setShowLinkModal(false)
                setLinkEmail('')
                fetchUserData(auth.currentUser)
            } else {
                const data = await res.json()
                setError(data.error || 'Failed to link')
            }
        } catch (error) {
            setError('Error linking user')
        }
    }

    const addNewPill = () => {
        const newPill = {
            id: Date.now(),
            name: 'New Person',
            medicine: 'New Medicine',
            time: '12:00 PM',
            status: 'pending',
        }
        setCurrentPills([...currentPills, newPill])
    }

    return (
        <div className="dashboard-page">
            <header className="dashboard-header">
                <h1>Dashboard</h1>
                <div className="header-actions">
                    <span>{user?.email}</span>
                    <button onClick={handleLogout} className="logout-btn">Logout</button>
                </div>
            </header>

            <main className="dashboard-content">
                {/* Links Section */}
                <section className="links-section">
                    <div className="link-buttons">
                        <button onClick={() => { setLinkType('caregiver'); setShowLinkModal(true); setError(''); setLinkEmail(''); }}>
                            + Add Caregiver
                        </button>
                        <button onClick={() => { setLinkType('patient'); setShowLinkModal(true); setError(''); setLinkEmail(''); }}>
                            + Add Patient
                        </button>
                    </div>

                    {userData?.linkedCaregivers?.length > 0 && (
                        <div className="linked-users">
                            <h3>My Caregivers</h3>
                            {userData.linkedCaregivers.map(cg => (
                                <div key={cg._id} className="linked-user-item">{cg.email}</div>
                            ))}
                        </div>
                    )}

                    {userData?.linkedPatients?.length > 0 && (
                        <div className="linked-users">
                            <h3>My Patients</h3>
                            {userData.linkedPatients.map(p => (
                                <div key={p._id} className="linked-user-item">{p.email}</div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Current Pills Section */}
                <section className="current-pills-section">
                    <h2>Current Pills</h2>

                    <div className="pill-cards-container">
                        {currentPills.map(({ id, name, medicine, time, status }) => (
                            <div key={id} className="pill-card">
                                <div className="pill-header">
                                    <span className="medicine-name">{medicine}</span>
                                    <span className={`status-icon ${status}`}>
                                        {status === 'taken' && '✔️'}
                                        {status === 'missed' && '❌'}
                                        {status === 'pending' && '⏳'}
                                    </span>
                                </div>

                                <div className="pill-details">
                                    <div className="person-name">{name}</div>
                                    <div className="pill-time">{time}</div>
                                </div>
                            </div>
                        ))}

                        <button className="pill-card add-card" onClick={addNewPill}>
                            <span className="plus-sign">＋</span>
                            <div>Add Pill</div>
                        </button>
                    </div>
                </section>

                {/* Notifications Section */}
                <section className="notifications-section">
                    <h2>Notifications</h2>
                    {notifications.map(({ id, message, date }) => (
                        <div key={id} className="notification-item">
                            <div>{message}</div>
                            <small>{date}</small>
                        </div>
                    ))}
                </section>
            </main>

            {/* Link Modal */}
            {showLinkModal && (
                <div className="modal-overlay" onClick={() => setShowLinkModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>Add {linkType === 'caregiver' ? 'Caregiver' : 'Patient'}</h3>
                        <p className="modal-hint">Enter their email to link</p>

                        <div className="search-box">
                            <input
                                type="email"
                                placeholder="Enter email..."
                                value={linkEmail}
                                onChange={(e) => setLinkEmail(e.target.value.toLowerCase())}
                            />
                            <button onClick={handleLink}>Link</button>
                        </div>

                        {error && <p className="error-message">{error}</p>}

                        <button className="close-btn" onClick={() => setShowLinkModal(false)}>Close</button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Dashboard
