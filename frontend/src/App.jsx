import { useEffect, useState } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import Dashboard from "./pages/Dashboard";
import GenerateTimetable from "./pages/GenerateTimetable";
import HandlingEvents from "./pages/HandlingEvents";
import ReviewSuggestions from "./pages/ReviewSuggestions";
import ReviewObjections from "./pages/ReviewObjections";
import LoginPage from "./pages/LoginPage";
import LandingPage from "./pages/LandingPage";
import TeacherDashboard from "./pages/TeacherDashboard";
import StudentDashboard from "./pages/StudentDashboard";
import { TimetableAPI } from "./services/api-services";

const TAB_AUTH_KEY = "serene_tab_authenticated";
const ADMIN_PAGES = new Set(["dashboard", "generate", "events", "suggestions", "objections"]);
const PUBLIC_PAGES = new Set(["landing", "login", "register"]);

function getPageFromHash() {
  const raw = (window.location.hash || "").replace(/^#\/?/, "").trim().toLowerCase();
  if (ADMIN_PAGES.has(raw)) return raw;
  return "dashboard";
}

function setHashForPage(page) {
  const next = ADMIN_PAGES.has(page) ? page : "dashboard";
  const targetHash = `#/${next}`;
  if (window.location.hash !== targetHash) {
    window.location.hash = targetHash;
  }
}

function getPublicPageFromHash() {
  const raw = (window.location.hash || "").replace(/^#\/?/, "").trim().toLowerCase();
  if (PUBLIC_PAGES.has(raw)) return raw;
  return "landing";
}

function setHashForPublicPage(page) {
  const next = PUBLIC_PAGES.has(page) ? page : "landing";
  const targetHash = `#/${next}`;
  if (window.location.hash !== targetHash) {
    window.location.hash = targetHash;
  }
}

function AdminApp({ user, onLogout }) {
  const [activePage, setActivePage] = useState(() => getPageFromHash());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => {
      setActivePage(getPageFromHash());
      setMobileNavOpen(false);
    };

    if (!window.location.hash) {
      setHashForPage(activePage);
    }

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigateToPage = (page) => {
    setHashForPage(page);
    setActivePage(getPageFromHash());
    setMobileNavOpen(false);
  };

  return (
    <div className="app-shell min-h-screen bg-gradient-to-br from-slate-900 to-slate-950">
      <div className="flex min-h-screen">
        <Sidebar
          setActivePage={navigateToPage}
          activePage={activePage}
          mobileNavOpen={mobileNavOpen}
          setMobileNavOpen={setMobileNavOpen}
        />

        <div className="flex-1 min-w-0 flex flex-col min-h-screen">
          <Topbar user={user} onLogout={onLogout} onOpenMobileNav={() => setMobileNavOpen(true)} />

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-[1500px] mx-auto p-3 md:p-6">
              {activePage === "dashboard" && <Dashboard setActivePage={navigateToPage} />}
              {activePage === "generate" && <GenerateTimetable />}
              {activePage === "events" && <HandlingEvents />}
              {activePage === "suggestions" && <ReviewSuggestions />}
              {activePage === "objections" && <ReviewObjections />}
            </div>
          </main>

          <footer className="text-center py-2 text-xs md:text-sm text-slate-400 border-t border-slate-700 bg-slate-900/90">
            &copy; {new Date().getFullYear()} Serene Scheduler
          </footer>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [publicPage, setPublicPage] = useState(() => getPublicPageFromHash());

  const restoreSessionForTab = async () => {
    const shouldRestore = sessionStorage.getItem(TAB_AUTH_KEY) === "1";
    if (!shouldRestore) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await TimetableAPI.me();
      if (res.authenticated && res.user) {
        setUser(res.user);
      } else {
        setUser(null);
        sessionStorage.removeItem(TAB_AUTH_KEY);
      }
    } catch {
      setUser(null);
      sessionStorage.removeItem(TAB_AUTH_KEY);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    restoreSessionForTab();
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setPublicPage(getPublicPageFromHash());
    };

    if (!window.location.hash) {
      setHashForPublicPage("landing");
    } else {
      setPublicPage(getPublicPageFromHash());
    }

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const handleLogin = (loggedInUser) => {
    setUser(loggedInUser);
    sessionStorage.setItem(TAB_AUTH_KEY, "1");
  };

  const handleLogout = async () => {
    try {
      await TimetableAPI.logout();
    } catch {
      // Ignore logout API errors and clear UI session.
    } finally {
      setUser(null);
      sessionStorage.removeItem(TAB_AUTH_KEY);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-700">Loading...</div>;
  }

  if (!user) {
    if (publicPage === "login" || publicPage === "register") {
      return (
        <LoginPage
          onLogin={handleLogin}
          initialMode={publicPage === "register" ? "register" : "login"}
          onBackToLanding={() => {
            setHashForPublicPage("landing");
            setPublicPage("landing");
          }}
        />
      );
    }

    return (
      <LandingPage
        onLoginClick={() => {
          setHashForPublicPage("login");
          setPublicPage("login");
        }}
        onRegisterClick={() => {
          setHashForPublicPage("register");
          setPublicPage("register");
        }}
      />
    );
  }

  if (user.role === "teacher") {
    return <TeacherDashboard user={user} onLogout={handleLogout} />;
  }

  if (user.role === "student") {
    return <StudentDashboard user={user} onLogout={handleLogout} />;
  }

  return <AdminApp user={user} onLogout={handleLogout} />;
}

