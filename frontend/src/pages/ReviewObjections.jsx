import { useEffect, useState } from "react";
import { TimetableAPI } from "../services/api-services";

function StatusBadge({ status }) {
  const cls =
    status === "approved"
      ? "bg-green-100 text-green-700"
      : status === "rejected"
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700";
  return <span className={`px-2 py-1 rounded text-xs font-semibold ${cls}`}>{status}</span>;
}

export default function ReviewObjections() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const loadRequests = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await TimetableAPI.getRescheduleRequests();
      setRequests(res.requests || []);
    } catch (e) {
      setError(e.message || "Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const approveRequest = async (id) => {
    setBusyId(id);
    setError("");
    try {
      await TimetableAPI.approveRescheduleRequest(id);
      await loadRequests();
    } catch (e) {
      setError(e.message || "Failed to approve request");
    } finally {
      setBusyId(null);
    }
  };

  const rejectRequest = async (id) => {
    const note = window.prompt("Reason for rejection (optional):", "Not feasible in current constraints");
    setBusyId(id);
    setError("");
    try {
      await TimetableAPI.rejectRescheduleRequest(id, note || "");
      await loadRequests();
    } catch (e) {
      setError(e.message || "Failed to reject request");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full h-full max-w-screen-xl mx-auto px-4 md:px-6 py-6">
      <div className="bg-white rounded-2xl p-5 md:p-7 shadow-sm border border-gray-200">
        <div className="flex flex-wrap gap-3 items-center justify-between mb-5">
          <div>
            <h3 className="text-2xl md:text-3xl font-bold text-gray-900">Teacher Unavailability Requests</h3>
            <p className="text-sm text-gray-600 mt-1">
              Approve to apply reschedule and save changes to the published timetable.
            </p>
          </div>
          <button onClick={loadRequests} className="px-4 py-2 bg-slate-100 rounded-lg border border-slate-200 font-semibold">
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-gray-600">Loading requests...</p>
        ) : requests.length === 0 ? (
          <p className="text-gray-500">No teacher requests found.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div key={req.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <div className="text-sm text-gray-500">#{req.id} • {req.createdAt}</div>
                    <div className="text-lg font-semibold text-gray-900">{req.teacher}</div>
                    <div className="text-sm text-gray-700">
                      Unavailable at <strong>{req.day}</strong> • <strong>{req.slot}</strong>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">Reason: {req.reason || "N/A"}</div>
                    {req.adminNote && <div className="text-sm text-red-600 mt-1">Admin Note: {req.adminNote}</div>}
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadge status={req.status || "pending"} />
                    {req.status === "pending" && (
                      <>
                        <button
                          onClick={() => approveRequest(req.id)}
                          disabled={busyId === req.id}
                          className="px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
                        >
                          {busyId === req.id ? "Applying..." : "Approve & Apply"}
                        </button>
                        <button
                          onClick={() => rejectRequest(req.id)}
                          disabled={busyId === req.id}
                          className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-red-700 mt-4">{error}</p>}
      </div>
    </div>
  );
}
