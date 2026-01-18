import { useState, useEffect } from 'react';
import { auth } from '../../firebase.config';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

function Dashboard() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      setUser(currentUser);
      fetchUserData(currentUser);
    }
  }, []);

  const fetchUserData = async (currentUser) => {
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch('http://localhost:3000/api/users/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserData(data);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <button onClick={handleLogout} className="logout-button">Logout</button>
      </div>

      <div className="dashboard-content">
        <div className="user-info">
          <h2>Welcome, {user?.email}</h2>
          {userData && (
            <p className="role-badge">{userData.role}</p>
          )}
        </div>

        {userData?.role === 'patient' && (
          <div className="dashboard-section">
            <h3>My Medications</h3>
            <p>No medications added yet.</p>
          </div>
        )}

        {userData?.role === 'caregiver' && (
          <div className="dashboard-section">
            <h3>My Patients</h3>
            <p>No patients linked yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
