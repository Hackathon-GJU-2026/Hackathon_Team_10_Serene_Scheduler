import { useState, useEffect } from "react";
import { TimetableAPI } from "../services/api-services";

const SLOT_OPTIONS = [
  "09:00-09:55", "09:55-10:50", "10:50-11:45",
  "11:45-12:40", "01:30-02:25", "02:25-03:20", "03:20-04:15",
];

const SAVED_TIMETABLE_KEY = "saved_timetable";

export default function HandlingEvents({ inputData }) {
  const [events, setEvents] = useState(() => {
    try {
      const saved = localStorage.getItem("as_events");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [timetable, setTimetable] = useState(() => {
    try {
      const saved = localStorage.getItem(SAVED_TIMETABLE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (!parsed || !Array.isArray(parsed.timetable)) return null;
      return parsed;
    } catch {
      return null;
    }
  });

  const [availableTeachers, setAvailableTeachers] = useState([]);
  const [form, setForm] = useState({
    name: "",
    day: "",
    teachers: [""],
    slots: [],
  });

  useEffect(() => {
    if (timetable?.timetable) {
      const teacherSet = new Set(timetable.timetable.map(i => i.teacher).filter(Boolean));
      setAvailableTeachers(Array.from(teacherSet));
    }
  }, [timetable]);

  useEffect(() => {
    localStorage.setItem("as_events", JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    if (timetable) localStorage.setItem(SAVED_TIMETABLE_KEY, JSON.stringify(timetable));
  }, [timetable]);

  function resetFields(fields) {
    setForm(prev => {
      const updated = { ...prev };
      fields.forEach(f => {
        updated[f] = Array.isArray(prev[f]) ? (f === "teachers" ? [""] : []) : "";
      });
      return updated;
    });
  }

  const handleTeacherChange = (idx, val) => {
    const copy = [...form.teachers];
    copy[idx] = val;
    setForm(f => ({ ...f, teachers: copy }));
  };

  const addTeacher = () => setForm(f => ({ ...f, teachers: [...f.teachers, ""] }));
  const removeTeacher = idx => setForm(f => ({ ...f, teachers: f.teachers.filter((_, i) => i !== idx) }));

  const toggleSlot = slot => setForm(f => {
    return {
      ...f,
      slots: f.slots.includes(slot) ? f.slots.filter(s => s !== slot) : [...f.slots, slot]
    };
  });

  const saveTimetableLocally = (tt, name) => {
    const completeData = { ...tt, inputData, savedAt: new Date().toISOString(), name };
    localStorage.setItem(SAVED_TIMETABLE_KEY, JSON.stringify(completeData));
    alert(`Timetable "${name}" saved!`);
  };

  const saveEvent = async () => {
    if (!form.name || !form.day || !form.teachers.length || !form.slots.length) {
      alert("Fill all required fields.");
      return;
    }
    const newEv = { id: Date.now(), ...form, teachers: form.teachers.filter(t => t.trim() !== "") };
    setEvents([newEv, ...events]);

    try {
      const resetCalls = [];
      newEv.teachers.forEach(teacher => {
        newEv.slots.forEach(slot => {
          resetCalls.push(
            TimetableAPI.resetTeacher(
              timetable?.inputData || inputData,
              timetable?.timetable || [],
              teacher,
              newEv.day,
              slot
            ).catch(e => {
              console.error(e);
              return null;
            })
          );
        });
      });
      const results = await Promise.all(resetCalls);
      const validResult = results.find(r => r && r.timetable);
      if (validResult) {
        setTimetable(validResult);
        saveTimetableLocally(validResult, newEv.name);
      } else {
        console.warn("No valid timetable returned from reset calls.");
      }
    } catch (e) {
      console.error("Reset error:", e);
    }
    resetFields(["name", "day", "teachers", "slots"]);
  };

  const deleteEvent = async (id) => {
    if (!window.confirm("Delete this event?")) return;
    const updatedEvents = events.filter(e => e.id !== id);
    setEvents(updatedEvents);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 px-6 mx-auto max-w-screen-xl">
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h3 className="text-lg font-medium mb-4">Add Meeting / Event</h3>
        <input
          type="text"
          placeholder="Meeting Name"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="w-full border rounded p-2 mb-4"
        />

        <select
          value={form.day}
          onChange={e => setForm(f => ({ ...f, day: e.target.value }))}
          className="w-full border rounded p-2 mb-4"
        >
          <option value="">Select Day</option>
          {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(d =>
            <option key={d} value={d}>{d}</option>
          )}
        </select>

        <div className="mb-4">
          <label className="font-medium mb-2">Teachers</label>
          {form.teachers.map((t, i) => (
            <div key={i} className="flex gap-2 mb-2 items-center">
              <input
                type="text"
                list="teachers-list"
                placeholder={`Teacher ${i + 1}`}
                value={t}
                onChange={e => handleTeacherChange(i, e.target.value)}
                className="flex-1 border rounded p-2"
              />
              {form.teachers.length > 1 && (
                <button
                  onClick={() => removeTeacher(i)}
                  className="px-2 bg-red-500 text-white rounded"
                  aria-label={`Remove Teacher ${i + 1}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <datalist id="teachers-list">
            {availableTeachers.map(t => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button onClick={addTeacher} className="text-indigo-600 hover:underline text-sm">+ Add Teacher</button>
        </div>

        <div className="mb-4">
          <label className="font-medium mb-2">Time Slots</label>
          <div className="grid grid-cols-2 gap-2">
            {SLOT_OPTIONS.map(slot => (
              <label key={slot} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.slots.includes(slot)}
                  onChange={() => toggleSlot(slot)}
                />
                {slot}
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={saveEvent}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Save Event
        </button>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4">Saved Events</h3>
        {events.length === 0 ? (
          <p className="text-gray-500">No events yet.</p>
        ) : (
          <ul className="space-y-3">
            {events.map(ev => (
              <li key={ev.id} className="bg-white p-4 rounded-lg shadow flex justify-between items-center">
                <div>
                  <h4 className="font-semibold text-indigo-700">{ev.name}</h4>
                  <p><strong>Day:</strong> {ev.day}</p>
                  <p><strong>Teachers:</strong> {ev.teachers.join(", ")}</p>
                  <p><strong>Slots:</strong> {ev.slots.join(", ")}</p>
                </div>
                <button
                  onClick={() => deleteEvent(ev.id)}
                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                  aria-label={`Delete event ${ev.name}`}
                  title={`Delete event ${ev.name}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
