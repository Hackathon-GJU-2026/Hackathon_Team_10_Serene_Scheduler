
import React, { useState, useEffect, useRef } from 'react';
import './TimetableDisplay.css';

const TimetableDisplay = ({ timetableData, inputData, onResetTeacher, loading = false }) => {
  const [selectedSection, setSelectedSection] = useState('all');
  const [viewMode, setViewMode] = useState('grid'); // grid, list, compact
  const [isMobile, setIsMobile] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedCell, setFocusedCell] = useState({ section: null, day: null, slot: null });
  const tableRef = useRef(null);

  // Loading state
  if (loading) {
    return (
      <div className="timetable-display">
        <div className="loading-skeleton">
          <div className="skeleton-header"></div>
          <div className="skeleton-stats"></div>
          <div className="skeleton-table"></div>
        </div>
      </div>
    );
  }

  if (!timetableData || !timetableData.timetable) {
    return (
      <div className="timetable-display">
        <div className="empty-state">
          <div className="empty-icon">Schedule</div>
          <h3>No timetable data available</h3>
          <p>Generate a timetable to see the schedule here</p>
        </div>
      </div>
    );
  }

  // Enhanced data grouping with search functionality
  const groupedData = timetableData.timetable.reduce((acc, item) => {
    if (!acc[item.section]) {
      acc[item.section] = {};
    }
    if (!acc[item.section][item.day]) {
      acc[item.section][item.day] = {};
    }
    if (!acc[item.section][item.day][item.slot]) {
      acc[item.section][item.day][item.slot] = [];
    }
    acc[item.section][item.day][item.slot].push(item);
    return acc;
  }, {});

  const sections = Object.keys(groupedData).sort();
  const days = inputData.days || [];
  const slots = inputData.slots || [];

  useEffect(() => {
    const applyMobileMode = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (mobile) {
        setViewMode((prev) => (prev === "grid" ? "list" : prev));
      }
    };
    applyMobileMode();
    window.addEventListener("resize", applyMobileMode);
    return () => window.removeEventListener("resize", applyMobileMode);
  }, []);

  // Filter sections based on search
  const filteredSections = sections.filter(section => 
    section.toLowerCase().includes(searchTerm.toLowerCase()) ||
    Object.values(groupedData[section] || {}).some(dayData =>
      Object.values(dayData || {}).some(slotData =>
        slotData.some(item => 
          (item.subject?.toLowerCase().includes(searchTerm.toLowerCase()) || 
           item.teacher?.toLowerCase().includes(searchTerm.toLowerCase()) || 
           item.room?.toLowerCase().includes(searchTerm.toLowerCase()))
        )
      )
    )
  );

  // Get lab subjects for a specific section
  const getSectionLabSubjects = (sectionName) => {
    for (const classInfo of inputData.classes || []) {
      const fullSectionNames = classInfo.sections?.map(section => {
        return section.name ? `${classInfo.name} - ${section.name}` : classInfo.name;
      }) || [];

      if (fullSectionNames.includes(sectionName)) {
        return classInfo.lab_subjects || [];
      }
    }
    return [];
  };

  // Enhanced teacher reset with confirmation
  const handleTeacherReset = async (teacher, day, slot) => {
    if (onResetTeacher && confirm(`Reset ${teacher} for ${day} ${slot}?`)) {
      try {
        await onResetTeacher(teacher, day, slot);
        // Show success feedback
        showNotification(`${teacher} reset successfully`, 'success');
      } catch (error) {
        showNotification('Failed to reset teacher', 'error');
      }
    }
  };

  // Notification system
  const showNotification = (message, type) => {
    // This would integrate with your notification system
    console.log(`${type}: ${message}`);
  };

  // Keyboard navigation
  const handleKeyDown = (e, section, day, slot) => {
    const { key } = e;
    const currentSectionIndex = sections.indexOf(section);
    const currentDayIndex = days.indexOf(day);
    const currentSlotIndex = slots.indexOf(slot);

    switch (key) {
      case 'ArrowUp':
        e.preventDefault();
        if (currentDayIndex > 0) {
          setFocusedCell({ section, day: days[currentDayIndex - 1], slot });
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (currentDayIndex < days.length - 1) {
          setFocusedCell({ section, day: days[currentDayIndex + 1], slot });
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (currentSlotIndex > 0) {
          setFocusedCell({ section, day, slot: slots[currentSlotIndex - 1] });
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (currentSlotIndex < slots.length - 1) {
          setFocusedCell({ section, day, slot: slots[currentSlotIndex + 1] });
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        // Trigger action for focused cell
        break;
    }
  };

  // Enhanced cell rendering with accessibility
  const renderCell = (section, day, slot) => {
    const slotItems = groupedData[section]?.[day]?.[slot] || [];
    const cellId = `cell-${section}-${day}-${slot}`;
    const isFocused = focusedCell.section === section && 
                     focusedCell.day === day && 
                     focusedCell.slot === slot;

    if (slot === 'Lunch Break') {
      return (
        <td 
          key={slot} 
          className="lunch-cell"
          role="gridcell"
          aria-label={`Lunch break on ${day}`}
          tabIndex={isFocused ? 0 : -1}
          onKeyDown={(e) => handleKeyDown(e, section, day, slot)}
        >
          <div className="lunch-content">
            <span className="lunch-icon" aria-hidden="true">Break</span>
            <span className="lunch-text">LUNCH</span>
            <span className="lunch-time">12:30 - 1:30</span>
          </div>
        </td>
      );
    }

    if (slotItems.length === 0) {
      return (
        <td 
          key={slot} 
          className="empty-cell"
          role="gridcell"
          aria-label={`Empty slot: ${day} ${slot}`}
          tabIndex={isFocused ? 0 : -1}
          onKeyDown={(e) => handleKeyDown(e, section, day, slot)}
        >
          <div className="empty-content">
            <span className="empty-text">Free</span>
          </div>
        </td>
      );
    }

    const sectionLabSubjects = getSectionLabSubjects(section);
    const labsRaw = slotItems.filter(item => sectionLabSubjects.includes(item.subject));
    const isSameLabEntry = (a, b) =>
      a &&
      b &&
      a.subject === b.subject &&
      (a.group || "") === (b.group || "") &&
      (a.room || "") === (b.room || "") &&
      (a.teacher || "") === (b.teacher || "");

    // Show long lab once at its first slot; continuation slots stay visually clean.
    const labs = labsRaw.filter((lab) => {
      const dur = Number(lab.duration || 1);
      if (dur <= 1) return true;
      const idx = slots.indexOf(slot);
      if (idx <= 0) return true;
      for (let back = 1; back < dur; back += 1) {
        const prevIdx = idx - back;
        if (prevIdx < 0) break;
        const prevSlot = slots[prevIdx];
        const prevItems = groupedData[section]?.[day]?.[prevSlot] || [];
        if (prevItems.some((p) => isSameLabEntry(p, lab))) {
          return false;
        }
      }
      return true;
    });
    const nonLabs = slotItems.filter(item => !sectionLabSubjects.includes(item.subject) && item.subject !== 'Workshop');
    const workshops = slotItems.filter(item => item.subject === 'Workshop');

    const isMovedSlot = slotItems.some(item => item.moved);
    const cellClass = `timetable-cell ${isMovedSlot ? 'moved-slot' : ''} ${isFocused ? 'focused-cell' : ''}`;

    return (
      <td 
        key={slot} 
        className={cellClass}
        role="gridcell"
        id={cellId}
        aria-label={`${day} ${slot}: ${slotItems.map(item => `${item.subject} with ${item.teacher}`).join(', ')}`}
        tabIndex={isFocused ? 0 : -1}
        onKeyDown={(e) => handleKeyDown(e, section, day, slot)}
        onClick={() => setFocusedCell({ section, day, slot })}
      >
        {labs.length > 0 && (
          <div className="lab-entries" role="group" aria-label="Lab sessions">
            {labs.map((lab, index) => (
              <div key={index} className="lab-entry" role="article">
                <div className="lab-header">
                  <span className="group-label" aria-label={`Group ${lab.group || 'G'}`}>
                    {lab.group || 'G'}
                  </span>
                  <strong className="subject-name">{lab.subject}</strong>
                  <span className="entry-type" aria-label="Laboratory session">LAB</span>
                </div>
                {Number(lab.duration || 1) > 1 && (
                  <div className="moved-indicator">
                    {slot} to {slots[Math.min(slots.length - 1, slots.indexOf(slot) + Number(lab.duration || 1) - 1)]} ({lab.duration} hr)
                  </div>
                )}
                <div className="lab-details">
                  <span className="room" aria-label={`Room ${lab.room || 'To be assigned'}`}>
                    <span className="icon" aria-hidden="true">Room:</span>
                    {lab.room || 'TBA'}
                  </span>
                  <button 
                    className="teacher clickable-teacher"
                    onClick={() => handleTeacherReset(lab.teacher, day, slot)}
                    aria-label={`Teacher: ${lab.teacher || 'To be assigned'}. Click to reset`}
                    type="button"
                  >
                    <span className="icon" aria-hidden="true">Teacher:</span>
                    {lab.teacher || 'TBA'}
                  </button>
                </div>
                {lab.moved_from && (
                  <div className="moved-indicator" aria-label={`Moved from ${lab.moved_from}`}>
                    <span className="icon" aria-hidden="true">Moved:</span>
                    moved from {lab.moved_from}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {nonLabs.length > 0 && (
          <div className="theory-entries" role="group" aria-label="Theory sessions">
            {nonLabs.map((theory, index) => (
              <div key={index} className="theory-entry" role="article">
                <div className="theory-header">
                  <strong className="subject-name">{theory.subject}</strong>
                  <span className="entry-type" aria-label="Theory session">THEORY</span>
                </div>
                <div className="theory-details">
                  <span className="room" aria-label={`Room ${theory.room || 'To be assigned'}`}>
                    <span className="icon" aria-hidden="true">Room:</span>
                    {theory.room || 'TBA'}
                  </span>
                  <button 
                    className="teacher clickable-teacher"
                    onClick={() => handleTeacherReset(theory.teacher, day, slot)}
                    aria-label={`Teacher: ${theory.teacher || 'To be assigned'}. Click to reset`}
                    type="button"
                  >
                    <span className="icon" aria-hidden="true">Teacher:</span>
                    {theory.teacher || 'TBA'}
                  </button>
                </div>
                {theory.moved_from && (
                  <div className="moved-indicator" aria-label={`Moved from ${theory.moved_from}`}>
                    <span className="icon" aria-hidden="true">Moved:</span>
                    moved from {theory.moved_from}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {workshops.length > 0 && (
          <div className="workshop-entries" role="group" aria-label="Workshop sessions">
            {workshops.map((workshop, index) => (
              <div key={index} className="workshop-entry" role="article">
                <div className="workshop-header">
                  <span className="icon" aria-hidden="true">Workshop</span>
                  <strong>Workshop</strong>
                  <span className="entry-type" aria-label="Workshop session">WORKSHOP</span>
                </div>
                {workshop.moved_from && (
                  <div className="moved-indicator" aria-label={`Moved from ${workshop.moved_from}`}>
                    <span className="icon" aria-hidden="true">Moved:</span>
                    moved from {workshop.moved_from}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </td>
    );
  };

  const getLabStartEntry = (section, day, slot) => {
    const sectionLabSubjects = getSectionLabSubjects(section);
    const slotItems = groupedData[section]?.[day]?.[slot] || [];
    const labs = slotItems.filter((item) => sectionLabSubjects.includes(item.subject));
    if (!labs.length) return null;
    const first = labs[0];
    const dur = Number(first.duration || 1);
    if (dur <= 1) return null;
    const slotIdx = slots.indexOf(slot);
    if (slotIdx < 0) return null;
    const prevSlot = slotIdx > 0 ? slots[slotIdx - 1] : null;
    if (prevSlot) {
      const prevItems = groupedData[section]?.[day]?.[prevSlot] || [];
      const hasSamePrev = prevItems.some((p) =>
        p.subject === first.subject &&
        (p.group || "") === (first.group || "") &&
        (p.room || "") === (first.room || "") &&
        (p.teacher || "") === (first.teacher || "")
      );
      if (hasSamePrev) return null;
    }
    return { duration: dur };
  };

  const isLabContinuationSlot = (section, day, slot) => {
    const slotIdx = slots.indexOf(slot);
    if (slotIdx <= 0) return false;
    for (let back = 1; back <= 4; back += 1) {
      const prevIdx = slotIdx - back;
      if (prevIdx < 0) break;
      const prevSlot = slots[prevIdx];
      const start = getLabStartEntry(section, day, prevSlot);
      if (start && prevIdx + start.duration > slotIdx) {
        return true;
      }
    }
    return false;
  };

  const sectionsToDisplay = selectedSection === 'all' ? filteredSections : [selectedSection];

  return (
    <div className="timetable-display" role="application" aria-label="Academic Timetable">
      {/* Enhanced Header */}
      <div className="timetable-header">
        <div className="header-content">
          <div className="title-section">
            <h2 id="timetable-title"> Generated Timetable</h2>
            <p className="subtitle">Academic year schedule overview</p>
          </div>

          <div className="header-controls">
            {/* Search */}
            <div className="search-container">
              <label htmlFor="timetable-search" className="sr-only">Search timetable</label>
              <input
                id="timetable-search"
                type="text"
                placeholder="Search subjects, teachers, or rooms..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
                aria-describedby="search-help"
              />
              <span id="search-help" className="sr-only">
                Search through subjects, teachers, and room assignments
              </span>
            </div>

            {/* View Mode Toggle */}
            <div className="view-controls" role="radiogroup" aria-label="View mode">
              <button
                className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                aria-label="Grid view"
                disabled={isMobile}
              >
                 Grid
              </button>
              <button
                className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                aria-label="List view"
              >
                 List
              </button>
              <button
                className={`view-btn ${viewMode === 'compact' ? 'active' : ''}`}
                onClick={() => setViewMode('compact')}
                aria-pressed={viewMode === 'compact'}
                aria-label="Compact view"
              >
                 Compact
              </button>
            </div>

            {/* Section Filter */}
            <div className="section-filter">
              <label htmlFor="section-select">Section:</label>
              <select 
                id="section-select"
                value={selectedSection} 
                onChange={(e) => setSelectedSection(e.target.value)}
                aria-describedby="section-help"
              >
                <option value="all">All Sections</option>
                {sections.map(section => (
                  <option key={section} value={section}>{section}</option>
                ))}
              </select>
              <span id="section-help" className="sr-only">
                Filter timetable by specific section
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Statistics */}
      {timetableData.statistics && (
        <div className="statistics-summary" role="region" aria-label="Timetable statistics">
          <div className="stat-card">
            <div className="stat-icon" aria-hidden="true">CLS</div>
            <div className="stat-content">
              <div className="stat-value">{timetableData.statistics.total_classes}</div>
              <div className="stat-label">Classes</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" aria-hidden="true">SEC</div>
            <div className="stat-content">
              <div className="stat-value">{timetableData.statistics.total_sections}</div>
              <div className="stat-label">Sections</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" aria-hidden="true">USE</div>
            <div className="stat-content">
              <div className="stat-value">{timetableData.statistics.utilization_percentage?.toFixed(1)}%</div>
              <div className="stat-label">Utilization</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" aria-hidden="true">HRS</div>
            <div className="stat-content">
              <div className="stat-value">
                {timetableData.statistics.total_slots_used}/{timetableData.statistics.total_slots_available}
              </div>
              <div className="stat-label">Slots Used</div>
            </div>
          </div>
        </div>
      )}

      {/* Results info */}
      {searchTerm && (
        <div className="search-results" role="status" aria-live="polite">
          Showing {filteredSections.length} of {sections.length} sections for "{searchTerm}"
        </div>
      )}

      {/* Timetable Tables */}
      <div className={`timetable-sections view-${viewMode}`}>
        {sectionsToDisplay.length === 0 ? (
          <div className="no-results">
            <div className="no-results-icon">Search</div>
            <h3>No results found</h3>
            <p>Try adjusting your search terms or filters</p>
          </div>
        ) : (
          sectionsToDisplay.map(section => (
            <div key={section} className="section-timetable">
              <div className="section-header">
                <h3 id={`section-${section}`}>Section {section}</h3>
                <div className="section-meta">
                  {Object.values(groupedData[section] || {}).reduce((total, dayData) => 
                    total + Object.values(dayData || {}).reduce((dayTotal, slotData) => 
                      dayTotal + slotData.length, 0), 0
                  )} sessions scheduled
                </div>
              </div>

              {viewMode === "list" ? (
                <div className="list-container">
                  {days.map((day) => {
                    const dayRows = slots.flatMap((slot) => {
                      const items = groupedData[section]?.[day]?.[slot] || [];
                      const filtered = items.filter((x) => x && x.subject && x.subject !== "FREE");
                      return filtered.map((x, idx) => ({ ...x, _slot: slot, _idx: idx }));
                    });

                    return (
                      <div key={day} className="list-day-block">
                        <div className="list-day-title">{day}</div>
                        {dayRows.length === 0 ? (
                          <div className="list-empty">No classes</div>
                        ) : (
                          dayRows.map((row) => (
                            <div key={`${day}-${row._slot}-${row.subject}-${row._idx}`} className="list-item">
                              <div className="list-top">
                                <strong>{row.subject}</strong>
                                <span>{row.group ? "LAB" : "THEORY"}</span>
                              </div>
                              <div className="list-meta">Time: {row._slot}</div>
                              <div className="list-meta">Room: {row.room || "TBA"}</div>
                              <div className="list-meta">Teacher: {row.teacher || "TBA"}</div>
                              {row.group && <div className="list-meta">Group: {row.group}</div>}
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
              <div className="table-container">
                <table 
                  className="timetable-table" 
                  role="grid"
                  aria-labelledby={`section-${section}`}
                  ref={tableRef}
                >
                  <thead>
                    <tr role="row">
                      <th className="day-header" role="columnheader" scope="col" aria-sort="none">
                        Day / Time
                      </th>
                      {slots.map(slot => (
                        <th key={slot} className="slot-header" role="columnheader" scope="col">
                          {slot}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map(day => (
                      <tr key={day} role="row">
                        <th className="day-cell" role="rowheader" scope="row">
                          <strong>{day}</strong>
                        </th>
                        {(() => {
                          const rowCells = [];
                          let i = 0;
                          while (i < slots.length) {
                            const slot = slots[i];
                            if (slot === "Lunch Break") {
                              rowCells.push(renderCell(section, day, slot));
                              i += 1;
                              continue;
                            }
                            if (isLabContinuationSlot(section, day, slot)) {
                              i += 1;
                              continue;
                            }
                            const start = getLabStartEntry(section, day, slot);
                            if (start && start.duration > 1) {
                              const base = renderCell(section, day, slot);
                              rowCells.push(React.cloneElement(base, { key: `${slot}-span`, colSpan: start.duration }));
                              i += start.duration;
                              continue;
                            }
                            rowCells.push(renderCell(section, day, slot));
                            i += 1;
                          }
                          return rowCells;
                        })()}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Enhanced Warnings */}
      {timetableData.validation_warnings && timetableData.validation_warnings.length > 0 && (
        <div className="warnings-section" role="region" aria-label="Warnings">
          <h4>
            <span className="icon" aria-hidden="true">Warning</span>
            Warnings ({timetableData.validation_warnings.length})
          </h4>
          <ul>
            {timetableData.validation_warnings.map((warning, index) => (
              <li key={index} role="alert">{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Enhanced Unfulfilled Requirements */}
      {timetableData.unfulfilled && Object.keys(timetableData.unfulfilled).length > 0 && (
        <div className="unfulfilled-section" role="region" aria-label="Unfulfilled requirements">
          <h4>
            <span className="icon" aria-hidden="true">Error</span>
            Unfulfilled Requirements
          </h4>
          {Object.entries(timetableData.unfulfilled).map(([section, subjects]) => (
            <div key={section} className="unfulfilled-section-item">
              <strong>{section}:</strong>
              <ul>
                {Object.entries(subjects).map(([subject, count]) => (
                  <li key={subject}>
                    <strong>{subject}:</strong> {count} lectures missing
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Keyboard navigation help */}
      <div className="keyboard-help sr-only" role="region" aria-label="Keyboard navigation help">
        <h4>Keyboard Navigation:</h4>
        <ul>
          <li>Arrow keys: Navigate between cells</li>
          <li>Tab: Move to next interactive element</li>
          <li>Enter/Space: Activate focused element</li>
          <li>Escape: Clear focus</li>
        </ul>
      </div>
    </div>
  );
};

export default TimetableDisplay;

