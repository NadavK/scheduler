
// ============================================
// REACT COMPONENTS
// All UI components for the Lechu Scheduler
// ============================================

const VERSION = 'v2.3.0';

const VersionBadge = ({ className = '' }) => (
    <span className={`text-xs text-gray-500 ${className}`}>{VERSION}</span>
);

// Login Screen Component
const LoginScreen = ({ username, setUsername, password, setPassword, loginError, loggingIn, handleLogin }) => (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
            <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">לו"ז לכו-נרננה</h1>
            <form onSubmit={handleLogin} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">שם</label>
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">סיסמא</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" required />
                </div>
                {loginError && <div className="text-red-600 text-sm text-center">{loginError}</div>}
                <button type="submit" disabled={loggingIn}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-semibold">
                    {loggingIn ? 'Logging in...' : 'Login'}
                </button>
            </form>
        </div>
    </div>
);

// Header Component
const Header = ({
    activeTab, setActiveTab, userRole, currentUsername, lastSaved, saving,
    saveSchedules, handleLogout, addSchedule, outputs, filtersExpanded,
    setFiltersExpanded, filterOutput, filterDay, filterEnabled
}) => (
    <div className="bg-white rounded-lg shadow-md p-2 sm:p-3 mb-2">
        {/* Mobile Row 1 */}
        <div className="flex sm:hidden items-center justify-between mb-2">
            <h1 className="text-lg font-bold text-gray-800">
                לו"ז שבועי <VersionBadge />
            </h1>
            <div className="flex items-center gap-2">
                <button onClick={saveSchedules} disabled={saving}
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700 disabled:bg-gray-400">
                    {saving ? 'שומר...' : 'שמור'}
                </button>
                <button onClick={handleLogout}
                    className="px-3 py-1 bg-gray-600 text-white rounded text-sm font-semibold hover:bg-gray-700">יציאה</button>
            </div>
        </div>

        {/* Desktop + Mobile Row 2 */}
        <div className="flex flex-wrap items-center gap-2">
            <h1 className="hidden sm:block text-lg sm:text-xl font-bold text-gray-800">
                לו"ז שבועי <VersionBadge />
            </h1>

            {/* Tabs */}
            <div className="flex gap-1 flex-wrap">
                <button onClick={() => setActiveTab('schedules')}
                    className={`px-3 py-1 text-sm font-semibold rounded transition-colors ${activeTab === 'schedules' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>לו"ז</button>
                <button onClick={() => setActiveTab('control')}
                    className={`px-3 py-1 text-sm font-semibold rounded transition-colors ${activeTab === 'control' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>שליטה ידנית</button>
                <button onClick={() => setActiveTab('history')}
                    className={`px-3 py-1 text-sm font-semibold rounded transition-colors ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>היסטוריה</button>
                {userRole === 'admin' && (
                    <button onClick={() => setActiveTab('admin')}
                        className={`px-3 py-1 text-sm font-semibold rounded transition-colors ${activeTab === 'admin' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>ניהול</button>
                )}
            </div>

            {activeTab === 'schedules' && (
                <button onClick={addSchedule} disabled={outputs.length === 0}
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700" title="הוסף הפעלה">+ הוסף</button>
            )}

            {activeTab === 'schedules' && (
                <button onClick={() => setFiltersExpanded(!filtersExpanded)}
                    className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                        filterOutput !== 'all' || filterDay !== 'all' || filterEnabled !== 'all'
                            ? 'bg-blue-200 text-blue-800 hover:bg-blue-300' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`} title="פילטרים">🔍 {filtersExpanded ? '▲' : '▼'}</button>
            )}

            <div className="hidden sm:block flex-1"></div>

            <div className="hidden sm:flex items-center gap-2">
                <span className="text-xs text-gray-600">{currentUsername} {userRole === 'admin' && '(Admin)'}</span>
                {lastSaved && <div className="text-xs text-gray-600">{lastSaved.toLocaleTimeString()}</div>}
                <button onClick={saveSchedules} disabled={saving}
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700 disabled:bg-gray-400">
                    {saving ? 'שומר...' : 'שמור'}
                </button>
                <button onClick={handleLogout}
                    className="px-3 py-1 bg-gray-600 text-white rounded text-sm font-semibold hover:bg-gray-700">יציאה</button>
            </div>
        </div>
    </div>
);

// Schedules Tab Component
const SchedulesTab = ({
    outputs, displayedSchedules, days, dayLabels, updateSchedule,
    copySchedule, deleteSchedule
}) => (
    <div className="bg-white rounded-lg shadow-md p-2 sm:p-3">
        {outputs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">אין יציאות מוגדרות</div>
        ) : displayedSchedules.length === 0 ? (
            <div className="text-center py-8 text-gray-500">אין הפעלות. לחץ על "+ הוסף" כדי ליצור הפעלה חדשה.</div>
        ) : (
            <div className="space-y-0">
                {displayedSchedules.map((schedule) => {
                    const isFixed = schedule.fixed !== false;

                    return (
                        <div key={schedule.id}
                            className={`p-2 rounded-lg border mb-1 ${schedule.enabled === false ? 'bg-gray-100 border-gray-400' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="flex flex-nowrap items-center gap-2 w-full md:justify-center">
                                {/* Schedule Type Toggle (Sun icon for sunset) */}
                                <button
                                    onClick={() => {
                                        const newFixed = !isFixed;
                                        updateSchedule(schedule.id, 'fixed', newFixed);

                                        // Clear time when switching between fixed/sunset to avoid format confusion
                                        if (schedule.time) {
                                            if (newFixed && (schedule.time.startsWith('+') || schedule.time.startsWith('-'))) {
                                                // Switching to fixed: remove +/- prefix
                                                updateSchedule(schedule.id, 'time', schedule.time.substring(1));
                                            } else if (!newFixed && !schedule.time.startsWith('+') && !schedule.time.startsWith('-')) {
                                                // Switching to sunset: add + prefix
                                                updateSchedule(schedule.id, 'time', '+' + schedule.time);
                                            }
                                        }
                                    }}
                                    className={`px-2 py-1 rounded font-semibold text-sm shrink-0 w-6 md:w-10 flex items-center justify-center ${
                                        isFixed ? 'bg-gray-200 text-gray-700' : 'bg-orange-200 text-orange-700'
                                    }`}
                                    title={isFixed ? 'זמן קבוע' : 'זריחה/שקיעה'}>
                                    {isFixed ? '🕐' : '🌅'}
                                </button>


                                <select value={schedule.day}
                                    onChange={(e) => updateSchedule(schedule.id, 'day', e.target.value)}
                                    className="px-0 py-1 border border-gray-300 rounded text-sm shrink-0 min-w-0 w-8 md:w-20 md:text-sm">
                                    {!schedule.day && <option value="">יום</option>}
                                    {days.map(day => (
                                        <option key={day} value={day}>{dayLabels[day]}</option>
                                    ))}
                                </select>

                                {/* Time Input - Changes based on fixed/sunset */}
                                <input
                                    type="text"
                                    value={schedule.time}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        if (value === '') {
                                            updateSchedule(schedule.id, 'time', value);
                                            return;
                                        }
                                        // For sunset schedules, allow +/- prefix
                                        if (!isFixed) {
                                            // Allow: +, -, +1, -2, +12, +12:, +12:3, +12:30, etc.
                                            if (/^[+-]$/.test(value) ||
                                                /^[+-]([0-9]|[01]?[0-9]|2[0-3])$/.test(value) ||
                                                /^[+-]([0-9]|[01]?[0-9]|2[0-3]):$/.test(value) ||
                                                /^[+-]([0-9]|[01]?[0-9]|2[0-3]):[0-5]?[0-9]?$/.test(value)) {
                                                updateSchedule(schedule.id, 'time', value);

                                                // Auto-add colon after 2-digit hour (e.g., +12 -> +12:)
                                                if (/^[+-][0-9]{2}$/.test(value)) {
                                                    updateSchedule(schedule.id, 'time', value + ':');
                                                }
                                            }
                                        } else {
                                            // For fixed schedules, no +/- prefix
                                            if (/^([0-9]|[01]?[0-9]|2[0-3])$/.test(value) ||
                                                /^([0-9]|[01]?[0-9]|2[0-3]):$/.test(value) ||
                                                /^([0-9]|[01]?[0-9]|2[0-3]):[0-5]?[0-9]?$/.test(value)) {
                                                updateSchedule(schedule.id, 'time', value);

                                                // Auto-add colon after 2-digit hour (e.g., 12 -> 12:)
                                                if (/^[0-9]{2}$/.test(value)) {
                                                    updateSchedule(schedule.id, 'time', value + ':');
                                                }
                                            }
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        // Handle backspace on colon
                                        if (e.key === 'Backspace') {
                                            const value = schedule.time;
                                            const cursorPos = e.target.selectionStart;

                                            // If cursor is right after a colon, remove the digit before the colon
                                            if (cursorPos > 0 && value[cursorPos - 1] === ':') {
                                                e.preventDefault();
                                                const newValue = value.substring(0, cursorPos - 2) + value.substring(cursorPos);
                                                updateSchedule(schedule.id, 'time', newValue);
                                            }
                                        }
                                    }}
                                    onBlur={(e) => {
                                        const value = e.target.value;
                                        if (!value) return;

                                        if (!isFixed) {
                                            // Sunset schedule: validate ±HH:MM format (sign at the left)
                                            const timeRegex = /^[+-]([0-9]|[01][0-9]|2[0-3]):[0-5][0-9]$/;
                                            if (!timeRegex.test(value)) {
                                                updateSchedule(schedule.id, 'time', '');
                                            } else if (!value.startsWith('+') && !value.startsWith('-')) {
                                                // Add + if no sign
                                                updateSchedule(schedule.id, 'time', '+' + value);
                                            }
                                        } else {
                                            // Fixed schedule: validate HH:MM format
                                            const timeRegex = /^([0-9]|[01][0-9]|2[0-3]):[0-5][0-9]$/;
                                            if (!timeRegex.test(value)) {
                                                updateSchedule(schedule.id, 'time', '');
                                            }
                                        }
                                    }}
                                    placeholder={isFixed ? "HH:MM" : "±HH:MM"}
                                    dir="ltr"
                                    className="px-0 py-1 border border-gray-300 rounded text-sm text-center w-14 shrink-0 md:w-20 md:text-sm"
                                    required />

                                <select value={schedule.gpio || ''}
                                    onChange={(e) => updateSchedule(schedule.id, 'gpio', parseInt(e.target.value))}
                                    className="px-2 py-1 border border-gray-300 rounded text-sm shrink min-w-0 md:w-36 md:text-sm">
                                    {!schedule.gpio && <option value="">בחר מיקום</option>}
                                    {outputs.map(output => (
                                        <option key={output.gpio} value={output.gpio}>{output.name}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => updateSchedule(schedule.id, 'action', schedule.action === 'on' ? 'off' : 'on')}
                                    className={`px-2 py-1 rounded font-semibold text-sm w-6 h-6 md:w-10 flex items-center justify-center shrink-0 ${
                                        schedule.action === 'on' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                                    }`}>
                                    {schedule.action === 'on' ? '⚡' : '⭘'}
                                </button>
                                <button
                                    onClick={() => updateSchedule(schedule.id, 'enabled', schedule.enabled === false)}
                                    className={`px-0 py-1 rounded font-semibold text-sm shrink-0 w-4 text-center md:w-10 md:text-base ${
                                        schedule.enabled !== false ? 'bg-transparent text-green-600' : 'bg-gray-200 text-gray-500'
                                    }`}>
                                    {schedule.enabled !== false ? '✓' : '✗'}
                                </button>
                                <button onClick={() => copySchedule(schedule)}
                                    className="px-0 py-1 text-gray-600 hover:text-blue-600 rounded font-semibold text-sm shrink-0 w-5 text-center md:w-8 md:text-base">
                                    ⧉
                                </button>
                                <button onClick={() => deleteSchedule(schedule.id)}
                                    className="px-0 py-1 text-gray-600 hover:text-red-600 rounded font-semibold text-sm shrink-0 w-5 text-center md:w-8 md:text-base">
                                    🗑
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
    </div>
);

// Control Tab Component - unchanged
const ControlTab = ({ outputs, controlGPIO }) => (
    <div className="bg-white rounded-lg shadow-md p-3 sm:p-4">
        <h2 className="text-lg font-bold text-gray-800 mb-3">שליטה ידנית GPIO</h2>
        {outputs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">אין יציאות מוגדרות</div>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {outputs.map(output => (
                    <div key={output.gpio} className="p-3 bg-gray-50 rounded-lg border-2 border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <div className="font-semibold text-gray-800">{output.name}</div>
                                <div className="text-xs text-gray-500">GPIO {output.gpio}</div>
                            </div>
                            <div className={`px-2 py-1 rounded-full text-xs font-semibold ${output.state ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                                {output.state ? 'ON' : 'OFF'}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => controlGPIO(output.gpio, true)}
                                className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-sm">ON</button>
                            <button onClick={() => controlGPIO(output.gpio, false)}
                                className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold text-sm">OFF</button>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
);

// History Tab Component - unchanged
const HistoryTab = ({ historyView, setHistoryView, changeHistory, executionHistory, getOutputName, dayLabels }) => {
    const [expandedChange, setExpandedChange] = useState(null);

    // Helper function to format schedule type indicator
    const getScheduleTypeIcon = (fixed) => {
        // fixed is a boolean: true = fixed time, false = sunset-based
        return fixed !== false ? '🕐' : '🌅';
    };

    const getExecutionSourceLabel = (execution) => {
        if (execution.execution_type === 'scheduled') {
            return 'Schedule';
        }
        return execution.username || 'Manual';
    };

    return (
        <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex gap-2 mb-4">
                <button onClick={() => setHistoryView('changes')}
                    className={`px-4 py-2 rounded font-semibold ${historyView === 'changes' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                    שינויי לוח זמנים
                </button>
                <button onClick={() => setHistoryView('executions')}
                    className={`px-4 py-2 rounded font-semibold ${historyView === 'executions' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                    ביצועים
                </button>
            </div>

            {historyView === 'changes' && (
                <div className="space-y-2">
                    {changeHistory.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">אין היסטוריית שינויים</div>
                    ) : (
                        changeHistory.map(h => (
                            <div key={h.id} className="bg-gray-50 rounded border border-gray-200">
                                <div className="p-3 cursor-pointer" onClick={() => setExpandedChange(expandedChange === h.id ? null : h.id)}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-semibold text-blue-700">{h.username}</span>
                                        <span className="text-gray-600">{h.timestamp}</span>
                                    </div>
                                    <div className="text-sm mt-1">
                                        {h.changes.added?.length > 0 && <span className="text-green-600 ml-2">נוספו: {h.changes.added.length}</span>}
                                        {h.changes.updated?.length > 0 && <span className="text-blue-600 ml-2">עודכנו: {h.changes.updated.length}</span>}
                                        {h.changes.deleted?.length > 0 && <span className="text-red-600 ml-2">נמחקו: {h.changes.deleted.length}</span>}
                                        <span className="text-gray-500 text-xs mr-2">{expandedChange === h.id ? '▼' : ''} פרטים</span>
                                    </div>
                                </div>

                                {expandedChange === h.id && (
                                    <div className="px-3 pb-3 pt-0 border-t border-gray-200 mt-2">
                                        {h.changes.added?.length > 0 && (
                                            <div className="mt-2">
                                                <div className="font-semibold text-green-700 text-sm mb-1">נוספו:</div>
                                                {h.changes.added.map((item, idx) => (
                                                    <div key={idx} className="text-xs bg-green-50 p-2 rounded mb-1">
                                                        <span className="inline-block ml-1">{getScheduleTypeIcon(item.fixed)}</span>
                                                        {dayLabels[item.day]} {item.time} - {getOutputName(item.gpio)} → {item.action.toUpperCase()}
                                                        {item.enabled === false && <span className="text-gray-500"> (כבוי)</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {h.changes.updated?.length > 0 && (
                                            <div className="mt-2">
                                                <div className="font-semibold text-blue-700 text-sm mb-1">עודכנו:</div>
                                                {h.changes.updated.map((item, idx) => (
                                                    <div key={idx} className="text-xs bg-blue-50 p-2 rounded mb-1">
                                                        <div className="text-red-600">
                                                            <span className="inline-block w-10">ישן:</span>
                                                            <span className="inline-block ml-1">{getScheduleTypeIcon(item.old.fixed)}</span>
                                                            {dayLabels[item.old.day]} {item.old.time} - {getOutputName(item.old.gpio)} → {item.old.action.toUpperCase()}
                                                            {item.old.enabled === false && <span className="text-gray-500"> (כבוי)</span>}
                                                        </div>
                                                        <div className="text-green-600">
                                                            <span className="inline-block w-10">חדש:</span>
                                                            <span className="inline-block ml-1">{getScheduleTypeIcon(item.new.fixed)}</span>
                                                            {dayLabels[item.new.day]} {item.new.time} - {getOutputName(item.new.gpio)} → {item.new.action.toUpperCase()}
                                                            {item.new.enabled === false && <span className="text-gray-500"> (כבוי)</span>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {h.changes.deleted?.length > 0 && (
                                            <div className="mt-2">
                                                <div className="font-semibold text-red-700 text-sm mb-1">נמחקו:</div>
                                                {h.changes.deleted.map((item, idx) => (
                                                    <div key={idx} className="text-xs bg-red-50 p-2 rounded mb-1">
                                                        <span className="inline-block ml-1">{getScheduleTypeIcon(item.fixed)}</span>
                                                        {dayLabels[item.day]} {item.time} - {getOutputName(item.gpio)} → {item.action.toUpperCase()}
                                                        {item.enabled === false && <span className="text-gray-500"> (כבוי)</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            {historyView === 'executions' && (
                <div className="space-y-2">
                    {executionHistory.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">אין היסטוריית ביצועים</div>
                    ) : (
                        executionHistory.map(e => (
                            <div key={e.id} className={`p-3 rounded border ${e.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                <div className="flex justify-between text-sm">
                                    <span className="font-semibold">
                                        {getOutputName(e.gpio)} → <span className={e.action === 'on' ? 'text-green-700' : 'text-red-700'}>{e.action.toUpperCase()}</span>
                                    </span>
                                    <span className="text-gray-600">{e.timestamp}</span>
                                </div>
                               <div className="text-xs text-gray-600">
                                    {e.execution_type === 'scheduled' ? '🕒 Schedule' : '👤 ' + getExecutionSourceLabel(e)}
                                </div>
                                {!e.success && e.error_message && (
                                    <div className="text-xs text-red-600 mt-1">שגיאה: {e.error_message}</div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

// Admin Tab Component - unchanged
const AdminTab = ({
    users, newUsername, setNewUsername, newPassword, setNewPassword,
    newUserRole, setNewUserRole, createUser, deleteUser, currentUsername,
    outputs, newOutputName, setNewOutputName, newOutputGpio, setNewOutputGpio,
    addOutput, updateOutputName, deleteOutput, saveOutputs, changeUserPassword,
    exportBackup, importBackup, importBackupFile, setImportBackupFile, backupBusy,
    deviceTime
}) => {
    const [changingPasswordFor, setChangingPasswordFor] = useState(null);
    const [newPasswordInput, setNewPasswordInput] = useState('');
    const [updatingBackend, setUpdatingBackend] = useState(false);

    const updateBackend = async () => {
        if (!window.confirm('This will backup current source files, download the latest version, and replace main.py + www/. Continue?')) {
            return;
        }

        try {
            setUpdatingBackend(true);
            const response = await fetch('/api/admin/update-backend', {
                method: 'POST'
            });
            const data = await response.json();

            if (response.ok) {
                alert(`${data.message}\nBackup: ${data.backup_dir}`);
            } else {
                alert(data.error || 'שגיאה בעדכון ה-backend');
            }
        } catch (error) {
            console.error('Error updating backend:', error);
            alert('שגיאה בעדכון ה-backend');
        } finally {
            setUpdatingBackend(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-md p-4">
                <h2 className="text-lg font-bold text-gray-800 mb-2">זמן המכשיר</h2>
                <div className="text-sm text-gray-700">
                    {deviceTime || 'טוען...'}
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-4">
                <h2 className="text-lg font-bold text-gray-800 mb-4">ניהול</h2>
                <button
                    onClick={updateBackend}
                    disabled={updatingBackend}
                    className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 font-semibold"
                >
                    {updatingBackend ? 'Updating...' : 'Download Latest Version'}
                </button>
                <div className="text-xs text-gray-500 mt-2">
                    Backs up <code>main.py</code> and <code>www/</code>, then replaces them from GitHub.
                </div>
            </div>

    const handlePasswordChange = async (username) => {
        if (!newPasswordInput) {
            alert('נא להזין סיסמה חדשה');
            return;
        }
        await changeUserPassword(username, newPasswordInput);
        setChangingPasswordFor(null);
        setNewPasswordInput('');
    };

    return (
        <div className="space-y-4">
            {/* Device Time */}
            <div className="bg-white rounded-lg shadow-md p-4">
                <h2 className="text-lg font-bold text-gray-800 mb-2">זמן המכשיר</h2>
                <div className="text-sm text-gray-700">
                    {deviceTime || 'טוען...'}
                </div>
            </div>

            {/* User Management */}
            <div className="bg-white rounded-lg shadow-md p-4">
                <h2 className="text-lg font-bold text-gray-800 mb-4">ניהול משתמשים</h2>
                <form onSubmit={createUser} className="mb-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-semibold text-gray-700 mb-3">הוסף משתמש חדש</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <input type="text" placeholder="שם משתמש" value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500" />
                        <input type="password" placeholder="סיסמה" value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500" />
                        <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500">
                            <option value="user">משתמש רגיל</option>
                            <option value="admin">מנהל</option>
                        </select>
                        <button type="submit"
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold">
                            הוסף משתמש
                        </button>
                    </div>
                </form>
                <div className="space-y-2">
                    <h3 className="font-semibold text-gray-700 mb-2">משתמשים קיימים</h3>
                    {Object.entries(users).map(([username, userData]) => (
                        <div key={username} className="p-3 bg-gray-50 rounded border border-gray-200">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="font-semibold">{username}</span>
                                    <span className={`mr-2 px-2 py-1 text-xs rounded ${
                                        userData.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                                    }`}>
                                        {userData.role === 'admin' ? 'מנהל' : 'משתמש'}
                                    </span>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setChangingPasswordFor(changingPasswordFor === username ? null : username)}
                                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-semibold">
                                        🔑 שנה סיסמה
                                    </button>
                                    {username !== currentUsername && (
                                        <button onClick={() => deleteUser(username)}
                                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-semibold">
                                            מחק
                                        </button>
                                    )}
                                </div>
                            </div>

                            {changingPasswordFor === username && (
                                <div className="mt-3 pt-3 border-t border-gray-300 flex gap-2">
                                    <input type="password" placeholder="סיסמה חדשה" value={newPasswordInput}
                                        onChange={(e) => setNewPasswordInput(e.target.value)}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                        onKeyPress={(e) => e.key === 'Enter' && handlePasswordChange(username)} />
                                    <button onClick={() => handlePasswordChange(username)}
                                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold">
                                        שמור
                                    </button>
                                    <button onClick={() => { setChangingPasswordFor(null); setNewPasswordInput(''); }}
                                        className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500 font-semibold">
                                        ביטול
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Output Management */}
            <div className="bg-white rounded-lg shadow-md p-4">
                <h2 className="text-lg font-bold text-gray-800 mb-4">ניהול יציאות GPIO</h2>
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-semibold text-gray-700 mb-3">הוסף יציאה חדשה</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input type="text" placeholder="שם היציאה" value={newOutputName}
                            onChange={(e) => setNewOutputName(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500" />
                        <input type="number" placeholder="מספר GPIO" value={newOutputGpio}
                            onChange={(e) => setNewOutputGpio(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500" />
                        <button onClick={addOutput}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold">
                            הוסף יציאה
                        </button>
                    </div>
                </div>
                <div className="space-y-2">
                    <h3 className="font-semibold text-gray-700 mb-2">יציאות קיימות</h3>
                    {outputs.map(output => (
                        <div key={output.gpio} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200 gap-3">
                            <div className="flex items-center gap-2 flex-1">
                                <span className="text-sm text-gray-600 whitespace-nowrap">(GPIO {output.gpio})</span>
                                <input
                                    type="text"
                                    value={output.name}
                                    onChange={(e) => updateOutputName(output.gpio, e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                    placeholder="שם היציאה"
                                />
                            </div>
                            <button onClick={() => deleteOutput(output.gpio)}
                                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-semibold">
                                מחק
                            </button>
                        </div>
                    ))}
                </div>
                <button onClick={saveOutputs}
                    className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold">
                    שמור שינויים
                </button>
            </div>

            {/* Backup Management */}
            <div className="bg-white rounded-lg shadow-md p-4">
                <h2 className="text-lg font-bold text-gray-800 mb-4">גיבוי ושחזור</h2>
                <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    <div>
                        <h3 className="font-semibold text-gray-700 mb-2">ייצוא גיבוי</h3>
                        <p className="text-sm text-gray-600 mb-3">
                            ייצא קובץ גיבוי של הנתונים. היסטוריית שינויים וביצועים מוגבלת ל-1000 הרשומות האחרונות.
                        </p>
                        <button
                            onClick={exportBackup}
                            disabled={backupBusy}
                            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 font-semibold">
                            {backupBusy ? 'מעבד...' : 'ייצא גיבוי'}
                        </button>
                    </div>

                    <div className="border-t border-gray-200 pt-4">
                        <h3 className="font-semibold text-gray-700 mb-2">ייבוא גיבוי</h3>
                        <p className="text-sm text-gray-600 mb-3">
                            ייבוא גיבוי יחליף את הנתונים הקיימים. יישוחזרו עד 1000 רשומות היסטוריה מכל סוג.
                        </p>
                        <div className="flex flex-col md:flex-row gap-3">
                            <input
                                type="file"
                                accept=".json,application/json"
                                onChange={(e) => setImportBackupFile(e.target.files[0] || null)}
                                className="px-3 py-2 border border-gray-300 rounded bg-white"
                            />
                            <button
                                onClick={importBackup}
                                disabled={backupBusy || !importBackupFile}
                                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400 font-semibold">
                                {backupBusy ? 'מעבד...' : 'ייבא גיבוי'}
                            </button>
                        </div>
                        {importBackupFile && (
                            <div className="text-sm text-gray-600 mt-2">
                                קובץ נבחר: {importBackupFile.name}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};