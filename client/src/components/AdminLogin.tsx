import { useState } from "react";
import { login } from "../api";
import "../App.css";

interface AdminLoginProps {
  onLogin: () => void;
}

export function AdminLogin({ onLogin }: AdminLoginProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect password");
    }
  };

  return (
    <div className="admin-login">
      <div className="admin-login__card">
        <h2 className="admin-login__title">Admin Access</h2>
        <p className="admin-login__desc">Enter password to manage Knowledge Base</p>
        <form onSubmit={handleSubmit} className="admin-login__form">
          <input
            type="password"
            className="admin-login__input"
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            autoFocus
          />
          {error && <div className="admin-login__error">{error}</div>}
          <button type="submit" className="admin-login__btn">
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
