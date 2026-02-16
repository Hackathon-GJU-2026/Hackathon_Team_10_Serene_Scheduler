import React, { useEffect, useState } from "react";
import TimetableDisplay from "./TimetableDisplay";
import { TimetableAPI } from "../services/api-services";

const SAVEDTIMETABLEKEY = "savedtimetable";

export default function ViewTimetable() {
  const [timetableData, setTimetableData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  // Load saved timetable and inputData from localStorage on mount
  useEffect(() => {
    try {
      const savedJSON = localStorage.getItem(SAVEDTIMETABLEKEY);
      if (savedJSON) {
        const saved = JSON.parse(savedJSON);
        setTimetableData(saved);
      }
    } catch (err) {
      console.error("Error loading timetable:", err);
      setError("Failed to load saved timetable.");
    }
  }, []);

  // Reset teacher timetable for a specified day and slot
  const handleResetTeacher = async (teacher, day, slot) => {
    if (!timetableData || !timetableData.timetable) return;

    const confirmed = window.confirm(
      `Are you sure you want to reset timetable for "${teacher}" on ${day} during ${slot}?`
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);

    try {
      // Call API
      console.log("Resetting:", teacher, day, slot, timetableData.timetable);
      const resetResult = await TimetableAPI.resetTeacher(
        timetableData.inputData,
        timetableData.timetable,
        teacher,
        day,
        slot
      );
      console.log("API returned:", resetResult);
      if (resetResult && resetResult.timetable) {
        // Update data object
        const updated = {
          ...timetableData,
          timetable: resetResult.timetable,
          savedAt: new Date().toISOString(),
          name: timetableData.name || "Untitled",
        };
        setTimetableData(updated);
        localStorage.setItem(SAVEDTIMETABLEKEY, JSON.stringify(updated));

        setNotification({ type: "success", message: `Reset ${teacher} successfully.` });
      } else {
        setError("No updated timetable returned.");
      }
    } catch (err) {
      console.error("Reset error:", err);
      setError("An error occurred while resetting.");
    } finally {
      setLoading(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // Save current timetable (unchanged) back to localStorage
  const saveCurrentTimetable = () => {
    if (!timetableData || !timetableData.inputData) return;

    try {
      const completeData = {
        ...timetableData,
        inputData: timetableData.inputData,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(SAVEDTIMETABLEKEY, JSON.stringify(completeData));
      setNotification({ type: "success", message: "Timetable saved successfully." });
    } catch (e) {
      console.error("Save error:", e);
      setError("Failed to save timetable.");
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  if (error) {
    return (
      <div className="p-6 bg-red-100 rounded text-red-700">
        <strong>Error:</strong> {error}
      </div>
    );
  }

  if (!timetableData) {
    return (
      <div className="p-6 text-gray-700">
        No saved timetable found. Generate and save one first.
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto p-8 bg-white rounded-lg shadow-md">
      <h2 className="text-3xl font-bold mb-6">
        View Timetable: {timetableData.name || "Untitled"}
      </h2>

      {notification && (
        <div
          role="alert"
          className={
            notification.type === "success"
              ? "mb-4 p-4 bg-green-100 text-green-800 rounded"
              : "mb-4 p-4 bg-red-100 text-red-800 rounded"
          }
        >
          {notification.message}
        </div>
      )}

      <div className="mb-4">
        <button
          onClick={saveCurrentTimetable}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          disabled={loading}
        >
          Save Timetable
        </button>
      </div>

      <TimetableDisplay
        timetableData={timetableData.timetable}
        inputData={timetableData.inputData}
        loading={loading}
        onResetTeacher={handleResetTeacher}
      />
    </div>
  );
}
