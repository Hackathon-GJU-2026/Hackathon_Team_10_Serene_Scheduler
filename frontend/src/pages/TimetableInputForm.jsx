// src/TimetableInputForm.jsx
import React, { useEffect, useState } from "react";
import "./TimetableInputForm.css";

const DEFAULT_SLOTS = [
  "9:00-9:55",
  "9:55-10:50",
  "10:50-11:45",
  "11:45-12:40",
  "Lunch Break",
  "2:00-2:55",
  "2:55-3:50",
  "3:50-4:45",
];
const DEFAULT_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const STORAGE_KEY = "as_timetable_input_v1";

/**
 * TimetableInputForm
 * - now accepts prop `visibleSection`:
 *    null => render entire form (backwards compatible)
 *    "class" | "subject" | "teacher" | "rooms" | "slots" | "constraints" | "unavailability"
 *    => render only that section
 * - accepts onGenerateMultipleTimetables and onGenerateSingleTimetable callback props
 */
export default function TimetableInputForm({ 
  visibleSection = null, 
  onGenerateMultipleTimetables, 
  onGenerateSingleTimetable 
}) {
  const [inputData, setInputData] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      classes: [
        {
          name: "",
          subjects: [],
          lab_subjects: [],
          sections: [{ name: "", student_count: 0 }],
        },
      ],
      rooms: [],
      labs: [],
      lab_rooms: {},
      days: DEFAULT_DAYS.slice(),
      slots: DEFAULT_SLOTS.slice(),
      teachers: {},
      lab_teachers: {},
      teacher_unavailability: {},
      lecture_requirements: {},
      lab_capacity: 30,
      constraints: {
        max_lectures_per_day_teacher: 5,
        max_lectures_per_subject_per_day: 2,
        min_lectures_per_day_section: 4,
        max_lectures_per_day_section: 6,
        lab_session_duration: 2,
        distribute_across_week: true,
      },
    };
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [showValidation, setShowValidation] = useState(false);
  const [isFormValid, setIsFormValid] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inputData));
    } catch {}
  }, [inputData]);

  const updateNestedState = (path, value) => {
    setInputData((prev) => {
      const newState = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let cur = newState;
      for (let i = 0; i < keys.length - 1; i++) {
        if (cur[keys[i]] === undefined) cur[keys[i]] = {};
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return newState;
    });
  };

  const getAllSubjects = () =>
    (inputData?.classes || []).flatMap((c) => (c?.subjects || []).filter(Boolean));
  const getAllLabSubjects = () =>
    (inputData?.classes || []).flatMap((c) => (c?.lab_subjects || []).filter(Boolean));
  const getAllTeachers = () => {
    const set = new Set();
    const t = inputData?.teachers || {};
    Object.values(t || {}).forEach((arr) => (arr || []).forEach((x) => x && set.add(x.trim())));
    const lt = inputData?.lab_teachers || {};
    Object.values(lt || {}).forEach((arr) => (arr || []).forEach((x) => x && set.add(x.trim())));
    return Array.from(set);
  };

  const validateForm = () => {
    const errors = {};
    
    // Classes validation
    if ((inputData?.classes || []).length === 0) errors.classes = "At least one class is required";
    else {
      (inputData?.classes || []).forEach((classItem, idx) => {
        const classErrors = {};
        if (!classItem?.name || !classItem.name.trim()) classErrors.name = "Class name is required";
        if (
          (classItem?.subjects || []).filter(Boolean).length === 0 &&
          (classItem?.lab_subjects || []).filter(Boolean).length === 0
        )
          classErrors.subjects = "At least one subject (theory or lab) is required";
        const emptySubjects = (classItem?.subjects || []).filter((s) => !s || !s.trim());
        const emptyLabSubjects = (classItem?.lab_subjects || []).filter((s) => !s || !s.trim());
        if (emptySubjects.length > 0) classErrors.emptySubjects = "All theory subjects must have names";
        if (emptyLabSubjects.length > 0) classErrors.emptyLabSubjects = "All lab subjects must have names";
        if (!Array.isArray(classItem?.sections) || classItem.sections.length === 0) {
          classErrors.sections = "At least one section is required";
        } else {
          const invalidSections = (classItem.sections || []).filter(
            (s) => !s?.name || !s.name.trim() || !(s.student_count > 0)
          );
          if (invalidSections.length > 0) classErrors.invalidSections = "All sections must have names and positive student counts";
        }
        if (Object.keys(classErrors).length > 0) errors[`class_${idx}`] = classErrors;
      });
    }

    // Rooms validation
    const validRooms = (inputData?.rooms || []).filter((r) => r && r.trim());
    if (validRooms.length === 0) errors.rooms = "At least one theory room is required";
    const labSubjectsExist = getAllLabSubjects().length > 0;
    const validLabRooms = (inputData?.labs || []).filter((r) => r && r.trim());
    if (labSubjectsExist && validLabRooms.length === 0) errors.labs = "Lab rooms are required when lab subjects exist";

    // Teachers per subject validation
    const allSubjects = getAllSubjects();
    allSubjects.forEach((subject) => {
      const teachers = (inputData?.teachers?.[subject] || []).filter((t) => t && t.trim());
      if (teachers.length === 0) errors[`teacher_${subject}`] = `At least one teacher is required for ${subject}`;
    });
    const allLabSubjects = getAllLabSubjects();
    allLabSubjects.forEach((subject) => {
      const teachers = (inputData?.lab_teachers?.[subject] || []).filter((t) => t && t.trim());
      if (teachers.length === 0) errors[`lab_teacher_${subject}`] = `At least one teacher is required for lab subject ${subject}`;
    });
    allLabSubjects.forEach((subject) => {
      const assignedRooms = inputData?.lab_rooms?.[subject] || [];
      if (!Array.isArray(assignedRooms) || assignedRooms.length === 0) {
        errors[`lab_room_${subject}`] = `At least one lab room must be assigned to ${subject}`;
      }
    });

    // Lecture requirements validation - ONLY validate theory subjects, NOT lab subjects
    allSubjects.forEach((subject) => {
      const req = inputData?.lecture_requirements?.[subject] || 0;
      if (!(req > 0)) errors[`lecture_req_${subject}`] = `${subject} must have positive weekly lecture requirement`;
    });

    // Constraints & slots & capacities validation
    if (!(inputData?.constraints?.max_lectures_per_day_teacher > 0)) errors.max_lectures_teacher = "Max lectures per day for teacher must be positive";
    if (!(inputData?.constraints?.max_lectures_per_subject_per_day > 0)) errors.max_lectures_subject = "Max lectures per subject per day must be positive";
    if (!(inputData?.constraints?.min_lectures_per_day_section > 0)) errors.min_lectures_section = "Min lectures per day for section must be positive";
    if (!(inputData?.constraints?.max_lectures_per_day_section > 0)) errors.max_lectures_section = "Max lectures per day for section must be positive";
    if ((inputData?.constraints?.min_lectures_per_day_section || 0) >= (inputData?.constraints?.max_lectures_per_day_section || 0)) errors.lectures_range = "Min lectures per day must be less than max lectures per day";
    if (!(inputData?.constraints?.lab_session_duration > 0)) errors.lab_duration = "Lab session duration must be positive";
    if (!(inputData?.lab_capacity > 0)) errors.lab_capacity = "Lab capacity must be positive";
    const validSlots = (inputData?.slots || []).filter((s) => s && s.trim() && s !== "Lunch Break");
    if (validSlots.length < 3) errors.time_slots = "At least 3 valid time slots are required (excluding lunch break)";

    setValidationErrors(errors);
    const valid = Object.keys(errors).length === 0;
    setIsFormValid(valid);
    return valid;
  };

  useEffect(() => {
    validateForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputData]);

  useEffect(() => {
    const theorySubjects = getAllSubjects();
    const labSubjects = getAllLabSubjects();
    setInputData((prev) => {
      const newTeachers = { ...(prev?.teachers || {}) };
      const newLabTeachers = { ...(prev?.lab_teachers || {}) };
      const newLabRooms = { ...(prev?.lab_rooms || {}) };
      theorySubjects.forEach((s) => {
        if (!Array.isArray(newTeachers[s])) newTeachers[s] = [""];
      });
      Object.keys(newTeachers).forEach((s) => {
        if (!theorySubjects.includes(s)) delete newTeachers[s];
      });
      labSubjects.forEach((s) => {
        if (!Array.isArray(newLabTeachers[s])) newLabTeachers[s] = [""];
        if (!Array.isArray(newLabRooms[s])) newLabRooms[s] = [];
      });
      Object.keys(newLabTeachers).forEach((s) => {
        if (!labSubjects.includes(s)) delete newLabTeachers[s];
      });
      Object.keys(newLabRooms).forEach((s) => {
        if (!labSubjects.includes(s)) delete newLabRooms[s];
      });
      return { ...prev, teachers: newTeachers, lab_teachers: newLabTeachers, lab_rooms: newLabRooms };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(inputData.classes)]);

  // Helper actions
  const addClass = () =>
    setInputData((prev) => ({
      ...prev,
      classes: [
        ...(prev?.classes || []),
        { name: "", subjects: [], lab_subjects: [], sections: [{ name: "", student_count: 0 }] },
      ],
    }));
  const removeClass = (idx) => setInputData((prev) => ({ ...prev, classes: (prev?.classes || []).filter((_, i) => i !== idx) }));
  const updateClass = (idx, field, value) =>
    setInputData((prev) => ({ ...prev, classes: (prev?.classes || []).map((c, i) => (i === idx ? { ...c, [field]: value } : c)) }));

  const addSubjectToClass = (classIndex, isLab = false) => {
    const field = isLab ? "lab_subjects" : "subjects";
    setInputData((prev) => ({ ...prev, classes: (prev?.classes || []).map((c, i) => (i === classIndex ? { ...c, [field]: [...(c[field] || []), ""] } : c)) }));
  };
  const updateClassSubject = (classIndex, subjectIndex, value, isLab = false) => {
    const field = isLab ? "lab_subjects" : "subjects";
    setInputData((prev) => ({ ...prev, classes: (prev?.classes || []).map((c, i) => (i === classIndex ? { ...c, [field]: (c[field] || []).map((s, j) => (j === subjectIndex ? value : s)) } : c)) }));
  };
  const removeSubjectFromClass = (classIndex, subjectIndex, isLab = false) => {
    const field = isLab ? "lab_subjects" : "subjects";
    setInputData((prev) => ({ ...prev, classes: (prev?.classes || []).map((c, i) => (i === classIndex ? { ...c, [field]: (c[field] || []).filter((_, j) => j !== subjectIndex) } : c)) }));
  };

  const addSectionToClass = (classIndex) =>
    setInputData((prev) => ({ ...prev, classes: (prev?.classes || []).map((c, i) => (i === classIndex ? { ...c, sections: [...(c.sections || []), { name: "", student_count: 0 }] } : c)) }));
  const updateSection = (classIndex, sectionIndex, field, value) =>
    setInputData((prev) => ({ ...prev, classes: (prev?.classes || []).map((c, i) => (i === classIndex ? { ...c, sections: (c.sections || []).map((s, j) => (j === sectionIndex ? { ...s, [field]: value } : s)) } : c)) }));
  const removeSectionFromClass = (classIndex, sectionIndex) =>
    setInputData((prev) => ({ ...prev, classes: (prev?.classes || []).map((c, i) => (i === classIndex ? { ...c, sections: (c.sections || []).filter((_, j) => j !== sectionIndex) } : c)) }));

  const addRoom = (isLab = false) => {
    const field = isLab ? "labs" : "rooms";
    setInputData((prev) => ({ ...prev, [field]: [...(prev[field] || []), ""] }));
  };
  const updateRoom = (index, value, isLab = false) => {
    const field = isLab ? "labs" : "rooms";
    setInputData((prev) => ({ ...prev, [field]: (prev[field] || []).map((r, i) => (i === index ? value : r)) }));
  };
  const removeRoom = (index, isLab = false) => {
    const field = isLab ? "labs" : "rooms";
    setInputData((prev) => ({ ...prev, [field]: (prev[field] || []).filter((_, i) => i !== index) }));
  };

  const toggleLabRoomAssignment = (labSubject, labRoom) => {
    setInputData((prev) => {
      const cur = { ...(prev?.lab_rooms || {}) };
      const list = Array.isArray(cur[labSubject]) ? [...cur[labSubject]] : [];
      const idx = list.indexOf(labRoom);
      if (idx === -1) list.push(labRoom);
      else list.splice(idx, 1);
      return { ...prev, lab_rooms: { ...(prev.lab_rooms || {}), [labSubject]: list } };
    });
  };
  const selectAllLabRooms = (labSubject) =>
    setInputData((prev) => ({ ...prev, lab_rooms: { ...(prev.lab_rooms || {}), [labSubject]: (prev.labs || []).filter(Boolean) } }));
  const clearAllLabRooms = (labSubject) => setInputData((prev) => ({ ...prev, lab_rooms: { ...(prev.lab_rooms || {}), [labSubject]: [] } }));

  const addTimeSlot = () => setInputData((prev) => ({ ...prev, slots: [...(prev.slots || []), ""] }));
  const updateTimeSlot = (index, value) => setInputData((prev) => ({ ...prev, slots: (prev.slots || []).map((s, i) => (i === index ? value : s)) }));
  const removeTimeSlot = (index) => setInputData((prev) => ({ ...prev, slots: (prev.slots || []).filter((_, i) => i !== index) }));

  const addTeacher = (subject, isLab = false) => {
    const field = isLab ? "lab_teachers" : "teachers";
    setInputData((prev) => ({ ...prev, [field]: { ...(prev[field] || {}), [subject]: [...((prev[field] || {})[subject] || []), ""] } }));
  };
  const updateTeacher = (subject, teacherIndex, value, isLab = false) => {
    const field = isLab ? "lab_teachers" : "teachers";
    setInputData((prev) => ({ ...prev, [field]: { ...(prev[field] || {}), [subject]: ((prev[field] || {})[subject] || []).map((t, i) => (i === teacherIndex ? value : t)) } }));
  };
  const removeTeacher = (subject, teacherIndex, isLab = false) => {
    const field = isLab ? "lab_teachers" : "teachers";
    setInputData((prev) => ({ ...prev, [field]: { ...(prev[field] || {}), [subject]: ((prev[field] || {})[subject] || []).filter((_, i) => i !== teacherIndex) } }));
  };

  const addTeacherUnavailability = (teacherName) => {
    if (!teacherName) return;
    setInputData((prev) => ({ ...prev, teacher_unavailability: { ...(prev.teacher_unavailability || {}), [teacherName]: [...((prev.teacher_unavailability || {})[teacherName] || []), { day: "", slot: "" }] } }));
  };
  const updateTeacherUnavailability = (teacherName, index, field, value) => {
    setInputData((prev) => ({ ...prev, teacher_unavailability: { ...(prev.teacher_unavailability || {}), [teacherName]: ((prev.teacher_unavailability || {})[teacherName] || []).map((u, i) => (i === index ? { ...u, [field]: value } : u)) } }));
  };
  const removeTeacherUnavailability = (teacherName, index) => {
    setInputData((prev) => ({ ...prev, teacher_unavailability: { ...(prev.teacher_unavailability || {}), [teacherName]: ((prev.teacher_unavailability || {})[teacherName] || []).filter((_, i) => i !== index) } }));
  };
  const removeTeacherFromUnavailability = (teacherName) =>
    setInputData((prev) => {
      const copy = { ...(prev.teacher_unavailability || {}) };
      delete copy[teacherName];
      return { ...prev, teacher_unavailability: copy };
    });

  const getFieldError = (f) => validationErrors[f];
  const hasError = (f) => showValidation && Boolean(validationErrors[f]);
  const getErrorClass = (f) => (hasError(f) ? "error" : "");

  // Generate Multiple Timetables
  const generateMultipleTimetables = () => {
    setShowValidation(true);
    if (!validateForm()) {
      alert("Please fill in all required fields before generating timetables.");
      const firstErrorEl = document.querySelector(".error");
      if (firstErrorEl) firstErrorEl.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    
    if (onGenerateMultipleTimetables) {
      onGenerateMultipleTimetables(inputData);
    } else {
      console.log("Generating multiple timetables with data:", inputData);
    }
  };

  // Generate Single Timetable
  const generateSingleTimetable = () => {
    setShowValidation(true);
    if (!validateForm()) {
      alert("Please fill in all required fields before generating timetable.");
      const firstErrorEl = document.querySelector(".error");
      if (firstErrorEl) firstErrorEl.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    
    if (onGenerateSingleTimetable) {
      onGenerateSingleTimetable(inputData);
    } else {
      console.log("Generating single timetable with data:", inputData);
    }
  };

  const SmallBtn = ({ children, className = "", ...props }) => <button {...props} className={`btn-small ${className}`.trim()}>{children}</button>;

  // ---------- Render ----------
  return (
    <div className="timetable-input-form">
      <div className="header">
        <div className="header-content">
          <h1>Timetable Configuration</h1>
          <p className="header-description">Configure all required parameters for timetable generation</p>
          <div className={`validation-summary ${isFormValid ? "valid" : "invalid"}`}>
            <div className="validation-status">
              <span className={`status-icon ${isFormValid ? "valid" : "invalid"}`}>{isFormValid ? "✅" : "⚠️"}</span>
              <span className="status-text">{isFormValid ? "Form is ready" : `${Object.keys(validationErrors).length} validation error(s)`}</span>
            </div>
            {showValidation && !isFormValid && <div className="error-count">Please review and fix the highlighted fields below.</div>}
          </div>
        </div>

        <div className="header-actions">
          <button onClick={generateMultipleTimetables} className={`btn-primary btn-generate ${!isFormValid ? "btn-disabled" : ""}`} title={!isFormValid ? "Fix errors first" : "Generate multiple timetables"}>
            <span className="btn-icon">🚀</span>
            <span className="btn-text">Generate Multiple Timetables</span>
          </button>
        </div>
      </div>

      <div className="form-container">
        {/* ====== Classes & Subjects (CLASS tab) ====== */}
        {(!visibleSection || visibleSection === "class") && (
          <div className="section-wrapper">
            <div className="section-title">
              <h2><span className="title-icon">🎓</span> Classes & Subjects</h2>
              <p>Define classes, subjects and sections</p>
              {hasError("classes") && <div className="section-error">{getFieldError("classes")}</div>}
            </div>
            <div className="form-section">
              {(inputData?.classes || []).map((classItem, classIndex) => (
                <div key={classIndex} className={`class-card ${getErrorClass(`class_${classIndex}`)}`}>
                  <div className="class-header">
                    <h4>Class {classIndex + 1}</h4>
                    <SmallBtn className="btn-remove" onClick={() => removeClass(classIndex)}><span className="btn-icon">×</span> Remove</SmallBtn>
                  </div>

                  {hasError(`class_${classIndex}`) && (
                    <div className="field-errors">
                      {Object.entries(getFieldError(`class_${classIndex}`) || {}).map(([k, msg]) => <div key={k} className="field-error">{msg}</div>)}
                    </div>
                  )}

                  <div className="class-name-section">
                    <div className="form-group">
                      <label>Class Name:</label>
                      <input type="text" value={classItem.name || ""} onChange={(e) => updateClass(classIndex, "name", e.target.value)} placeholder="e.g., CSE 3rd Year" className={hasError(`class_${classIndex}`) && !(classItem?.name || "").trim() ? "error" : ""} />
                    </div>
                  </div>

                  <div className="subjects-container">
                    <div className="subject-group">
                      <label className="subject-label"><span className="label-icon">📚</span> Theory Subjects:</label>
                      <div className="subjects-list">
                        {((classItem?.subjects) || []).map((subject, subIndex) => (
                          <div key={subIndex} className="subject-input">
                            <input type="text" value={subject || ""} onChange={(e) => updateClassSubject(classIndex, subIndex, e.target.value)} placeholder="Subject name" className={hasError(`class_${classIndex}`) && !subject?.trim() ? "error" : ""} />
                            <SmallBtn className="btn-remove-small" onClick={() => removeSubjectFromClass(classIndex, subIndex)}>×</SmallBtn>
                          </div>
                        ))}
                        <SmallBtn className="btn-add-small" onClick={() => addSubjectToClass(classIndex)}><span className="btn-icon">+</span> Add Theory Subject</SmallBtn>
                      </div>
                    </div>

                    <div className="subject-group">
                      <label className="subject-label"><span className="label-icon">🔬</span> Lab Subjects:</label>
                      <div className="subjects-list">
                        {((classItem?.lab_subjects) || []).map((subject, subIndex) => (
                          <div key={subIndex} className="subject-input">
                            <input type="text" value={subject || ""} onChange={(e) => updateClassSubject(classIndex, subIndex, e.target.value, true)} placeholder="Lab subject name" className={hasError(`class_${classIndex}`) && !subject?.trim() ? "error" : ""} />
                            <SmallBtn className="btn-remove-small" onClick={() => removeSubjectFromClass(classIndex, subIndex, true)}>×</SmallBtn>
                          </div>
                        ))}
                        <SmallBtn className="btn-add-small" onClick={() => addSubjectToClass(classIndex, true)}><span className="btn-icon">+</span> Add Lab Subject</SmallBtn>
                      </div>
                    </div>
                  </div>

                  <div className="sections-container">
                    <div className="sections-header">
                      <h5><span className="label-icon">📋</span> Sections for this Class:</h5>
                      <SmallBtn className="btn-add-small" onClick={() => addSectionToClass(classIndex)}><span className="btn-icon">+</span> Add Section</SmallBtn>
                    </div>
                    <div className="sections-grid">
                      {((classItem?.sections) || []).map((section, sectionIndex) => (
                        <div key={sectionIndex} className="section-item">
                          <div className="section-inputs">
                            <div className="form-group">
                              <label>Section Name:</label>
                              <input type="text" value={section?.name || ""} onChange={(e) => updateSection(classIndex, sectionIndex, "name", e.target.value)} placeholder="A, B, ..." className={hasError(`class_${classIndex}`) && !(section?.name || "").trim() ? "error" : ""} />
                            </div>
                            <div className="form-group">
                              <label>Students:</label>
                              <input type="number" value={section?.student_count || 0} onChange={(e) => updateSection(classIndex, sectionIndex, "student_count", parseInt(e.target.value) || 0)} placeholder="Count" className={hasError(`class_${classIndex}`) && !(section?.student_count > 0) ? "error" : ""} />
                            </div>
                          </div>
                          <SmallBtn className="btn-remove-small" onClick={() => removeSectionFromClass(classIndex, sectionIndex)} title="Remove section">×</SmallBtn>
                          {hasError(`section_capacity_${classIndex}_${sectionIndex}`) && <div className="field-error">{getFieldError(`section_capacity_${classIndex}_${sectionIndex}`)}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <SmallBtn className="btn-add" onClick={addClass}><span className="btn-icon">+</span> Add New Class</SmallBtn>
            </div>
          </div>
        )}

        {/* ====== SUBJECTS ONLY (SUBJECT tab) ====== */}
        {(!visibleSection || visibleSection === "subject") && (
          <div className="section-wrapper">
            <div className="section-title">
              <h2><span className="title-icon">📚</span> Subjects (All classes)</h2>
              <p>Quick view & edit of theory and lab subjects across classes</p>
            </div>
            <div className="form-section">
              {(inputData?.classes || []).map((classItem, classIndex) => (
                <div key={`sub-${classIndex}`} className="class-card">
                  <div className="class-header">
                    <h4>{classItem?.name || `Class ${classIndex + 1}`}</h4>
                  </div>

                  <div className="subjects-container">
                    <div className="subject-group">
                      <label className="subject-label"><span className="label-icon">📚</span> Theory Subjects:</label>
                      <div className="subjects-list">
                        {((classItem?.subjects) || []).map((subject, subIndex) => (
                          <div key={subIndex} className="subject-input">
                            <input type="text" value={subject || ""} onChange={(e) => updateClassSubject(classIndex, subIndex, e.target.value)} placeholder="Subject name" />
                            <SmallBtn className="btn-remove-small" onClick={() => removeSubjectFromClass(classIndex, subIndex)}>×</SmallBtn>
                          </div>
                        ))}
                        <SmallBtn className="btn-add-small" onClick={() => addSubjectToClass(classIndex)}><span className="btn-icon">+</span> Add Theory Subject</SmallBtn>
                      </div>
                    </div>

                    <div className="subject-group">
                      <label className="subject-label"><span className="label-icon">🔬</span> Lab Subjects:</label>
                      <div className="subjects-list">
                        {((classItem?.lab_subjects) || []).map((subject, subIndex) => (
                          <div key={subIndex} className="subject-input">
                            <input type="text" value={subject || ""} onChange={(e) => updateClassSubject(classIndex, subIndex, e.target.value, true)} placeholder="Lab subject name" />
                            <SmallBtn className="btn-remove-small" onClick={() => removeSubjectFromClass(classIndex, subIndex, true)}>×</SmallBtn>
                          </div>
                        ))}
                        <SmallBtn className="btn-add-small" onClick={() => addSubjectToClass(classIndex, true)}><span className="btn-icon">+</span> Add Lab Subject</SmallBtn>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ====== ROOMS & LABS (ROOMS tab) ====== */}
        {(!visibleSection || visibleSection === "rooms") && (
          <div className="section-wrapper">
            <div className="section-title">
              <h2><span className="title-icon">🏫</span> Rooms & Laboratories</h2>
              <p>Configure available rooms and laboratory facilities</p>
            </div>
            <div className="form-section">
              <div className="rooms-labs-container">
                <div className="room-group">
                  <h4><span className="label-icon">🏛️</span> Theory Rooms</h4>
                  {hasError("rooms") && <div className="field-error">{getFieldError("rooms")}</div>}
                  <div className="rooms-list">
                    {((inputData?.rooms) || []).map((room, idx) => (
                      <div key={idx} className="room-input">
                        <input type="text" value={room || ""} onChange={(e) => updateRoom(idx, e.target.value)} placeholder="Room name/number" className={hasError("rooms") && !(room || "").trim() ? "error" : ""} />
                        <SmallBtn className="btn-remove-small" onClick={() => removeRoom(idx)}>×</SmallBtn>
                      </div>
                    ))}
                    <SmallBtn className="btn-add-small" onClick={() => addRoom(false)}><span className="btn-icon">+</span> Add Theory Room</SmallBtn>
                  </div>
                </div>

                <div className="room-group">
                  <h4><span className="label-icon">🔬</span> Lab Rooms</h4>
                  {hasError("labs") && <div className="field-error">{getFieldError("labs")}</div>}
                  <div className="rooms-list">
                    {((inputData?.labs) || []).map((lab, idx) => (
                      <div key={idx} className="room-input">
                        <input type="text" value={lab || ""} onChange={(e) => updateRoom(idx, e.target.value, true)} placeholder="Lab room name/number" className={hasError("labs") && !(lab || "").trim() ? "error" : ""} />
                        <SmallBtn className="btn-remove-small" onClick={() => removeRoom(idx, true)}>×</SmallBtn>
                      </div>
                    ))}
                    <SmallBtn className="btn-add-small" onClick={() => addRoom(true)}><span className="btn-icon">+</span> Add Lab Room</SmallBtn>
                  </div>
                </div>

                <div className="lab-capacity-group">
                  <div className="form-group">
                    <label><span className="label-icon">👥</span> Lab Capacity (Students):</label>
                    <input type="number" value={inputData?.lab_capacity || 30} onChange={(e) => setInputData((prev) => ({ ...prev, lab_capacity: parseInt(e.target.value) || 30 }))} className={hasError("lab_capacity") ? "error" : ""} />
                    {hasError("lab_capacity") && <div className="field-error">{getFieldError("lab_capacity")}</div>}
                  </div>
                </div>
              </div>

              <div className="lab-room-assignments">
                <h4><span className="label-icon">🔗</span> Lab Room Assignments</h4>
                {getAllLabSubjects().length > 0 && (inputData?.labs || []).filter(Boolean).length > 0 ? (
                  <div className="lab-assignments-container">
                    {getAllLabSubjects().map((labSubject) => (
                      <div key={labSubject} className={`lab-assignment-card ${getErrorClass(`lab_room_${labSubject}`)}`}>
                        <div className="lab-assignment-header">
                          <h5><span className="label-icon">🧪</span> {labSubject}</h5>
                          <div className="assignment-actions">
                            <SmallBtn onClick={() => selectAllLabRooms(labSubject)}>✓ Select All</SmallBtn>
                            <SmallBtn onClick={() => clearAllLabRooms(labSubject)}>× Clear All</SmallBtn>
                          </div>
                        </div>

                        {hasError(`lab_room_${labSubject}`) && <div className="field-error">{getFieldError(`lab_room_${labSubject}`)}</div>}

                        <div className="lab-rooms-grid">
                          {((inputData?.labs) || []).filter(Boolean).map((labRoom) => (
                            <label className="lab-room-checkbox" key={labRoom}>
                              <input type="checkbox" checked={((inputData?.lab_rooms || {})[labSubject] || []).includes(labRoom)} onChange={() => toggleLabRoomAssignment(labSubject, labRoom)} />
                              <span className="room-name">{labRoom}</span>
                            </label>
                          ))}
                        </div>

                        <div className="assigned-rooms-summary">
                          <strong><span className="label-icon">📍</span> Assigned Rooms:</strong>
                          {(((inputData?.lab_rooms || {})[labSubject] || [])).length > 0 ? ` ${(inputData.lab_rooms[labSubject] || []).join(", ")}` : " None assigned"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="info-message"><span className="info-icon">ℹ️</span>{getAllLabSubjects().length === 0 ? "Add lab subjects to classes first to assign lab rooms." : "Add lab rooms first to assign them to lab subjects."}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ====== SCHEDULE & TIMING (SLOTS tab) ====== */}
        {(!visibleSection || visibleSection === "slots") && (
          <div className="section-wrapper">
            <div className="section-title">
              <h2><span className="title-icon">🕒</span> Schedule & Timing</h2>
              <p>Set up working days and time slots</p>
            </div>
            <div className="form-section">
              <div className="schedule-container">
                <div className="schedule-group">
                  <h4><span className="label-icon">📅</span> Working Days</h4>
                  <div className="days-list">
                    {((inputData?.days) || []).map((day, idx) => (
                      <div key={idx} className="day-input"><input type="text" value={day || ""} onChange={(e) => setInputData((prev) => ({ ...prev, days: (prev.days || []).map((d, i) => (i === idx ? e.target.value : d)) }))} /></div>
                    ))}
                  </div>
                </div>
                <div className="schedule-group">
                  <h4><span className="label-icon">⏰</span> Time Slots</h4>
                  {hasError("time_slots") && <div className="field-error">{getFieldError("time_slots")}</div>}
                  <div className="slots-list">
                    {((inputData?.slots) || []).map((slot, idx) => (
                      <div key={idx} className="slot-input">
                        <input type="text" value={slot || ""} onChange={(e) => updateTimeSlot(idx, e.target.value)} placeholder="e.g., 9:00-9:55" className={hasError("time_slots") && !(slot || "").trim() ? "error" : ""} />
                        <SmallBtn className="btn-remove-small" onClick={() => removeTimeSlot(idx)}>×</SmallBtn>
                      </div>
                    ))}
                    <SmallBtn className="btn-add-small" onClick={addTimeSlot}><span className="btn-icon">+</span> Add Time Slot</SmallBtn>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== TEACHER ASSIGNMENTS (TEACHER tab) ====== */}
        {(!visibleSection || visibleSection === "teacher") && (
          <div className="section-wrapper">
            <div className="section-title">
              <h2><span className="title-icon">👩‍🏫</span> Teacher Assignments</h2>
              <p>Assign teachers to subjects and labs</p>
            </div>
            <div className="form-section">
              <div className="teachers-container">
                <div className="teacher-group">
                  <h4><span className="label-icon">📖</span> Theory Subject Teachers</h4>
                  <div className="subjects-teachers">
                    {getAllSubjects().length > 0 ? (
                      getAllSubjects().map((subject) => (
                        <div key={subject} className={`subject-teachers ${getErrorClass(`teacher_${subject}`)}`}>
                          <h5><span className="label-icon">📚</span> {subject}</h5>
                          {hasError(`teacher_${subject}`) && <div className="field-error">{getFieldError(`teacher_${subject}`)}</div>}
                          <div className="teachers-list">
                            {((inputData?.teachers?.[subject]) || [""]).map((teacher, idx) => (
                              <div key={idx} className="teacher-input">
                                <input type="text" value={teacher || ""} onChange={(e) => updateTeacher(subject, idx, e.target.value)} placeholder="Teacher name" className={hasError(`teacher_${subject}`) && !(teacher || "").trim() ? "error" : ""} />
                                <SmallBtn className="btn-remove-small" onClick={() => removeTeacher(subject, idx)}>×</SmallBtn>
                              </div>
                            ))}
                            <SmallBtn className="btn-add-small" onClick={() => addTeacher(subject)}><span className="btn-icon">+</span> Add Teacher</SmallBtn>
                          </div>
                        </div>
                      ))
                    ) : <div className="info-message"><span className="info-icon">ℹ️</span> Add theory subjects to classes first to assign teachers.</div>}
                  </div>
                </div>

                <div className="teacher-group">
                  <h4><span className="label-icon">🔬</span> Lab Subject Teachers</h4>
                  <div className="subjects-teachers">
                    {getAllLabSubjects().length > 0 ? (
                      getAllLabSubjects().map((subject) => (
                        <div key={subject} className={`subject-teachers ${getErrorClass(`lab_teacher_${subject}`)}`}>
                          <h5><span className="label-icon">🧪</span> {subject}</h5>
                          {hasError(`lab_teacher_${subject}`) && <div className="field-error">{getFieldError(`lab_teacher_${subject}`)}</div>}
                          <div className="teachers-list">
                            {((inputData?.lab_teachers?.[subject]) || [""]).map((teacher, idx) => (
                              <div key={idx} className="teacher-input">
                                <input type="text" value={teacher || ""} onChange={(e) => updateTeacher(subject, idx, e.target.value, true)} placeholder="Teacher name" className={hasError(`lab_teacher_${subject}`) && !(teacher || "").trim() ? "error" : ""} />
                                <SmallBtn className="btn-remove-small" onClick={() => removeTeacher(subject, idx, true)}>×</SmallBtn>
                              </div>
                            ))}
                            <SmallBtn className="btn-add-small" onClick={() => addTeacher(subject, true)}><span className="btn-icon">+</span> Add Teacher</SmallBtn>
                          </div>
                        </div>
                      ))
                    ) : <div className="info-message"><span className="info-icon">ℹ️</span> Add lab subjects to classes first to assign teachers.</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== TEACHER UNAVAILABILITY (separate tab if needed) ====== */}
        {(!visibleSection || visibleSection === "unavailability") && (
          <div className="section-wrapper">
            <div className="section-title">
              <h2><span className="title-icon">🚫</span> Teacher Unavailability</h2>
              <p>Specify when teachers are not available</p>
            </div>
            <div className="form-section">
              <div className="unavailability-container">
                {getAllTeachers().length > 0 ? (
                  getAllTeachers().map((teacher) => (
                    <div key={teacher} className="teacher-unavailability-card">
                      <div className="teacher-unavailability-header">
                        <h5><span className="label-icon">👤</span> {teacher}</h5>
                        <div className="unavailability-actions">
                          <SmallBtn onClick={() => addTeacherUnavailability(teacher)}>+ Add Unavailability</SmallBtn>
                          <SmallBtn className="btn-remove-small" onClick={() => removeTeacherFromUnavailability(teacher)}>×</SmallBtn>
                        </div>
                      </div>
                      <div className="unavailability-list">
                        {(((inputData?.teacher_unavailability || {})[teacher]) || []).map((u, idx) => (
                          <div key={idx} className="unavailability-item">
                            <div className="unavailability-fields">
                              <div className="form-group">
                                <label><span className="label-icon">📅</span> Day:</label>
                                <select value={u?.day || ""} onChange={(e) => updateTeacherUnavailability(teacher, idx, "day", e.target.value)}>
                                  <option value="">Select Day</option>
                                  {((inputData?.days) || []).map((d) => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </div>
                              <div className="form-group">
                                <label><span className="label-icon">⏰</span> Time Slot:</label>
                                <select value={u?.slot || ""} onChange={(e) => updateTeacherUnavailability(teacher, idx, "slot", e.target.value)}>
                                  <option value="">Select Time Slot</option>
                                  {((inputData?.slots) || []).filter(s => s !== "Lunch Break").map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            </div>
                            <SmallBtn className="btn-remove-small" onClick={() => removeTeacherUnavailability(teacher, idx)}>×</SmallBtn>
                          </div>
                        ))}
                        {(!((inputData?.teacher_unavailability || {})[teacher]) || ((inputData?.teacher_unavailability || {})[teacher] || []).length === 0) && (
                          <div className="no-unavailability"><span className="info-icon">ℹ️</span> No unavailability set for this teacher</div>
                        )}
                      </div>
                    </div>
                  ))
                ) : <div className="info-message"><span className="info-icon">ℹ️</span> Add teachers to subjects first to set unavailability.</div>}
              </div>
            </div>
          </div>
        )}

        {/* ====== CONSTRAINTS & REQUIREMENTS (CONSTRAINT tab) ====== */}
        {(!visibleSection || visibleSection === "constraints") && (
          <div className="section-wrapper">
            <div className="section-title">
              <h2><span className="title-icon">⚙️</span> Constraints & Requirements</h2>
              <p>Define scheduling rules and lecture requirements</p>
            </div>
            <div className="form-section">
              <div className="constraints-container">
                <div className="constraints-grid">
                  <div className="constraint-card">
                    <label><span className="label-icon">👨‍🏫</span> Max Lectures per Day (Teacher):</label>
                    <input type="number" value={inputData?.constraints?.max_lectures_per_day_teacher || 5} onChange={(e) => updateNestedState("constraints.max_lectures_per_day_teacher", parseInt(e.target.value) || 5)} className={hasError("max_lectures_teacher") ? "error" : ""} />
                    {hasError("max_lectures_teacher") && <div className="field-error">{getFieldError("max_lectures_teacher")}</div>}
                  </div>

                  <div className="constraint-card">
                    <label><span className="label-icon">📚</span> Max Lectures per Subject per Day:</label>
                    <input type="number" value={inputData?.constraints?.max_lectures_per_subject_per_day || 2} onChange={(e) => updateNestedState("constraints.max_lectures_per_subject_per_day", parseInt(e.target.value) || 2)} className={hasError("max_lectures_subject") ? "error" : ""} />
                    {hasError("max_lectures_subject") && <div className="field-error">{getFieldError("max_lectures_subject")}</div>}
                  </div>

                  <div className="constraint-card">
                    <label><span className="label-icon">📋</span> Min Lectures per Day (Section):</label>
                    <input type="number" value={inputData?.constraints?.min_lectures_per_day_section || 4} onChange={(e) => updateNestedState("constraints.min_lectures_per_day_section", parseInt(e.target.value) || 4)} className={hasError("min_lectures_section") ? "error" : ""} />
                    {hasError("min_lectures_section") && <div className="field-error">{getFieldError("min_lectures_section")}</div>}
                  </div>

                  <div className="constraint-card">
                    <label><span className="label-icon">📊</span> Max Lectures per Day (Section):</label>
                    <input type="number" value={inputData?.constraints?.max_lectures_per_day_section || 6} onChange={(e) => updateNestedState("constraints.max_lectures_per_day_section", parseInt(e.target.value) || 6)} className={hasError("max_lectures_section") ? "error" : ""} />
                    {hasError("max_lectures_section") && <div className="field-error">{getFieldError("max_lectures_section")}</div>}
                  </div>

                  {hasError("lectures_range") && <div className="constraint-card"><div className="field-error">{getFieldError("lectures_range")}</div></div>}

                  <div className="constraint-card">
                    <label><span className="label-icon">🔬</span> Lab Session Duration (slots):</label>
                    <input type="number" value={inputData?.constraints?.lab_session_duration || 2} onChange={(e) => updateNestedState("constraints.lab_session_duration", parseInt(e.target.value) || 2)} className={hasError("lab_duration") ? "error" : ""} />
                    {hasError("lab_duration") && <div className="field-error">{getFieldError("lab_duration")}</div>}
                  </div>

                  <div className="constraint-card checkbox-card">
                    <label className="checkbox-label">
                      <input type="checkbox" checked={Boolean(inputData?.constraints?.distribute_across_week)} onChange={(e) => updateNestedState("constraints.distribute_across_week", e.target.checked)} />
                      <span className="label-icon">📈</span> Distribute lectures across week
                    </label>
                  </div>
                </div>

                <div className="lecture-requirements">
                  <h4><span className="label-icon">📊</span> Weekly Lecture Requirements</h4>
                  {(() => {
                    const theorySubjects = getAllSubjects();
                    const labSubjects = getAllLabSubjects();
                    
                    if (theorySubjects.length === 0 && labSubjects.length === 0) {
                      return <div className="no-subjects"><span className="info-icon">ℹ️</span> Add subjects to classes first to configure lecture requirements.</div>;
                    }
                    
                    return (
                      <div className="requirements-container">
                        {theorySubjects.length > 0 && (
                          <div className="requirements-section">
                            <h5><span className="label-icon">📚</span> Theory Subject Requirements</h5>
                            <div className="requirements-grid">
                              {theorySubjects.map((subject) => (
                                <div key={subject} className={`requirement-item ${getErrorClass(`lecture_req_${subject}`)}`}>
                                  <label><span className="label-icon">📖</span> {subject}:</label>
                                  <input type="number" value={inputData?.lecture_requirements?.[subject] || 0} onChange={(e) => setInputData((prev) => ({ ...prev, lecture_requirements: { ...(prev.lecture_requirements || {}), [subject]: parseInt(e.target.value) || 0 } }))} placeholder="0" className={hasError(`lecture_req_${subject}`) ? "error" : ""} />
                                  {hasError(`lecture_req_${subject}`) && <div className="field-error">{getFieldError(`lecture_req_${subject}`)}</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {labSubjects.length > 0 && (
                          <div className="requirements-section">
                            <h5><span className="label-icon">🔬</span> Lab Subject Requirements</h5>
                            <div className="requirements-grid">
                              {labSubjects.map((subject) => (
                                <div key={subject} className="requirement-item">
                                  <label><span className="label-icon">🧪</span> {subject}:</label>
                                  <input type="number" value={inputData?.lecture_requirements?.[subject] || 0} onChange={(e) => setInputData((prev) => ({ ...prev, lecture_requirements: { ...(prev.lecture_requirements || {}), [subject]: parseInt(e.target.value) || 0 } }))} placeholder="0" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Generate Buttons */}
      <div className="generate-section">
        <button
          onClick={generateMultipleTimetables}
          className="btn-primary btn-generate"
          disabled={showValidation && !validateForm()}
        >
          🎯 Generate Multiple Timetables
        </button>
      </div>
      </div>
    </div>
  );
}