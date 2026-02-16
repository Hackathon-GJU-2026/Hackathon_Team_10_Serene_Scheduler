const MENU_ITEMS = [
  { id: "generate", label: "Generate Timetable", short: "GT" },
  { id: "dashboard", label: "View Timetable", short: "VT" },
  { id: "events", label: "Handling Events", short: "HE" },
  { id: "suggestions", label: "Review Suggestions", short: "RS" },
  { id: "objections", label: "Review Objections", short: "RO" },
];

function NavContent({ activePage, onSelect }) {
  return (
    <>
      <div className="flex items-center gap-3 pb-4 border-b border-slate-700">
        <img src="/image.png" alt="Serene Scheduler Logo" className="w-10 h-10 object-contain rounded-md" />
        <div className="min-w-0">
          <div className="text-base font-semibold text-slate-100 truncate">Serene Scheduler</div>
          <div className="text-xs text-slate-400">Academic Planner</div>
        </div>
      </div>

      <nav className="mt-4 flex-1 space-y-1">
        {MENU_ITEMS.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={isActive ? "page" : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive
                  ? "bg-slate-800 text-indigo-300 border border-slate-700"
                  : "text-slate-200 hover:bg-slate-800"
              }`}
            >
              <span
                className={`w-8 h-8 shrink-0 rounded-md flex items-center justify-center text-[11px] font-semibold ${
                  isActive ? "bg-indigo-500/20 text-indigo-300" : "bg-slate-700 text-slate-300"
                }`}
              >
                {item.short}
              </span>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

export default function Sidebar({ setActivePage, activePage, mobileNavOpen, setMobileNavOpen }) {
  const handleSelect = (id) => {
    setActivePage(id);
    setMobileNavOpen(false);
  };

  return (
    <>
      <aside className="hidden md:flex md:w-72 lg:w-80 md:shrink-0 bg-slate-900 border-r border-slate-800 p-4 md:p-5 flex-col">
        <NavContent activePage={activePage} onSelect={handleSelect} />
      </aside>

      <div
        className={`md:hidden fixed inset-0 z-40 transition ${
          mobileNavOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
          className={`absolute inset-0 bg-black/55 transition-opacity duration-200 ${
            mobileNavOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        <aside
          className={`absolute left-0 top-0 h-full w-72 max-w-[86vw] bg-slate-900 border-r border-slate-800 p-4 flex flex-col transition-transform duration-200 ease-out ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-300">Menu</span>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="px-2 py-1 text-xs rounded-md border border-slate-600 text-slate-200"
            >
              Close
            </button>
          </div>
          <div className="mt-3 flex-1 min-h-0">
            <NavContent activePage={activePage} onSelect={handleSelect} />
          </div>
        </aside>
      </div>
    </>
  );
}
