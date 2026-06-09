import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = searchParams.get("token");
    const userParam = searchParams.get("user");
    const errorParam = searchParams.get("error");
    const detailsParam = searchParams.get("details");

    if (errorParam) {
      setError(`OAuth failed: ${decodeURIComponent(detailsParam || errorParam)}`);
      return;
    }

    if (!token) return;

    setToken(token);
    if (userParam) {
      const userObj = decodeBase64Url(userParam);
      if (userObj) setUser(userObj);
    }
    navigate("/dashboard");
  }, [searchParams, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await api.post("/api/auth/login", { email, password });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Invalid email or password"); setLoading(false); }
    else { setToken(data.token); setUser(data.user); navigate("/dashboard"); }
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError("");
    const res = await api.get("/api/auth/google-url");
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Unable to connect with Google"); setLoading(false); return; }
    window.location.href = data.url;
  }

  async function handleZohoSignIn() {
    setLoading(true);
    setError("");
    const res = await api.get("/api/auth/zoho-url");
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Unable to connect with Zoho"); setLoading(false); return; }
    window.location.href = data.url;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-md bg-white rounded-[32px] border border-slate-200/80 shadow-[0_35px_65px_rgba(15,23,42,0.12)] overflow-hidden">
        <div className="px-8 py-8">
          <div className="flex justify-center mb-6">
            <img src={horizontalLogo} alt="GTM Reach" className="h-14 w-auto" />
          </div>
          <div className="text-center space-y-3">
            <h1 className="text-3xl font-semibold text-slate-900">Welcome back</h1>
            <p className="text-sm text-slate-500">Sign in to your account</p>
          </div>
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Email</label>
              <input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Password</label>
              <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className={inputCls} />
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                Remember me
              </label>
              <a href="#" className="text-indigo-600 hover:text-indigo-700">Forgot password?</a>
            </div>
            {error && <p className="text-rose-600 text-sm bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl py-3 font-semibold shadow-sm transition-all">
              {loading ? "Signing in..." : "Sign in →"}
            </button>
          </form>
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] uppercase tracking-[0.24em] text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <button type="button" onClick={handleGoogleSignIn} disabled={loading} className="w-full border border-slate-200 rounded-2xl py-3 text-sm font-medium text-slate-700 inline-flex items-center justify-center gap-2 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed">
            <span className="text-base">G</span>
            Continue with Google
          </button>
          <button type="button" onClick={handleZohoSignIn} disabled={loading} className="w-full border border-slate-200 rounded-2xl py-3 text-sm font-medium text-slate-700 inline-flex items-center justify-center gap-2 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed mt-3">
            <span className="text-base">Z</span>
            Continue with Zoho
          </button>
          <p className="text-center text-sm text-slate-500 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-indigo-600 font-medium hover:text-indigo-700">Create one</Link>
          </p>
          <div className="text-center mt-3">
            <Link to="/" className="text-sm text-slate-400 hover:text-slate-600">← Back to home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
