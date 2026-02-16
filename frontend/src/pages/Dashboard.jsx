import React, { useEffect, useState } from "react";
import TimetableDisplay from "./TimetableDisplay";
import { TimetableAPI } from "../services/api-services";

export default function Dashboard({ setActivePage }) {
  const [published, setPublished] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadPublished = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await TimetableAPI.getPublishedTimetable();
      setPublished(data);
    } catch (e) {
      setPublished(null);
      if ((e.message || "").toLowerCase().includes("no published timetable")) {
        setError("");
      } else {
        setError(e.message || "Failed to load published timetable");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPublished();
    return () => {};
  }, []);

  const handleDeletePublished = async () => {
    if (!window.confirm("Delete published timetable? This can only be done by admin.")) return;
    setDeleting(true);
    setError("");
    try {
      await TimetableAPI.deletePublishedTimetable();
      await loadPublished();
    } catch (e) {
      setError(e.message || "Failed to delete published timetable");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="w-full h-full max-w-screen-2xl mx-auto px-4 md:px-6 py-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-900/85 p-5 md:p-8 shadow-xl">
        <div className="flex flex-wrap gap-3 items-center justify-between mb-5">
          <div>
            <h3 className="text-2xl md:text-3xl font-bold text-slate-100">Admin Dashboard</h3>
            <p className="text-sm text-slate-300 mt-1">
              Published timetable is shared across Admin, Teacher, and Student.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActivePage("generate")}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
            >
              Generate / Publish
            </button>
            <button
              onClick={loadPublished}
              className="px-4 py-2 bg-slate-800 text-slate-100 rounded-lg font-semibold border border-slate-600 hover:bg-slate-700"
            >
              Refresh
            </button>
            <button
              onClick={handleDeletePublished}
              disabled={deleting || !published}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete Published"}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-300">Loading published timetable...</p>
        ) : published?.timetableData && published?.inputData ? (
          <>
            <div className="mb-4 text-sm text-slate-300">
              <strong>Published At:</strong> {published.publishedAt || "N/A"}
            </div>
            <div className="overflow-auto border border-slate-700 rounded-lg p-3 md:p-4 bg-slate-950/40">
              <TimetableDisplay
                timetableData={published.timetableData}
                inputData={published.inputData}
              />
            </div>
          </>
        ) : (
          <p className="text-slate-300">
            No published timetable found. Generate one and click Publish. It will stay saved until admin deletes it.
          </p>
        )}

        {error && <p className="mt-4 text-rose-300">{error}</p>}
      </section>
    </main>
  );
}
