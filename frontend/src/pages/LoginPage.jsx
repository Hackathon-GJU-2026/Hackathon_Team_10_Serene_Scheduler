import { useEffect, useState } from "react";
import { TimetableAPI } from "../services/api-services";

const initialRegisterForm = {
  role: "student",
  name: "",
  username: "",
  password: "",
  email: "",
  section_stream: "CSE",
  section_semester: "6th",
  section_batch: "Batch-1",
  teacher_name: "",
};

export default function LoginPage({ onLogin, initialMode = "login", onBackToLanding }) {
  const [mode, setMode] = useState(initialMode === "register" ? "register" : "login");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [registerForm, setRegisterForm] = useState(initialRegisterForm);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [registerMessage, setRegisterMessage] = useState("");

  const [verificationCode, setVerificationCode] = useState("");
  const [registrationId, setRegistrationId] = useState(null);
  const [codePreview, setCodePreview] = useState("");

  useEffect(() => {
    setMode(initialMode === "register" ? "register" : "login");
  }, [initialMode]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await TimetableAPI.login(username.trim(), password);
      onLogin(result.user);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const updateRegisterForm = (field, value) => {
    setRegisterForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRegisterStart = async (e) => {
    e.preventDefault();
    setRegisterError("");
    setRegisterMessage("");
    setCodePreview("");
    setRegisterLoading(true);

    try {
      const payload = {
        role: registerForm.role,
        name: registerForm.name.trim(),
        username: registerForm.username.trim(),
        password: registerForm.password,
        email: registerForm.email.trim(),
      };

      if (registerForm.role === "student") {
        const stream = registerForm.section_stream.trim();
        const semester = registerForm.section_semester.trim();
        const batch = stream === "CSE" ? (registerForm.section_batch.trim() || "Batch-1") : "";
        const division = "A";
        payload.stream = stream;
        payload.semester = semester;
        payload.batch = batch;
        payload.division = division;
      }

      if (registerForm.role === "teacher") {
        payload.teacher_name = (registerForm.teacher_name || registerForm.name).trim();
      }

      const res = await TimetableAPI.registerStart(payload);
      setRegistrationId(res.registration_id);
      setRegisterMessage(res.message || "Verification code sent.");
      if (res.verification_code_preview) {
        setCodePreview(res.verification_code_preview);
      }
    } catch (err) {
      setRegisterError(err.message || "Registration failed");
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (!registrationId) {
      setRegisterError("Start registration first.");
      return;
    }

    setRegisterError("");
    setRegisterMessage("");
    setRegisterLoading(true);

    try {
      const res = await TimetableAPI.registerVerify(registrationId, verificationCode.trim());
      if (res.status === "approved") {
        setRegisterMessage("Registration approved. Please login with your new account.");
      } else if (res.status === "pending_admin_approval") {
        setRegisterMessage("Email verified. Your teacher account is pending admin approval.");
      } else {
        setRegisterMessage(res.message || "Verification completed.");
      }
    } catch (err) {
      setRegisterError(err.message || "Verification failed");
    } finally {
      setRegisterLoading(false);
    }
  };

  const showVerification = mode === "register" && registrationId;

  const inputClass =
    "w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-3 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2937_0%,#0f172a_45%,#020617_100%)] p-4 sm:p-7 md:p-10">
      <div className="mx-auto grid w-full max-w-7xl gap-7 md:grid-cols-[1.12fr_1fr]">
        <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-slate-900/70 p-8 shadow-2xl sm:p-10">
          <div className="absolute -right-12 -top-12 h-52 w-52 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="absolute -left-12 bottom-0 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl" />
          <p className="relative text-xs uppercase tracking-[0.25em] text-cyan-300">Academic Timetable Platform</p>
          <h1 className="relative mt-3 text-4xl font-bold text-slate-100 sm:text-5xl" style={{ fontFamily: "Georgia, serif" }}>
            Serene Scheduler
          </h1>
          <p className="relative mt-5 max-w-xl text-slate-300">
            Build, publish, and manage dynamic class schedules with role-based access for Admin, Teacher, and Student.
            Keep daily operations smooth with temporary schedule changes, visibility controls, and clear approvals.
          </p>
          <div className="relative mt-7 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/85 p-4">
              <p className="font-semibold text-cyan-200">Admin</p>
              <p className="mt-1.5 text-slate-400">Create, publish, edit, and discard timetable versions.</p>
            </div>
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/85 p-4">
              <p className="font-semibold text-cyan-200">Teacher</p>
              <p className="mt-1.5 text-slate-400">Request unavailable or shift theory class in same day.</p>
            </div>
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/85 p-4">
              <p className="font-semibold text-cyan-200">Student</p>
              <p className="mt-1.5 text-slate-400">Access updated published timetable instantly.</p>
            </div>
          </div>

          <div className="relative mt-7 rounded-2xl border border-slate-700/80 bg-slate-950/60 p-4">
            <p className="text-sm font-semibold text-slate-200">How it works</p>
            <div className="mt-3 grid gap-2 text-sm text-slate-400">
              <p><span className="font-semibold text-cyan-200">1.</span> Admin publishes the active weekly timetable.</p>
              <p><span className="font-semibold text-cyan-200">2.</span> Teachers raise day-specific change requests when needed.</p>
              <p><span className="font-semibold text-cyan-200">3.</span> Students and teachers see the latest approved view.</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-6 shadow-2xl sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">Secure Access</p>
              <p className="mt-1 text-sm text-slate-400">Login or create your account to continue.</p>
            </div>
            {onBackToLanding && (
              <button
                type="button"
                onClick={onBackToLanding}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-300 hover:text-cyan-200"
              >
                Back to Home
              </button>
            )}
          </div>

          <div className="mb-7 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`rounded-xl border py-2.5 font-semibold transition ${
                mode === "login"
                  ? "border-cyan-400 bg-cyan-500 text-slate-900"
                  : "border-slate-700 bg-slate-800 text-slate-200"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setRegisterError("");
              }}
              className={`rounded-xl border py-2.5 font-semibold transition ${
                mode === "register"
                  ? "border-cyan-400 bg-cyan-500 text-slate-900"
                  : "border-slate-700 bg-slate-800 text-slate-200"
              }`}
            >
              Register
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-1">
              <h2 className="text-2xl font-bold text-slate-100">Welcome Back</h2>
              <p className="mb-6 text-sm text-slate-400">Sign in to continue to Serene Scheduler.</p>

              <label className="mb-1.5 block text-sm font-semibold text-slate-300">Username</label>
              <input
                className={`${inputClass} mb-5`}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />

              <label className="mb-1.5 block text-sm font-semibold text-slate-300">Password</label>
              <input
                type="password"
                className={`${inputClass} mb-5`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />

              {error && <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-900/30 p-2 text-sm text-rose-200">{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-cyan-500 py-3 font-semibold text-slate-900 transition hover:bg-cyan-400 disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>

              <div className="mt-4 text-xs text-slate-400">
                Default admin: <span className="font-mono text-slate-300">admin / admin123</span>
              </div>
            </form>
          ) : (
            <>
              <form onSubmit={handleRegisterStart} className="space-y-4">
                <h2 className="text-2xl font-bold text-slate-100">Create Account</h2>
                <p className="text-sm text-slate-400">Students are auto-approved after email verification. Teachers require admin approval.</p>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-300">Role</label>
                  <select
                    value={registerForm.role}
                    onChange={(e) => updateRegisterForm("role", e.target.value)}
                    className={inputClass}
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-300">Full Name</label>
                  <input className={inputClass} value={registerForm.name} onChange={(e) => updateRegisterForm("name", e.target.value)} required />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-300">Username</label>
                  <input className={inputClass} value={registerForm.username} onChange={(e) => updateRegisterForm("username", e.target.value)} required />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-300">Email</label>
                  <input type="email" className={inputClass} value={registerForm.email} onChange={(e) => updateRegisterForm("email", e.target.value)} required />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-300">Password</label>
                  <input type="password" className={inputClass} value={registerForm.password} onChange={(e) => updateRegisterForm("password", e.target.value)} required />
                </div>

                {registerForm.role === "student" ? (
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-300">Section Details</label>
                    <div className="space-y-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-400">Stream</label>
                        <select
                          className={inputClass}
                          value={registerForm.section_stream}
                          onChange={(e) => {
                            const next = e.target.value;
                            updateRegisterForm("section_stream", next);
                            if (next !== "CSE") {
                              updateRegisterForm("section_batch", "");
                            } else if (!registerForm.section_batch) {
                              updateRegisterForm("section_batch", "Batch-1");
                            }
                          }}
                        >
                          <option value="CSE">CSE</option>
                          <option value="AI&ML">AI &amp; ML</option>
                          <option value="IT">IT</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-400">Semester</label>
                        <input
                          className={inputClass}
                          placeholder="7th"
                          value={registerForm.section_semester}
                          onChange={(e) => updateRegisterForm("section_semester", e.target.value)}
                          required
                        />
                      </div>
                      {registerForm.section_stream === "CSE" && (
                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-400">Batch</label>
                          <select
                            className={inputClass}
                            value={registerForm.section_batch}
                            onChange={(e) => updateRegisterForm("section_batch", e.target.value)}
                          >
                            <option value="Batch-1">Batch-1</option>
                            <option value="Batch-2">Batch-2</option>
                          </select>
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Preview: {registerForm.section_stream === "CSE"
                        ? `B.TECH CSE ${(registerForm.section_semester || "6th").toUpperCase()} Sem ${registerForm.section_batch || "Batch-1"} - A`
                        : registerForm.section_stream === "IT"
                          ? `B.TECH IT ${(registerForm.section_semester || "6th").toUpperCase()} Sem - A`
                          : `AI & ML ${registerForm.section_semester || "6th"} Sem - A`}
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-300">Teacher Display Name</label>
                    <input
                      className={inputClass}
                      placeholder="Example: Dr. Chander"
                      value={registerForm.teacher_name}
                      onChange={(e) => updateRegisterForm("teacher_name", e.target.value)}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={registerLoading}
                  className="w-full rounded-xl bg-cyan-500 py-3 font-semibold text-slate-900 transition hover:bg-cyan-400 disabled:opacity-60"
                >
                  {registerLoading ? "Submitting..." : "Register and Send Code"}
                </button>
              </form>

              {showVerification && (
                <form onSubmit={handleVerifyCode} className="mt-4 space-y-3 border-t border-slate-700 pt-4">
                  <h3 className="text-lg font-semibold text-slate-100">Verify Email</h3>
                  <label className="mb-1 block text-sm font-semibold text-slate-300">Verification Code</label>
                  <input className={inputClass} value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} required />
                  <button
                    type="submit"
                    disabled={registerLoading}
                    className="w-full rounded-xl bg-emerald-500 py-2.5 font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {registerLoading ? "Verifying..." : "Verify Code"}
                  </button>
                  {codePreview && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-900/30 p-2 text-xs text-amber-200">
                      Dev code preview: <span className="font-mono">{codePreview}</span>
                    </div>
                  )}
                </form>
              )}

              {registerError && <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-900/30 p-2 text-sm text-rose-200">{registerError}</div>}
              {registerMessage && <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-900/30 p-2 text-sm text-emerald-200">{registerMessage}</div>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}


