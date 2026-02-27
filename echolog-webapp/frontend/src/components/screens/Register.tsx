// CEG491X-Capstone/echolog-webapp/frontend/src/components/screens/Register.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

const Register: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div style={{ padding: '50px', textAlign: 'center' }}>
      <h2>Register</h2>
      <p>Registration form (to be implemented).</p>
      <button onClick={() => navigate('/login')}>Back to Login</button>
    </div>
  );
};

export default Register;