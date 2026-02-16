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

export default function StudentDashboard({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await TimetableAPI.getStudentTimetable();
        setData(res);
      } catch (err) {
        setError(err.message || "Unable to load timetable");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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

      downloadCanvasAsPng(canvas, "student-timetable.png");
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

      pdf.save("student-timetable.pdf");
    } catch (e) {
      setError(e.message || "Failed to export PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-6 bg-[radial-gradient(circle_at_top_left,#0b3a53_0%,#082f49_35%,#0f172a_100%)]">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="rounded-2xl border border-sky-300/20 bg-slate-900/80 backdrop-blur p-4 sm:p-5 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Student Portal</p>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Student Dashboard</h1>
              <p className="text-sm text-slate-300">{user?.name || user?.username}</p>
            </div>
            <button onClick={onLogout} className="px-3 py-2 sm:px-4 rounded-lg bg-sky-400 text-slate-900 font-semibold hover:bg-sky-300">
              Logout
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-3 sm:p-4 md:p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold text-slate-100">Published Timetable</h2>
            <div className="flex flex-wrap items-center gap-2">
              {data?.publishedAt && (
                <span className="text-xs font-medium px-2 py-1 rounded bg-sky-100 text-sky-700">
                  Updated: {new Date(data.publishedAt).toLocaleString()}
                </span>
              )}
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
            ) : error ? (
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



