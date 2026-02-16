import React, { useEffect, useState } from 'react';
import { TimetableAPI } from '../services/api-services';
import TimetableDisplay from './TimetableDisplay';
import './MultipleTimetableGenerator.css';

const SAVED_TIMETABLE_KEY = 'saved_timetable';

const MultipleTimetableGenerator = ({ inputData }) => {
  const [timetables, setTimetables] = useState([]);
  const [currentTimetable, setCurrentTimetable] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generationCount, setGenerationCount] = useState(3);
  const [publishMessage, setPublishMessage] = useState('');
  const [discarding, setDiscarding] = useState(false);
  const [publishedLocked, setPublishedLocked] = useState(false);

  const checkPublishedLock = async () => {
    try {
      await TimetableAPI.getPublishedTimetable();
      setPublishedLocked(true);
    } catch (err) {
      if ((err.message || '').toLowerCase().includes('no published timetable')) {
        setPublishedLocked(false);
      } else {
        setPublishedLocked(false);
      }
    }
  };

  useEffect(() => {
    checkPublishedLock();
  }, []);

  const generateMultipleTimetables = async () => {
    if (publishedLocked) {
      setError('A timetable is already published. Discard it before generating a new one.');
      return;
    }

    if (!inputData) {
      setError('No input data provided');
      return;
    }

    setLoading(true);
    setError(null);
    setPublishMessage('');
    setTimetables([]);

    try {
      const { results, errors } = await TimetableAPI.generateMultipleTimetables(inputData, generationCount);
      if (results.length === 0) {
        throw new Error('No timetables could be generated');
      }
      setTimetables(results);
      setCurrentTimetable(0);
      if (errors.length > 0) {
        console.warn('Some timetable generations failed:', errors);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetTeacher = async (teacher, day, slot) => {
    if (timetables.length === 0) return;
    const currentData = timetables[currentTimetable];
    if (!currentData) return;

    setLoading(true);
    try {
      const resetResult = await TimetableAPI.resetTeacher(
        inputData,
        currentData.data.timetable,
        teacher,
        day,
        slot
      );
      const updated = [...timetables];
      updated[currentTimetable] = {
        ...currentData,
        data: {
          ...currentData.data,
          timetable: resetResult.timetable,
        },
        name: `${currentData.name} (Modified)`,
      };
      setTimetables(updated);
    } catch (err) {
      setError(`Failed to reset teacher: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const exportTimetable = (timetableData, format = 'json') => {
    const dataStr = JSON.stringify(timetableData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `timetable_${timetableData.name.replace(/\s+/g, '_')}.${format}`;
    link.click();
  };

  const saveCurrentTimetable = () => {
    if (timetables.length === 0) return;
    const current = timetables[currentTimetable];
    if (!current || !inputData) return;

    try {
      const completeData = {
        ...current.data,
        inputData,
        savedAt: new Date().toISOString(),
        name: current.name,
      };
      localStorage.setItem(SAVED_TIMETABLE_KEY, JSON.stringify(completeData));
      alert(`Timetable "${current.name}" saved successfully with input data.`);
    } catch (e) {
      alert(`Failed to save timetable: ${e.message}`);
    }
  };

  const publishCurrentTimetable = async () => {
    if (publishedLocked) {
      setError('A timetable is already published. Discard it before publishing a new one.');
      return;
    }

    if (timetables.length === 0 || !inputData) return;
    const current = timetables[currentTimetable];
    if (!current) return;

    setError(null);
    setPublishMessage('');
    try {
      await TimetableAPI.publishTimetable(inputData, current.data);
      setPublishMessage(`Published "${current.name}" successfully.`);
      setPublishedLocked(true);
    } catch (err) {
      setError(err.message || 'Failed to publish timetable');
    }
  };

  const discardPublishedTimetable = async () => {
    if (!window.confirm('Discard published timetable? This can only be done by admin.')) return;

    setError(null);
    setPublishMessage('');
    setDiscarding(true);
    try {
      await TimetableAPI.deletePublishedTimetable();
      localStorage.removeItem(SAVED_TIMETABLE_KEY);
      setPublishMessage('Published timetable discarded successfully.');
      await checkPublishedLock();
    } catch (err) {
      setError(err.message || 'Failed to discard published timetable');
    } finally {
      setDiscarding(false);
    }
  };

  const compareTimetables = () => {
    if (timetables.length < 2) return null;
    return (
      <div className="comparison-metrics">
        <h3>Comparison Metrics</h3>
        <div className="metrics-grid">
          {timetables.map((tt, index) => (
            <div key={index} className="metric-card">
              <h4>{tt.name}</h4>
              <div className="metric-item">
                <span>Utilization:</span>
                <span>{tt.data.statistics?.utilization_percentage?.toFixed(1) || 0}%</span>
              </div>
              <div className="metric-item">
                <span>Slots Used:</span>
                <span>{tt.data.statistics?.total_slots_used || 0}</span>
              </div>
              <div className="metric-item">
                <span>Unfulfilled:</span>
                <span className={Object.keys(tt.data.unfulfilled || {}).length > 0 ? 'unfulfilled' : 'fulfilled'}>
                  {Object.keys(tt.data.unfulfilled || {}).length}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="multiple-timetable-generator" style={{ margin: 0 }}>
      <div className="generator-header">
        <h2>Multiple Timetable Generator</h2>
        <p>Generate multiple timetable variations and choose the best one.</p>
      </div>

      <div className="generation-controls">
        {publishedLocked && (
          <div className="mb-3 p-3 rounded bg-amber-50 text-amber-800 border border-amber-200">
            A timetable is currently published. You must click <strong>Discard Published</strong> before generating or publishing another.
          </div>
        )}
        <div className="control-group">
          <label htmlFor="generation-count">Number of variations to generate:</label>
          <select
            id="generation-count"
            value={generationCount}
            onChange={(e) => setGenerationCount(parseInt(e.target.value, 10))}
            disabled={loading}
          >
            <option value={2}>2 Variations</option>
            <option value={3}>3 Variations</option>
            <option value={4}>4 Variations</option>
            <option value={5}>5 Variations</option>
          </select>
        </div>

        <button
          onClick={generateMultipleTimetables}
          disabled={loading || !inputData || publishedLocked}
          className="generate-btn"
        >
          {loading ? 'Generating...' : `Generate ${generationCount} Timetables`}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {timetables.length > 0 && (
        <>
          <div className="timetable-navigation">
            <div className="nav-tabs">
              {timetables.map((tt, index) => (
                <button
                  key={index}
                  className={`tab ${currentTimetable === index ? 'active' : ''}`}
                  onClick={() => setCurrentTimetable(index)}
                >
                  {tt.name}
                  <span className="utilization-badge">
                    {tt.data.statistics?.utilization_percentage?.toFixed(0) || 0}%
                  </span>
                </button>
              ))}
            </div>

            <div className="timetable-actions">
              <button onClick={() => exportTimetable(timetables[currentTimetable])} className="action-btn export-btn">
                Export
              </button>
              <button onClick={saveCurrentTimetable} className="action-btn save-btn" disabled={!inputData}>
                Save Selected Timetable
              </button>
              <button onClick={publishCurrentTimetable} className="action-btn save-btn" disabled={!inputData || publishedLocked}>
                Publish Timetable
              </button>
              <button
                onClick={discardPublishedTimetable}
                className="action-btn export-btn"
                disabled={discarding}
              >
                {discarding ? 'Discarding...' : 'Discard Published'}
              </button>
            </div>
          </div>

          {publishMessage && (
            <div className="mt-3 p-3 rounded bg-green-50 text-green-700 border border-green-200">
              {publishMessage}
            </div>
          )}

          {compareTimetables()}

          <div className="current-timetable">
            <TimetableDisplay
              timetableData={timetables[currentTimetable]?.data}
              inputData={inputData}
              onResetTeacher={handleResetTeacher}
            />
          </div>

          <div className="generation-summary">
            <h3>Generation Summary</h3>
            <div className="summary-stats">
              <div className="summary-item">
                <strong>Generated:</strong> {timetables.length} timetable(s)
              </div>
              <div className="summary-item">
                <strong>Best Utilization:</strong>{' '}
                {Math.max(...timetables.map((tt) => tt.data.statistics?.utilization_percentage || 0)).toFixed(1)}%
              </div>
              <div className="summary-item">
                <strong>Generated At:</strong>{' '}
                {new Date(timetables[currentTimetable]?.generated_at).toLocaleString()}
              </div>
            </div>
          </div>
        </>
      )}

      {!inputData && (
        <div className="no-input-message">
          Please configure classes, subjects, and constraints first.
        </div>
      )}
    </div>
  );
};

export default MultipleTimetableGenerator;
