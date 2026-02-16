import { useEffect, useMemo, useRef, useState } from "react";
import { TimetableAPI } from "../services/api-services";
import TimetableDisplay from "./TimetableDisplay";

function downloadCanvasAsPng(canvas, filename) {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = filename;
  link.click();
}

async function ensureJsPdf() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load jsPDF"));
    document.body.appendChild(script);
  });
  if (!window.jspdf?.jsPDF) {
    throw new Error("jsPDF not available");
  }
  return window.jspdf.jsPDF;
}

async function ensureHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load html2canvas"));
    document.body.appendChild(script);
  });

  if (!window.html2canvas) {
    throw new Error("html2canvas not available");
  }
  return window.html2canvas;
}

function createExportClone(node) {
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-100000px";
  wrapper.style.top = "0";
  wrapper.style.background = "#ffffff";
  wrapper.style.padding = "16px";
  wrapper.style.zIndex = "-1";

  const clone = node.cloneNode(true);
  clone.style.overflow = "visible";
  clone.style.maxHeight = "none";
  clone.style.maxWidth = "none";
  clone.style.height = "auto";
  clone.style.width = "max-content";

  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  clone.querySelectorAll(".table-container, .timetable-display, .section-timetable").forEach((el) => {
    el.style.overflow = "visible";
    el.style.maxHeight = "none";
    el.style.maxWidth = "none";
    el.style.height = "auto";
    el.style.width = "max-content";
  });
  clone.querySelectorAll(".timetable-table").forEach((el) => {
    el.style.width = "max-content";
    el.style.minWidth = "max-content";
  });

  const width = Math.ceil(clone.scrollWidth);
  const height = Math.ceil(clone.scrollHeight);

  return {
    target: clone,
    width,
    height,
    cleanup: () => {
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    },
  };
}

