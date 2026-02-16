// src/GenerateTimetable.jsx
import { useState, useRef } from "react";
import TimetableInputForm from "./TimetableInputForm";
import MultipleTimetableGenerator from "./MultipleTimetableGenerator";
import TimetableDisplay from "./TimetableDisplay";
import "./GenerateTimetable.css";
import "./TimetableInputForm.css";
import "./MultipleTimetableGenerator.css";
import "./TimetableDisplay.css";

const STORAGE_KEY = "as_timetable_input_v1";

const TABS = [
  { id: "class", label: "Class" },
  { id: "subject", label: "Subject" },
  { id: "teacher", label: "Teacher" },
  { id: "rooms", label: "Rooms" },
  { id: "slots", label: "Timetable Slots" },
  { id: "constraints", label: "Constraints" },
  { id: "unavailability", label: "Unavailability" },
];

function normalizeImportedData(parsed) {
  const DEFAULTS = {
    classes: [],
    rooms: [],
    labs: [],
    lab_rooms: {},
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    slots: [],
    teachers: {},
    lab_teachers: {},
    teacher_unavailability: {},
    lecture_requirements: {},
    lab_capacity: 30,
    constraints: {
      max_lectures_per_day: 5,
      max_lectures_per_subject: 2,
      min_lectures_per_section: 4,
      max_lectures_per_section: 6,
      lab_duration: 2,
      distribute_weekly: true,
    },
  };
  const out = { ...DEFAULTS, ...(parsed || {}) };
  out.classes = Array.isArray(out.classes)
    ? out.classes.map((c) => ({
        name: String(c?.name || "").trim(),
        subjects: Array.isArray(c?.subjects) ? c.subjects.map(String).filter(Boolean) : [],
        lab_subjects: Array.isArray(c?.lab_subjects) ? c.lab_subjects.map(String).filter(Boolean) : [],
        sections: Array.isArray(c?.sections)
          ? c.sections.map((s) =>
              typeof s === "object"
                ? { name: String(s.name || "").trim(), student_count: Number(s.student_count || 0) }
                : { name: String(s || ""), student_count: 0 }
            )
          : [{ name: "A", student_count: 0 }],
      }))
    : [];
  out.rooms = Array.isArray(out.rooms) ? out.rooms.map(String).filter(Boolean) : [];
  out.labs = Array.isArray(out.labs) ? out.labs.map(String).filter(Boolean) : [];
  if (out.lab_rooms && typeof out.lab_rooms === "object" && !Array.isArray(out.lab_rooms)) {
    const nr = {};
    Object.entries(out.lab_rooms).forEach(([lab, rooms]) => {
      nr[String(lab)] = Array.isArray(rooms) ? rooms.map(String).filter(Boolean) : [];
    });
    out.lab_rooms = nr;
  } else out.lab_rooms = {};
  out.slots = Array.isArray(out.slots) ? out.slots.map(String).filter(Boolean) : [];
  if (!out.slots.length) {
    for (let i = 0; i < 5; i++) out.slots.push(`0${9 + i}:00-${0 + 10 + i}:00`);
  }
  out.teachers = typeof out.teachers === "object" && !Array.isArray(out.teachers)
    ? Object.fromEntries(Object.entries(out.teachers).map(([k, v]) => [String(k), Array.isArray(v) ? v.map(String).filter(Boolean) : []]))
    : {};
  out.lab_teachers = typeof out.lab_teachers === "object" && !Array.isArray(out.lab_teachers)
    ? Object.fromEntries(Object.entries(out.lab_teachers).map(([k, v]) => [String(k), Array.isArray(v) ? v.map(String).filter(Boolean) : []]))
    : {};
  out.teacher_unavailability = typeof out.teacher_unavailability === "object" && !Array.isArray(out.teacher_unavailability)
    ? Object.fromEntries(
        Object.entries(out.teacher_unavailability).map(([t, arr]) => [
          t,
          Array.isArray(arr) ? arr.map((u) => ({ day: String(u?.day || ""), slot: String(u?.slot || "") })).filter((x) => x.day && x.slot) : [],
        ])
      )
    : {};
  out.lecture_requirements = typeof out.lecture_requirements === "object" && !Array.isArray(out.lecture_requirements)
    ? Object.fromEntries(Object.entries(out.lecture_requirements).map(([k, v]) => [String(k), Number(v) || 0]))
    : {};
  out.lab_capacity = Number(out.lab_capacity) || 30;
  out.constraints = { ...DEFAULTS.constraints, ...(out.constraints || {}) };
  return out;
}

