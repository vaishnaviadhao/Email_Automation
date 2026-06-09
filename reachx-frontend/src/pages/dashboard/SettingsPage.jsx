import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import { api, getUser } from "../../lib/api";

const inputCls = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all";

export default function SettingsPage() {
  const user = getUser();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ name: "", senderName: "", replyTo: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [gmailAccounts, setGmailAccounts] = useState([]);
  const [zohoAccounts, setZohoAccounts] = useState([]);
  const [gmailMsg, setGmailMsg] = useState(null);
  const [zohoMsg, setZohoMsg] = useState(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    api.get("/api/settings").then((r) => r.json()).then((data) => {
      setForm({ name: data.name ?? "", senderName: data.senderName ?? "", replyTo: data.replyTo ?? "" });
      setLoading(false);
    });
    loadGmail();
    loadZoho();

    const gmailStatus = searchParams.get("gmail");
    const zohoStatus = searchParams.get("zoho");
    if (gmailStatus === "connected") setGmailMsg({ type: "success", text: "Gmail account connected successfully." });
    if (gmailStatus === "error") setGmailMsg({ type: "error", text: "Failed to connect Gmail. Please try again." });
    if (zohoStatus === "connected") setZohoMsg({ type: "success", text: "Zoho account connected successfully." });
    if (zohoStatus === "error") setZohoMsg({ type: "error", text: "Failed to connect Zoho. Please try again." });
  }, []);

  async function loadGmail() {
    const res = await api.get("/api/gmail/accounts");
    const data = await res.json();
    setGmailAccounts(Array.isArray(data) ? data : []);
  }

  async function loadZoho() {
    const res = await api.get("/api/zoho/accounts");
    const data = await res.json();
    setZohoAccounts(Array.isArray(data) ? data : []);
  }

  async function handleSave() {
    setSaving(true);
    await api.patch("/api/settings", form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleToggleGmail(id, isActive) {
    await api.patch(`/api/gmail/accounts/${id}`, { isActive: !isActive });
    await loadGmail();
  }

  async function handleConnectGmail(clientId, clientSecret) {
    setConnecting(true);
    try {
      const params = new URLSearchParams({ clientId, clientSecret });
      const res = await api.get(`/api/gmail/auth-url?${params}`);
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setGmailMsg({ type: "error", text: "Could not start Gmail connection. Try again." });
      setConnecting(false);
    }
  }

  async function handleConnectZoho(clientId, clientSecret) {
    setConnecting(true);
    try {
      const params = new URLSearchParams({ clientId, clientSecret });
      const res = await api.get(`/api/zoho/auth-url?${params}`);
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setZohoMsg({ type: "error", text: "Could not start Zoho connection. Try again." });
      setConnecting(false);
    }
  }

  async function handleDisconnectGmail(id) {
    if (!confirm("Disconnect this Gmail account?")) return;
    await api.delete(`/api/gmail/accounts/${id}`);
    await loadGmail();
  }

  async function handleToggleZoho(id, isActive) {
    await api.patch(`/api/zoho/accounts/${id}`, { isActive: !isActive });
    await loadZoho();
  }

  async function handleDisconnectZoho(id) {
    if (!confirm("Disconnect this Zoho account?")) return;
    await api.delete(`/api/zoho/accounts/${id}`);
    await loadZoho();
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-8 py-8 space-y-7">
          <div className="pt-1">
            <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-widest mb-1">Account</p>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Settings</h1>
          </div>

          {loading ? (
            <div className="text-sm text-slate-400 py-10 text-center">Loading...</div>
          ) : (
            <div className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Profile</p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Display name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <input value={user?.email ?? ""} disabled className={inputCls + " opacity-50 cursor-not-allowed"} />
                  <p className="text-xs text-slate-400">Email cannot be changed.</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sender profile</p>
                  <p className="text-xs text-slate-400 mt-1">These are used as defaults for all campaigns.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">From name</label>
                  <input value={form.senderName} onChange={(e) => setForm({ ...form, senderName: e.target.value })} placeholder="e.g. Sarah from Acme" className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Reply-to email</label>
                  <input type="email" value={form.replyTo} onChange={(e) => setForm({ ...form, replyTo: e.target.value })} placeholder="replies@yourcompany.com" className={inputCls} />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all">
                  {saving ? "Saving..." : "Save settings"}
                </button>
                {saved && <span className="text-sm text-emerald-600 font-medium flex items-center gap-1.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Saved</span>}
              </div>

              {/* Gmail Accounts */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Gmail Sending Accounts</p>
                    <p className="text-xs text-slate-400 mt-1">Connected accounts are used round-robin to send campaigns.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleConnectGmail()}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                  >
                    Connect Gmail
                  </button>
                </div>

                {gmailMsg && (
                  <div className={`text-xs px-3 py-2.5 rounded-xl border ${gmailMsg.type === "success" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-rose-600 bg-rose-50 border-rose-200"}`}>
                    {gmailMsg.text}
                  </div>
                )}

                {gmailAccounts.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    No Gmail accounts connected yet. Click "Connect Gmail" to add one.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {gmailAccounts.map((acc) => (
                      <div key={acc.id} className="flex items-center justify-between py-3 gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{acc.email}</p>
                            <p className="text-[11px] text-slate-400">Connected via OAuth2</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleToggleGmail(acc.id, acc.isActive)}
                            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${acc.isActive ? "text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" : "text-slate-400 bg-slate-50 border-slate-200 hover:bg-slate-100"}`}
                          >
                            {acc.isActive ? "Active" : "Paused"}
                          </button>
                          <button
                            onClick={() => handleDisconnectGmail(acc.id)}
                            className="text-xs text-slate-400 hover:text-rose-500 border border-slate-200 hover:border-rose-200 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-all"
                          >
                            Disconnect
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Zoho Sending Accounts</p>
                    <p className="text-xs text-slate-400 mt-1">Connect Zoho accounts to send campaigns through Zoho SMTP.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleConnectZoho()}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                  >
                    Connect Zoho
                  </button>
                </div>

                {zohoMsg && (
                  <div className={`text-xs px-3 py-2.5 rounded-xl border ${zohoMsg.type === "success" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-rose-600 bg-rose-50 border-rose-200"}`}>
                    {zohoMsg.text}
                  </div>
                )}

                {zohoAccounts.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    No Zoho accounts connected yet. Click "Connect Zoho" to add one.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {zohoAccounts.map((acc) => (
                      <div key={acc.id} className="flex items-center justify-between py-3 gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                            <span className="text-sky-600 font-semibold">Z</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{acc.email}</p>
                            <p className="text-[11px] text-slate-400">Connected via OAuth2</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleToggleZoho(acc.id, acc.isActive)}
                            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${acc.isActive ? "text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" : "text-slate-400 bg-slate-50 border-slate-200 hover:bg-slate-100"}`}
                          >
                            {acc.isActive ? "Active" : "Paused"}
                          </button>
                          <button
                            onClick={() => handleDisconnectZoho(acc.id)}
                            className="text-xs text-slate-400 hover:text-rose-500 border border-slate-200 hover:border-rose-200 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-all"
                          >
                            Disconnect
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function GmailIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  );
}
