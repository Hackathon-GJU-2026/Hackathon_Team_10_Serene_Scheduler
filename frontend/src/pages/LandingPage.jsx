import "./LandingPage.css";

export default function LandingPage({ onLoginClick, onRegisterClick }) {
  return (
    <div className="landing-root text-slate-100">
      <header className="flex w-full items-center justify-between px-5 py-6 sm:px-10">
        <div>
          <p className="landing-eyebrow uppercase text-cyan-300">Smart Academic Platform</p>
          <h1 className="landing-brand-title mt-1 font-bold" style={{ fontFamily: "Georgia, serif" }}>
            Serene Scheduler
          </h1>
        </div>

        <div className="landing-auth-actions flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onLoginClick}
            className="rounded-xl border border-cyan-300/50 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200 hover:bg-slate-800"
          >
            Login
          </button>
          <button
            type="button"
            onClick={onRegisterClick}
            className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300"
          >
            Register
          </button>
        </div>
      </header>

      <main className="w-full px-5 pb-14 sm:px-10">
        <section className="landing-hero relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-slate-900/65 p-8 shadow-2xl sm:p-14">
          <div className="absolute -right-10 -top-10 h-52 w-52 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute -left-8 bottom-0 h-40 w-40 rounded-full bg-indigo-500/20 blur-3xl" />

          <h2 className="landing-title-gradient landing-main-title relative max-w-6xl font-bold">
            Build Better Timetables.
            <br />
            Run College Schedules Without Chaos.
          </h2>
          <p className="landing-hero-copy relative mt-6 text-slate-300">
            Serene Scheduler helps admins, teachers, and students manage timetable creation, publishing, and real-time
            updates from one platform. Fast approvals, fewer clashes, and smooth daily operations.
          </p>

          <div className="landing-hero-actions relative mt-9 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={onRegisterClick}
              className="landing-hero-btn rounded-xl bg-cyan-400 px-7 py-3 text-lg font-semibold text-slate-900 transition hover:bg-cyan-300"
            >
              Join Us
            </button>
            <button
              type="button"
              onClick={onLoginClick}
              className="landing-hero-btn rounded-xl border border-cyan-300/55 bg-slate-900/75 px-7 py-3 text-lg font-semibold text-cyan-100 transition hover:bg-slate-800"
            >
              Connect Us
            </button>
          </div>

          <div className="relative mt-10 grid gap-3 sm:grid-cols-3">
            <div className="landing-chip rounded-2xl border border-slate-700 bg-slate-900/60 p-6 text-slate-300">
              <p className="landing-chip-title">Admin Control</p>
              <p>Generate and publish stable weekly schedules in minutes.</p>
            </div>
            <div className="landing-chip rounded-2xl border border-slate-700 bg-slate-900/60 p-6 text-slate-300">
              <p className="landing-chip-title">Teacher Flow</p>
              <p>Quick reschedule requests with clear approval workflow.</p>
            </div>
            <div className="landing-chip rounded-2xl border border-slate-700 bg-slate-900/60 p-6 text-slate-300">
              <p className="landing-chip-title">Student Clarity</p>
              <p>Always view latest published timetable without confusion.</p>
            </div>
          </div>
        </section>

        <section className="mt-7 grid gap-4 md:grid-cols-3">
          <article className="landing-card rounded-2xl border border-slate-700 bg-slate-900/75 p-6">
            <h3 className="font-bold text-cyan-200">Why Use Serene?</h3>
            <p className="mt-2 leading-relaxed text-slate-300">
              It reduces manual coordination, avoids scheduling mistakes, and gives one reliable source of truth for everyone.
            </p>
          </article>

          <article className="landing-card rounded-2xl border border-slate-700 bg-slate-900/75 p-6">
            <h3 className="font-bold text-cyan-200">Core Features</h3>
            <ul className="mt-3 space-y-2 text-slate-300">
              <li>Role-based dashboards for Admin, Teacher, and Student</li>
              <li>Generate, publish, and review timetable versions</li>
              <li>Teacher reschedule requests with admin approval flow</li>
              <li>Student view always shows latest published timetable</li>
              <li>Email-based verification support during registration</li>
            </ul>
          </article>

          <article className="landing-card rounded-2xl border border-slate-700 bg-slate-900/75 p-6">
            <h3 className="font-bold text-cyan-200">Useful For</h3>
            <p className="mt-2 leading-relaxed text-slate-300">
              Colleges and departments that need quick timetable updates, clear accountability, and less operational stress.
            </p>
          </article>
        </section>

        <section className="relative mt-8 min-h-screen overflow-hidden rounded-3xl border border-cyan-400/20 bg-slate-900/70 p-7 shadow-2xl sm:p-12">
          <div className="absolute -left-16 top-12 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="absolute -right-8 bottom-10 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />

          <p className="relative text-xs uppercase tracking-[0.24em] text-cyan-300">Serene Experience</p>
          <h3 className="landing-title-gradient landing-lower-title relative mt-3 max-w-5xl font-bold">
            One Platform.
            <br />
            Complete Scheduling Control.
          </h3>
          <p className="landing-lower-copy relative mt-6 text-slate-300">
            From generating clash-free timetables to managing teacher requests and publishing live updates, Serene keeps
            every role aligned. It is designed for real college operations, not just demo screens.
          </p>

          <div className="relative mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="landing-card landing-stat-card rounded-2xl border border-slate-700 bg-slate-900/70">
              <p className="landing-stat-title">100%</p>
              <p className="landing-stat-copy">Role-based flow for Admin, Teacher, Student</p>
            </div>
            <div className="landing-card landing-stat-card rounded-2xl border border-slate-700 bg-slate-900/70">
              <p className="landing-stat-title">Fast</p>
              <p className="landing-stat-copy">Generate and publish within minutes</p>
            </div>
            <div className="landing-card landing-stat-card rounded-2xl border border-slate-700 bg-slate-900/70">
              <p className="landing-stat-title">Live</p>
              <p className="landing-stat-copy">Latest timetable visible instantly to users</p>
            </div>
            <div className="landing-card landing-stat-card rounded-2xl border border-slate-700 bg-slate-900/70">
              <p className="landing-stat-title">Secure</p>
              <p className="landing-stat-copy">Email verification and managed approvals</p>
            </div>
          </div>

          <div className="landing-connect-wrap relative">
            <button type="button" onClick={onLoginClick} className="landing-connect-btn">
              Connect Us
            </button>
          </div>
        </section>

        <footer className="mt-8 rounded-2xl border border-slate-700/90 bg-slate-950/70 px-5 py-4 text-center text-sm text-slate-300 sm:text-base">
          &copy; 2026 Serene Scheduler. Built for better academic planning.
        </footer>
      </main>
    </div>
  );
}

