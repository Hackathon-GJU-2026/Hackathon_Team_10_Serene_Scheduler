import React from "react";

export default function RoleTimetableTable({ days = [], slots = [], rows = [] }) {
  const grouped = rows.reduce((acc, row) => {
    const key = `${row.day}__${row.slot}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-950 shadow-xl">
      <table className="min-w-full border-collapse bg-slate-950 text-slate-100">
        <thead>
          <tr className="bg-slate-900">
            <th className="p-3 text-left text-sm font-semibold text-slate-200 border-b border-slate-700">Day / Slot</th>
            {slots.map((slot) => (
              <th key={slot} className="p-3 text-left text-sm font-semibold text-slate-200 border-b border-slate-700">
                {slot}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day} className="align-top bg-slate-950">
              <td className="p-3 font-semibold text-slate-200 border-b border-slate-700 bg-slate-900">{day}</td>
              {slots.map((slot) => {
                const entries = grouped[`${day}__${slot}`] || [];
                return (
                  <td key={`${day}-${slot}`} className="p-3 border-b border-slate-700 min-w-[180px] bg-slate-950">
                    {entries.length === 0 ? (
                      <span className="text-slate-400 text-sm">Free</span>
                    ) : (
                      <div className="space-y-2">
                        {entries.map((entry, idx) => (
                          <div
                            key={`${entry.subject}-${idx}`}
                            className={`rounded border p-2 ${
                              entry.moved
                                ? "border-amber-400/70 bg-amber-400/10"
                                : "border-slate-700 bg-slate-900"
                            }`}
                          >
                            <div className="font-semibold text-sm text-slate-100">{entry.subject}</div>
                            {entry.section && <div className="text-xs text-slate-300">Section: {entry.section}</div>}
                            {entry.room && <div className="text-xs text-slate-300">Room: {entry.room}</div>}
                            {entry.teacher && <div className="text-xs text-slate-300">Teacher: {entry.teacher}</div>}
                            {entry.moved && (
                              <div className="text-[11px] font-semibold text-amber-300 mt-1">
                                Updated by admin{entry.moved_from ? ` (moved from ${entry.moved_from})` : ""}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