function validateData(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object") errors.push("Invalid data");
  else {
    if (!Array.isArray(obj.classes) || obj.classes.length === 0) errors.push("Classes missing");
    if (!Array.isArray(obj.rooms)) errors.push("Rooms missing");
    if (!Array.isArray(obj.labs)) errors.push("Labs missing");
    if (!Array.isArray(obj.slots) || obj.slots.length === 0) errors.push("Slots missing");
    if (!Array.isArray(obj.days) || obj.days.length === 0) errors.push("Days missing");
    if (typeof obj.teachers !== "object") errors.push("Teachers missing");
    if (typeof obj.lab_teachers !== "object") errors.push("Lab teachers missing");
    if (typeof obj.teacher_unavailability !== "object") errors.push("Teacher unavailability missing");
    if (typeof obj.lecture_requirements !== "object") errors.push("Lecture requirements missing");
  }
  return errors;
}

export default function GenerateTimetable() {
  const [active, setActive] = useState("class");
  const [reloadKey, setReloadKey] = useState(0);
  const [multipleData, setMultipleData] = useState(null);
  const [singleData, setSingleData] = useState(null);
  const fileInputRef = useRef(null);

  function onImportClick() {
    if (fileInputRef.current) fileInputRef.current.value = null;
    fileInputRef.current?.click();
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const normalized = normalizeImportedData(parsed);
        const errors = validateData(normalized);
        if (errors.length > 0) {
          alert("Import Errors:\n" + errors.join("\n"));
          return;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        setReloadKey((v) => v + 1);
        alert("Import Successful");
      } catch (ex) {
        alert("Failed to parse JSON");
      }
    };
    reader.readAsText(file, "utf8");
  }

  function onExportClick() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) {
        alert("No data to export");
        return;
      }
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "timetable_config.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (ex) {
      alert("Export failed");
    }
  }

  function onClearClick() {
    localStorage.removeItem(STORAGE_KEY);
    setReloadKey((v) => v + 1);
    setMultipleData(null);
    setSingleData(null);
    setActive("class");
  }

  function onGenerateMultiple(data) {
    setMultipleData(data);
    setActive("generate-multiple");
  }

  function onGenerateSingle(data) {
    setSingleData(data);
    setActive("generate-single");
  }

  return (
    <div className="generate-page">
      <h2 className="generate-title">Generate Timetable</h2>
      <div className="generate-toolbar">
        <div className="generate-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tool-btn tool-btn--tab ${active === tab.id ? "is-active" : ""}`}
              onClick={() => setActive(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="generate-actions">
          <button className="tool-btn tool-btn--danger" onClick={onClearClick}>
            Clear Form
          </button>
          <button className="tool-btn tool-btn--neutral" onClick={onImportClick}>
            Import JSON
          </button>
          <button className="tool-btn tool-btn--neutral" onClick={onExportClick}>
            Export JSON
          </button>
          <button
            className={`tool-btn tool-btn--primary ${active === null ? "is-active" : ""}`}
            onClick={() => setActive(null)}
          >
            Show All
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={onFileChange}
        />
      </div>

      <div className="content-area">
        {(active === "class" ||
          active === "subject" ||
          active === "teacher" ||
          active === "rooms" ||
          active === "slots" ||
          active === "constraints" ||
          active === "unavailability" ||
          active === null) && (
          <TimetableInputForm
            key={reloadKey}
            visibleSection={active}
            onGenerateMultipleTimetables={onGenerateMultiple}
            onGenerateSingleTimetable={onGenerateSingle}
          />
        )}
        {active === "generate-multiple" && multipleData && (
          <MultipleTimetableGenerator inputData={multipleData} />
        )}
        {active === "generate-single" && singleData && (
          <TimetableDisplay inputData={singleData} />
        )}
      </div>

      <footer>© 2025 Smart Scheduler</footer>
    </div>
  );
}