export default function TeacherDashboard({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState("");
  const [requestType, setRequestType] = useState("unavailable");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [preferredSlot, setPreferredSlot] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef(null);

  const loadTimetable = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await TimetableAPI.getTeacherTimetable();
      setData(res);
      if (!day && res.days?.length) setDay(res.days[0]);
      if (!slot && res.slots?.length) setSlot(res.slots[0]);
    } catch (err) {
      setError(err.message || "Unable to load timetable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimetable();
  }, []);

  const assignmentsBySlot = useMemo(() => {
    if (!data?.timetable) return new Set();
    return new Set(data.timetable.map((row) => `${row.day}__${row.slot}`));
  }, [data]);

  const timetablePayload = useMemo(() => {
    if (!data?.timetable) return null;
    return { timetable: data.timetable };
  }, [data]);

  const inputPayload = useMemo(() => {
    return {
      days: data?.days || [],
      slots: data?.slots || [],
      classes: data?.classes || [],
    };
  }, [data]);

  const submitReschedule = async () => {
    if (!day || !slot) return;
    if (requestType === "reslot_theory" && !preferredSlot) return;
    setMessage("");
    setError("");
    setSubmitting(true);
    try {
      const res = await TimetableAPI.requestTeacherReschedule(
        day,
        slot,
        requestType,
        requestType === "reslot_theory" ? preferredSlot : null
      );
      if (res?.request?.id) {
        setMessage(`Request #${res.request.id} submitted for ${day} ${slot}.`);
      } else {
        setMessage(`Request submitted for ${day} ${slot}.`);
      }
    } catch (err) {
      setError(err.message || "Reschedule request failed");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const loadSlots = async () => {
      setAvailableSlots([]);
      setPreferredSlot("");
      if (requestType !== "reslot_theory") return;
      if (!day || !slot) return;
      if (!assignmentsBySlot.has(`${day}__${slot}`)) return;
      setLoadingSlots(true);
      setError("");
      try {
        const res = await TimetableAPI.getAvailableTheorySlots(day, slot);
        const slots = res?.availableSlots || [];
        setAvailableSlots(slots);
        if (slots.length) {
          setPreferredSlot(slots[0]);
        }
      } catch (err) {
        setError(err.message || "Unable to load available theory slots");
      } finally {
        setLoadingSlots(false);
      }
    };

    loadSlots();
  }, [requestType, day, slot, assignmentsBySlot]);

  const downloadPng = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    setError("");
    try {
      const html2canvas = await ensureHtml2Canvas();
      const exportNode = createExportClone(exportRef.current);

      const canvas = await html2canvas(exportNode.target, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        width: exportNode.width,
        height: exportNode.height,
        windowWidth: exportNode.width,
        windowHeight: exportNode.height,
        scrollX: 0,
        scrollY: 0,
      });
      exportNode.cleanup();

      downloadCanvasAsPng(canvas, "teacher-timetable.png");
    } catch (e) {
      setError(e.message || "Failed to export PNG");
    } finally {
      setExporting(false);
    }
  };

  const downloadPdf = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    setError("");
    try {
      const html2canvas = await ensureHtml2Canvas();
      const jsPDF = await ensureJsPdf();
      const exportNode = createExportClone(exportRef.current);

      const canvas = await html2canvas(exportNode.target, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        width: exportNode.width,
        height: exportNode.height,
        windowWidth: exportNode.width,
        windowHeight: exportNode.height,
        scrollX: 0,
        scrollY: 0,
      });
      exportNode.cleanup();

      const orientation = canvas.width > canvas.height ? "l" : "p";
      const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgData = canvas.toDataURL("image/png");
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
        heightLeft -= pageHeight;
      }

      pdf.save("teacher-timetable.pdf");
    } catch (e) {
      setError(e.message || "Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-6 bg-[radial-gradient(circle_at_top_right,#1e293b_0%,#0f172a_45%,#020617_100%)]">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="rounded-2xl border border-cyan-400/20 bg-slate-900/80 backdrop-blur p-4 sm:p-5 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Faculty Portal</p>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Teacher Dashboard</h1>
              <p className="text-sm text-slate-300">{user?.name || user?.username}</p>
            </div>
            <button onClick={onLogout} className="px-3 py-2 sm:px-4 rounded-lg bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400">
              Logout
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/75 p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-slate-100 mb-3">Reschedule Request</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Request Type</label>
              <select value={requestType} onChange={(e) => setRequestType(e.target.value)} className="border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2">
                <option value="unavailable">Teacher Unavailable</option>
                <option value="reslot_theory">Shift Theory Time</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Day</label>
              <select value={day} onChange={(e) => setDay(e.target.value)} className="border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2">
                {(data?.days || []).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Slot</label>
              <select value={slot} onChange={(e) => setSlot(e.target.value)} className="border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2">
                {(data?.slots || []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {requestType === "reslot_theory" && (
              <div>
                <label className="block text-sm text-slate-300 mb-1">Target Slot (same day)</label>
                <select
                  value={preferredSlot}
                  onChange={(e) => setPreferredSlot(e.target.value)}
                  className="border border-slate-600 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 min-w-44"
                  disabled={loadingSlots || !availableSlots.length}
                >
                  {!availableSlots.length ? (
                    <option value="">{loadingSlots ? "Loading..." : "No slot available"}</option>
                  ) : (
                    availableSlots.map((s) => <option key={s} value={s}>{s}</option>)
                  )}
                </select>
              </div>
            )}
            <button
              onClick={submitReschedule}
              disabled={
                submitting ||
                !assignmentsBySlot.has(`${day}__${slot}`) ||
                (requestType === "reslot_theory" && (!preferredSlot || loadingSlots))
              }
              className="px-4 py-2 rounded-lg bg-indigo-500 text-white font-semibold disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Request Reschedule"}
            </button>
          </div>
          {!assignmentsBySlot.has(`${day}__${slot}`) && (
            <p className="text-sm text-amber-300 mt-2">No class assigned for this day/slot.</p>
          )}
          {requestType === "reslot_theory" && assignmentsBySlot.has(`${day}__${slot}`) && !loadingSlots && !availableSlots.length && (
            <p className="text-sm text-amber-300 mt-2">No same-day theory slot is available for shift.</p>
          )}
          {message && <p className="text-sm text-emerald-300 mt-2">{message}</p>}
          {error && <p className="text-sm text-rose-300 mt-2">{error}</p>}
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-3 sm:p-4 md:p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold text-slate-100">My Timetable</h2>
            <div className="flex gap-2">
              <button
                onClick={downloadPng}
                disabled={loading || exporting || !data?.timetable?.length}
                className="px-3 py-2 rounded-lg bg-sky-500 text-slate-900 font-semibold disabled:opacity-50"
              >
                {exporting ? "Exporting..." : "Download PNG"}
              </button>
              <button
                onClick={downloadPdf}
                disabled={loading || !data?.timetable?.length}
                className="px-3 py-2 rounded-lg bg-indigo-500 text-white font-semibold disabled:opacity-50"
              >
                Download PDF
              </button>
            </div>
          </div>

          <div ref={exportRef}>
            {loading ? (
              <p className="text-slate-300">Loading timetable...</p>
            ) : error && !data ? (
              <p className="text-rose-300">{error}</p>
            ) : (
              <TimetableDisplay timetableData={timetablePayload} inputData={inputPayload} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



