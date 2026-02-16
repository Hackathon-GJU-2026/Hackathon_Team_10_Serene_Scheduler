import { useEffect, useMemo, useState } from "react";
import { TimetableAPI } from "../services/api-services";

function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDateTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "";
  }
}

export default function Topbar({ user, onLogout, onOpenMobileNav }) {
  const displayName = user?.name || user?.username || "Admin";
  const role = user?.role || "admin";

  const [openBell, setOpenBell] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [feed, setFeed] = useState({ events: [], counts: { totalPending: 0 }, pending: { teacherRegistrations: [], rescheduleRequests: [] } });
  const [busyId, setBusyId] = useState(null);

  const loadFeed = async () => {
    if (role !== "admin") return;
    setFeedLoading(true);
    setFeedError("");
    try {
      const res = await TimetableAPI.getActivityFeed();
      setFeed(res || { events: [], counts: { totalPending: 0 }, pending: { teacherRegistrations: [], rescheduleRequests: [] } });
    } catch (e) {
      setFeedError(e.message || "Failed to load activity");
    } finally {
      setFeedLoading(false);
    }
  };

  useEffect(() => {
    if (role !== "admin") return;
    loadFeed();
    const intervalId = window.setInterval(loadFeed, 30000);
    return () => window.clearInterval(intervalId);
  }, [role]);

  const approveTeacher = async (id) => {
    setBusyId(`teacher-approve-${id}`);
    try {
      await TimetableAPI.approveTeacherRegistration(id);
      await loadFeed();
    } catch (e) {
      setFeedError(e.message || "Failed to approve teacher request");
    } finally {
      setBusyId(null);
    }
  };

  const rejectTeacher = async (id) => {
    const reason = window.prompt("Reason for rejection (optional):", "Teacher verification failed");
    setBusyId(`teacher-reject-${id}`);
    try {
      await TimetableAPI.rejectTeacherRegistration(id, reason || "");
      await loadFeed();
    } catch (e) {
      setFeedError(e.message || "Failed to reject teacher request");
    } finally {
      setBusyId(null);
    }
  };

  const approveReschedule = async (id) => {
    setBusyId(`reschedule-approve-${id}`);
    try {
      await TimetableAPI.approveRescheduleRequest(id);
      await loadFeed();
    } catch (e) {
      setFeedError(e.message || "Failed to approve reschedule request");
    } finally {
      setBusyId(null);
    }
  };

  const rejectReschedule = async (id) => {
    const reason = window.prompt("Reason for rejection (optional):", "Not feasible in current constraints");
    setBusyId(`reschedule-reject-${id}`);
    try {
      await TimetableAPI.rejectRescheduleRequest(id, reason || "");
      await loadFeed();
    } catch (e) {
      setFeedError(e.message || "Failed to reject reschedule request");
    } finally {
      setBusyId(null);
    }
  };

  const totalPending = feed?.counts?.totalPending || 0;
  const topEvents = useMemo(() => (feed?.events || []).slice(0, 8), [feed]);
  const pendingTeacher = useMemo(() => (feed?.pending?.teacherRegistrations || []).slice(0, 4), [feed]);
  const pendingReschedule = useMemo(() => (feed?.pending?.rescheduleRequests || []).slice(0, 4), [feed]);

  return (
    <header className="sticky top-0 z-20 bg-slate-900/90 backdrop-blur border-b border-slate-700">
      <div className="h-16 px-3 md:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="md:hidden w-10 h-10 rounded-lg border border-slate-600 text-slate-100"
            aria-label="Open navigation menu"
          >
            ☰
          </button>
          <div className="min-w-0">
            <h1 className="text-base md:text-xl font-semibold text-slate-100 truncate">Admin Dashboard</h1>
            <p className="hidden sm:block text-xs text-slate-400">Manage timetables, events and reviews</p>
          </div>
        </div>

        <div className="flex items-center gap-3 relative">
          {role === "admin" && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  const next = !openBell;
                  setOpenBell(next);
                  if (next) loadFeed();
                }}
                className="w-10 h-10 rounded-lg border border-slate-600 text-slate-100 flex items-center justify-center hover:bg-slate-800"
                aria-label="Open notifications"
                title="Daily activity"
              >
                🔔
              </button>
              {totalPending > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {totalPending}
                </span>
              )}

              {openBell && (
                <div className="absolute right-0 mt-2 w-[460px] max-w-[96vw] rounded-2xl border border-slate-600 bg-slate-900 shadow-2xl p-4 z-30">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-slate-100">Today&apos;s Updates</h3>
                    <button
                      onClick={loadFeed}
                      className="text-sm px-3 py-1.5 rounded-lg bg-slate-800 text-slate-100 border border-slate-600"
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="text-sm text-slate-200 mb-3">
                    Pending: {feed?.counts?.pendingTeacherRegistrations || 0} teacher approvals, {feed?.counts?.pendingRescheduleRequests || 0} reschedule requests
                  </div>

                  {feedLoading ? (
                    <p className="text-xs text-slate-400">Loading...</p>
                  ) : (
                    <>
                      {!!pendingTeacher.length && (
                        <div className="mb-4">
                          <div className="text-sm font-semibold text-slate-200 mb-2">Teacher approvals</div>
                          <div className="space-y-3">
                            {pendingTeacher.map((req) => (
                              <div key={req.id} className="rounded-xl border border-slate-600 bg-slate-800/70 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm text-slate-100 font-semibold">{req.username} ({req.name})</div>
                                  <span className="text-xs px-2 py-1 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">Teacher</span>
                                </div>
                                <div className="text-xs text-slate-200 mt-2">Display Name: {req.teacher_name || req.name}</div>
                                <div className="text-xs text-slate-200">Email: {req.email || "N/A"}</div>
                                <div className="text-xs text-slate-400">Requested: {formatDateTime(req.created_at)}</div>
                                <div className="mt-2 flex gap-2">
                                  <button
                                    onClick={() => approveTeacher(req.id)}
                                    disabled={busyId === `teacher-approve-${req.id}` || busyId === `teacher-reject-${req.id}`}
                                    className="text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => rejectTeacher(req.id)}
                                    disabled={busyId === `teacher-approve-${req.id}` || busyId === `teacher-reject-${req.id}`}
                                    className="text-sm px-3 py-1.5 rounded-lg bg-rose-600 text-white disabled:opacity-50"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {!!pendingReschedule.length && (
                        <div className="mb-4">
                          <div className="text-sm font-semibold text-slate-200 mb-2">Reschedule approvals</div>
                          <div className="space-y-3">
                            {pendingReschedule.map((req) => (
                              <div key={req.id} className="rounded-xl border border-slate-600 bg-slate-800/70 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm text-slate-100 font-semibold">{req.teacher}</div>
                                  <span className="text-xs px-2 py-1 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30">Reschedule</span>
                                </div>
                                <div className="text-xs text-slate-200 mt-2">Day/Slot: {req.day} | {req.slot}</div>
                                <div className="text-xs text-slate-200">Reason: {req.reason || "Teacher unavailable"}</div>
                                <div className="text-xs text-slate-400">Requested: {formatDateTime(req.createdAt)}</div>
                                <div className="mt-2 flex gap-2">
                                  <button
                                    onClick={() => approveReschedule(req.id)}
                                    disabled={busyId === `reschedule-approve-${req.id}` || busyId === `reschedule-reject-${req.id}`}
                                    className="text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => rejectReschedule(req.id)}
                                    disabled={busyId === `reschedule-approve-${req.id}` || busyId === `reschedule-reject-${req.id}`}
                                    className="text-sm px-3 py-1.5 rounded-lg bg-rose-600 text-white disabled:opacity-50"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-sm font-semibold text-slate-200 mb-2">Activity log</div>
                      {feedError ? (
                        <p className="text-sm text-rose-300">{feedError}</p>
                      ) : topEvents.length === 0 ? (
                        <p className="text-sm text-slate-400">No updates for today.</p>
                      ) : (
                        <div className="space-y-3 max-h-72 overflow-auto pr-1">
                          {topEvents.map((event) => (
                            <div key={event.id} className="rounded-xl border border-slate-600 bg-slate-800/70 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs text-slate-400">{formatTime(event.createdAt)}</div>
                                <div className="text-xs text-slate-400">{event.type || "event"}</div>
                              </div>
                              <div className="text-sm text-slate-100">{event.message}</div>
                              {event?.data?.username && (
                                <div className="text-xs text-slate-400">User: {event.data.username}</div>
                              )}
                              {event?.data?.teacher && (
                                <div className="text-xs text-slate-400">
                                  Teacher: {event.data.teacher} | {event.data.day} | {event.data.slot}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="text-right leading-tight hidden sm:block">
            <div className="text-sm font-semibold text-slate-100 truncate max-w-[180px]">{displayName}</div>
            <div className="text-xs text-slate-400 capitalize">{role}</div>
          </div>
          <button
            onClick={onLogout}
            type="button"
            className="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-500"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
