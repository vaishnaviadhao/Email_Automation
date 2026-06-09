import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, setToken, setUser } from "../lib/api";
import horizontalLogo from "../assests/transparent-horizontal-removebg-preview.png";

const inputCls = "w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 transition";

function decodeBase64Url(value) {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
    return JSON.parse(window.atob(base64));
  } catch {
    return null;
  }
}

export default function SetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setTokenState] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const urlToken = searchParams.get("token");
    const userParam = searchParams.get("user");
    const errorParam = searchParams.get("error");

    console.log("[SetPasswordPage] Params:", { token: !!urlToken, user: !!userParam, error: errorParam });

    if (errorParam) {
      setError(`OAuth error: ${errorParam}`);
      setInitialized(true);
      return;
    }

    if (!urlToken || !userParam) {
      setError("Invalid or missing session. Please try signing in again.");
      setInitialized(true);
      return;
    }

    const userObj = decodeBase64Url(userParam);
    if (!userObj?.email) {
      setError("Invalid user information");
      setInitialized(true);
      return;
    }

    console.log("[SetPasswordPage] User email:", userObj.email);
    setTokenState(urlToken);
    setUserEmail(userObj.email);
    setUserName(userObj.name || "");
    setInitialized(true);
  }, [searchParams]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:4000"}/api/auth/set-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to set password");
        setLoading(false);
        return;
      }

      console.log("[SetPasswordPage] Password set successfully, logging in...");
      setToken(data.token);
      setUser(data.user);
      navigate("/dashboard");
    } catch (err) {
      console.error("[SetPasswordPage] Error:", err);
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  }

  if (!initialized) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-md bg-white rounded-[32px] border border-slate-200/80 shadow-[0_35px_65px_rgba(15,23,42,0.12)] overflow-hidden">
          <div className="px-8 py-8 text-center">
            <p className="text-slate-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !userEmail) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-md bg-white rounded-[32px] border border-slate-200/80 shadow-[0_35px_65px_rgba(15,23,42,0.12)] overflow-hidden">
          <div className="px-8 py-8">
            <div className="flex justify-center mb-6">
              <img src={horizontalLogo} alt="GTM Reach" className="h-14 w-auto" />
            </div>
            <div className="text-center space-y-3">
              <h1 className="text-2xl font-semibold text-slate-900">Session Expired</h1>
              <p className="text-sm text-slate-500">{error}</p>
            </div>
            <Link to="/login" className="block w-full mt-6 text-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl py-3 font-semibold shadow-sm transition-all">
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-md bg-white rounded-[32px] border border-slate-200/80 shadow-[0_35px_65px_rgba(15,23,42,0.12)] overflow-hidden">
        <div className="px-8 py-8">
          <div className="flex justify-center mb-6">
            <img src={horizontalLogo} alt="GTM Reach" className="h-14 w-auto" />
          </div>
          <div className="text-center space-y-3">
            <h1 className="text-3xl font-semibold text-slate-900">Set your password</h1>
            <p className="text-sm text-slate-500">Create a password to secure your account</p>
            <p className="text-sm text-slate-600 font-medium">{userEmail}</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Confirm password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className={inputCls}
              />
            </div>
            <p className="text-xs text-slate-500">Password must be at least 8 characters long</p>
            {error && <p className="text-rose-600 text-sm bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl py-3 font-semibold shadow-sm transition-all"
            >
              {loading ? "Setting password..." : "Set password & continue →"}
            </button>
          </form>
          
          <Link to="/login" className="block text-center text-sm text-slate-400 hover:text-slate-600 mt-6">
            ← Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}

