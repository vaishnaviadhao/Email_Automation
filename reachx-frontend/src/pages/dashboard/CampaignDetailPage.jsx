import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import { api } from "../../lib/api";

function isHtmlContent(text) {
  return /<[^>]+>/.test(String(text));
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STATUS_STYLE = {
  DRAFT:   "text-slate-500 bg-slate-100 border-slate-200",
  SENDING: "text-amber-600 bg-amber-50 border-amber-200",
  SENT:    "text-emerald-600 bg-emerald-50 border-emerald-200",
  FAILED:  "text-rose-600 bg-rose-50 border-rose-200",
};

const inputCls = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all";

const cnt = (events, type) => (events ?? []).filter((e) => e.eventType === type).length;

export default function CampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showAddRecipients, setShowAddRecipients] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", subject: "", content: "" });
  const [recipientInput, setRecipientInput] = useState("");
  const [addResult, setAddResult] = useState("");
  const [showConfirmSend, setShowConfirmSend] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [showPixelPicker, setShowPixelPicker] = useState(false);
  const [pixels, setPixels] = useState([]);

  async function load() {
    const res = await api.get(`/api/campaigns/${id}`);
    const data = await res.json();
    setCampaign(data);
    setEditForm({ name: data.name, subject: data.subject, content: data.content });
    setLoading(false);
  }

  async function loadPixels() {
    const res = await api.get("/api/pixels");
    const data = await res.json();
    setPixels(data);
  }

  useEffect(() => { load(); }, [id]);

  function insertPixelSnippet(asset) {
    const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
    const snippet = asset.type === "pixel"
      ? `<img src="${BASE}/api/track?pid=${asset.id}&type=open" width="1" height="1" style="display:none" alt="" />`
      : `<img src="${asset.imageUrl}" alt="${asset.name}" style="max-width:100%" />`;
    setEditForm((f) => ({ ...f, content: f.content + "\n" + snippet }));
    setShowPixelPicker(false);
    setShowEdit(true);
  }

  async function handleSend() {
    setSending(true);
    setShowConfirmSend(false);
    await api.post(`/api/campaigns/${id}/send`);
    await load();
    setSending(false);
  }

  async function handleEdit() {
    await api.patch(`/api/campaigns/${id}/edit`, editForm);
    setShowEdit(false);
    await load();
  }

  async function handleAddRecipients() {
    const emails = recipientInput.split(/[\n,]+/).map((e) => e.trim()).filter(Boolean);
    const res = await api.post(`/api/campaigns/${id}/recipients`, { emails });
    const data = await res.json();
    setAddResult(`Added ${data.added} new recipient${data.added !== 1 ? "s" : ""}`);
    setRecipientInput("");
    await load();
  }

  async function handleDeleteRecipient(recipientId) {
    await api.delete(`/api/campaigns/${id}/recipients`, { recipientId });
    await load();
  }

  async function handleDelete() {
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    await api.delete(`/api/campaigns/${id}/delete`);
    navigate("/dashboard/campaigns");
  }

  async function handleDuplicate() {
    const res = await api.post(`/api/campaigns/${id}/duplicate`);
    const data = await res.json();
    navigate(`/dashboard/campaigns/${data.id}`);
  }

  async function handleSchedule() {
    setScheduling(true);
    await api.post(`/api/campaigns/${id}/schedule`, { scheduledAt });
    setShowSchedule(false);
    setScheduling(false);
    await load();
  }

  async function handleCancelSchedule() {
    await api.delete(`/api/campaigns/${id}/schedule`);
    await load();
  }

  if (loading) return <div className="min-h-screen bg-slate-50 flex"><Sidebar /><main className="flex-1 flex items-center justify-center"><p className="text-slate-400">Loading...</p></main></div>;
  if (!campaign) return null;

  const sent = cnt(campaign.events, "SENT");
  const opened = cnt(campaign.events, "OPENED");
  const clicked = cnt(campaign.events, "CLICKED");
  const bounced = cnt(campaign.events, "BOUNCED");
  const unsubscribed = cnt(campaign.events, "UNSUBSCRIBED");

  const STATS = [
    { label: "Recipients", value: campaign.recipients?.length ?? 0, color: "text-indigo-600" },
    { label: "Sent",       value: sent,    color: "text-sky-600" },
    { label: "Opened",     value: opened,  color: "text-violet-600",  sub: sent > 0 ? `${((opened / sent) * 100).toFixed(1)}% rate` : null },
    { label: "Clicked",    value: clicked, color: "text-emerald-600", sub: sent > 0 ? `${((clicked / sent) * 100).toFixed(1)}% rate` : null },
    { label: "Bounced",    value: bounced, color: "text-rose-500" },
    { label: "Unsub",      value: unsubscribed, color: "text-slate-500" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-8 py-8 space-y-7">
          <div className="flex items-start justify-between gap-4 pt-1">
            <div>
              <Link to="/dashboard/campaigns" className="text-slate-400 hover:text-slate-700 text-sm transition-colors">← Campaigns</Link>
              <h1 className="text-xl font-bold text-slate-900 mt-2 tracking-tight">{campaign.name}</h1>
              <p className="text-slate-400 text-sm mt-1">{campaign.subject}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
              <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold border ${STATUS_STYLE[campaign.status]}`}>{campaign.status}</span>
              <button onClick={() => setShowAddRecipients(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 transition-all">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Recipients
              </button>
              <button onClick={() => setShowEdit(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 transition-all">Edit</button>
              <button onClick={handleDuplicate} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 transition-all">Duplicate</button>
              {campaign.status === "DRAFT" && (
                <>
                  <button onClick={() => setShowSchedule(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-amber-600 border border-amber-200 hover:bg-amber-50 transition-all">Schedule</button>
                  <button onClick={() => setShowConfirmSend(true)} disabled={sending || !campaign.recipients?.length}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all">
                    {sending ? "Sending..." : `Send to ${campaign.recipients?.length ?? 0}`}
                  </button>
                </>
              )}
              {campaign.status === "SCHEDULED" && (
                <button onClick={handleCancelSchedule} className="text-sm text-rose-500 hover:text-rose-700 font-medium border border-rose-200 hover:bg-rose-50 px-4 py-2.5 rounded-xl transition-all">Cancel Schedule</button>
              )}
              {campaign.status !== "SENDING" && (
                <button onClick={handleDelete} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-500 border border-slate-200 hover:border-rose-200 hover:bg-rose-50 px-3 py-2 rounded-xl transition-all">Delete</button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {STATS.map((s) => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-300 hover:shadow-sm transition-all">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs font-medium text-slate-500 mt-1">{s.label}</div>
                {s.sub && <div className="text-xs text-slate-400 mt-0.5">{s.sub}</div>}
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Email content</p>
            <div className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-4 max-h-48 overflow-auto font-mono leading-relaxed"
              dangerouslySetInnerHTML={{ __html: isHtmlContent(campaign.content) ? campaign.content : escapeHtml(campaign.content).replace(/\n/g, "<br/>") }}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Recipients</p>
              <span className="text-xs text-slate-400">{campaign.recipients?.length ?? 0} total</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-72 overflow-auto">
              {(campaign.recipients ?? []).length === 0 ? (
                <div className="px-6 py-10 text-center text-slate-400 text-sm">No recipients yet.</div>
              ) : (campaign.recipients ?? []).map((r) => {
                const hasSent = (campaign.events ?? []).some((e) => e.recipientId === r.id && e.eventType === "SENT");
                const hasOpened = (campaign.events ?? []).some((e) => e.recipientId === r.id && e.eventType === "OPENED");
                const hasBounced = (campaign.events ?? []).some((e) => e.recipientId === r.id && e.eventType === "BOUNCED");
                return (
                  <div key={r.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                    <span className="font-mono text-sm text-slate-600 flex-1">{r.email}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      {hasSent && <span className="text-[11px] font-semibold text-sky-600 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">Sent</span>}
                      {hasOpened && <span className="text-[11px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">Opened</span>}
                      {hasBounced && <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">Bounced</span>}
                      <button onClick={() => handleDeleteRecipient(r.id)} className="text-xs text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 px-2 py-1 rounded-lg transition-all font-medium">Remove</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Edit modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Edit Campaign</h2>
              <button onClick={() => setShowEdit(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="space-y-1.5"><label className="text-sm font-medium text-slate-700">Campaign name</label><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputCls} /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium text-slate-700">Subject line</label><input value={editForm.subject} onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })} className={inputCls} /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium text-slate-700">Email content</label><textarea value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} rows={10} className={`${inputCls} font-mono resize-none`} /></div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleEdit} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-all">Save changes</button>
              <button onClick={() => { setShowPixelPicker(true); loadPixels(); }} className="px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 transition-all">Insert Pixel/Image</button>
              <button onClick={() => setShowEdit(false)} className="px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add recipients modal */}
      {showAddRecipients && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Add Recipients</h2>
              <button onClick={() => { setShowAddRecipients(false); setAddResult(""); }} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <p className="text-sm text-slate-500">One per line or comma-separated. Duplicates are skipped.</p>
            <textarea placeholder={"john@example.com\njane@company.com"} rows={6} value={recipientInput} onChange={(e) => setRecipientInput(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-none transition-all" />
            {addResult && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">{addResult}</div>}
            <div className="flex gap-2">
              <button onClick={handleAddRecipients} disabled={!recipientInput.trim()} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-all">Add Recipients</button>
              <button onClick={() => { setShowAddRecipients(false); setAddResult(""); }} className="px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 transition-all">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm send modal */}
      {showConfirmSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">Send campaign?</h3>
              <p className="text-sm text-slate-500 mt-1">This will send to <span className="text-slate-800 font-medium">{campaign.recipients?.length ?? 0} recipient{(campaign.recipients?.length ?? 0) !== 1 ? "s" : ""}</span>. This cannot be undone.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSend} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-all">Send now</button>
              <button onClick={() => setShowConfirmSend(false)} className="px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule modal */}
      {showSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Schedule Send</h3>
              <button onClick={() => setShowSchedule(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Send at</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSchedule} disabled={scheduling || !scheduledAt} className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition-all">
                {scheduling ? "Scheduling..." : "Schedule"}
              </button>
              <button onClick={() => setShowSchedule(false)} className="px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-800 border border-slate-200 hover:bg-slate-50 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Pixel picker modal */}
      {showPixelPicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Insert from Pixel Folder</h3>
              <button onClick={() => setShowPixelPicker(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            {pixels.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No assets in your Pixel Folder yet. Add some from the Pixel Folder section.</p>
            ) : (
              <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
                {pixels.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => insertPixelSnippet(asset)}
                    className="w-full flex items-center gap-3 px-3 py-3 hover:bg-slate-50 transition-colors text-left"
                  >
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${asset.type === "pixel" ? "text-violet-600 bg-violet-50 border-violet-200" : "text-sky-600 bg-sky-50 border-sky-200"}`}>
                      {asset.type === "pixel" ? "Pixel" : "Image"}
                    </span>
                    <span className="text-sm text-slate-700 font-medium flex-1">{asset.name}</span>
                    <span className="text-xs text-indigo-500 font-medium shrink-0">Insert →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
