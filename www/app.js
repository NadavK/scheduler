// ============================================
// MAIN APPLICATION
// State management, API calls, and business logic
// ============================================

const { useState, useEffect } = React;

// Constants
const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const dayLabels = {'sun': 'א','mon': 'ב׳','tue': 'ג׳','wed': 'ד׳','thu': 'ה׳','fri': 'ו׳','sat': 'שבת'};
const dayOrder = { 'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6 };

const App = () => {
    // Auth state
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userRole, setUserRole] = useState('user');
    const [currentUsername, setCurrentUsername] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [loggingIn, setLoggingIn] = useState(false);

    // Main state
    const [outputs, setOutputs] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [timestamp, setTimestamp] = useState(null);
    const [displayOrder, setDisplayOrder] = useState([]);
    const [filterOutput, setFilterOutput] = useState('all');
    const [filterDay, setFilterDay] = useState('all');
    const [filterEnabled, setFilterEnabled] = useState('all');
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('schedules');

    // Admin state
    const [users, setUsers] = useState({});
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newUserRole, setNewUserRole] = useState('user');
    const [newOutputName, setNewOutputName] = useState('');
    const [newOutputGpio, setNewOutputGpio] = useState('');
    const [importBackupFile, setImportBackupFile] = useState(null);
    const [backupBusy, setBackupBusy] = useState(false);
    const [deviceTime, setDeviceTime] = useState('');


    // History state
    const [changeHistory, setChangeHistory] = useState([]);
    const [executionHistory, setExecutionHistory] = useState([]);
    const [historyView, setHistoryView] = useState('changes');

    // Initialize
    useEffect(() => { checkAuth(); }, []);

    // Authentication
    const checkAuth = async () => {
        try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();
            if (data.authenticated) {
                setIsAuthenticated(true);
                setCurrentUsername(data.username);
                setUserRole(data.role || 'user');
                loadData();
                loadDeviceTime();
                if (data.role === 'admin') loadUsers();
            } else setLoading(false);
        } catch (error) {
            console.error('Error checking auth:', error);
            setLoading(false);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoggingIn(true);
        setLoginError('');
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            if (response.ok) {
                setIsAuthenticated(true);
                setCurrentUsername(data.username);
                setUserRole(data.role || 'user');
                setPassword('');
                loadData();
                loadDeviceTime();
                if (data.role === 'admin') loadUsers();
            } else setLoginError(data.error || 'Login failed');
        } catch (error) {
            console.error('Error logging in:', error);
            setLoginError('Connection error');
        } finally {
            setLoggingIn(false);
        }
    };

    const handleLogout = async () => {
        try {
            await fetch('/api/logout', { method: 'POST' });
            setIsAuthenticated(false);
            setUserRole('user');
            setCurrentUsername('');
            setSchedules([]);
            setOutputs([]);
            setUsers({});
            setImportBackupFile(null);
        } catch (error) {
            console.error('Error logging out:', error);
        }
    };

    // Admin functions
    const loadUsers = async () => {
        try {
            const response = await fetch('/api/users');
            if (response.ok) setUsers(await response.json());
        } catch (error) {
            console.error('Error loading users:', error);
        }
    };

    const loadDeviceTime = async () => {
        try {
            const response = await fetch('/api/time');
            if (response.ok) {
                const data = await response.json();
                setDeviceTime(data.local_formatted || data.local || '');
            }
        } catch (error) {
            console.error('Error loading device time:', error);
        }
    };

    const exportBackup = async () => {
        try {
            setBackupBusy(true);
            const response = await fetch('/api/backup/export');
            if (!response.ok) {
                let errorMessage = 'שגיאה בייצוא הגיבוי';
                try {
                    const data = await response.json();
                    errorMessage = data.error || errorMessage;
                } catch (_) {
                    // Ignore JSON parse failure
                }
                alert(errorMessage);
                return;
            }

            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const match = disposition.match(/filename="?([^"]+)"?/);
            const filename = match ? match[1] : 'scheduler_backup.json';

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            alert('הגיבוי יוצא בהצלחה');
        } catch (error) {
            console.error('Error exporting backup:', error);
            alert('שגיאה בייצוא הגיבוי');
        } finally {
            setBackupBusy(false);
        }
    };

    const importBackup = async () => {
        if (!importBackupFile) {
            alert('נא לבחור קובץ גיבוי');
            return;
        }

        if (!window.confirm('ייבוא גיבוי יחליף את הנתונים הקיימים. להמשיך?')) {
            return;
        }

        try {
            setBackupBusy(true);
            const formData = new FormData();
            formData.append('file', importBackupFile);

            const response = await fetch('/api/backup/import', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                setImportBackupFile(null);
                await loadData();
                await loadUsers();
                await loadChangeHistory();
                await loadExecutionHistory();
                alert(`הגיבוי יובא בהצלחה\nשוחזרו ${data.restored?.schedule_change_history_restored || 0} רשומות שינויים ו-${data.restored?.execution_history_restored || 0} רשומות ביצוע`);
            } else {
                alert(data.error || 'שגיאה בייבוא הגיבוי');
            }
        } catch (error) {
            console.error('Error importing backup:', error);
            alert('שגיאה בייבוא הגיבוי');
        } finally {
            setBackupBusy(false);
        }
    };

    const createUser = async (e) => {
        e.preventDefault();
        if (!newUsername || !newPassword) {
            alert('נא להזין שם משתמש וסיסמה');
            return;
        }
        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: newUsername, password: newPassword, role: newUserRole })
            });
            if (response.ok) {
                setNewUsername('');
                setNewPassword('');
                setNewUserRole('user');
                await loadUsers();
                alert('משתמש נוצר בהצלחה');
            } else {
                const data = await response.json();
                alert(data.error || 'שגיאה ביצירת משתמש');
            }
        } catch (error) {
            console.error('Error creating user:', error);
            alert('שגיאה ביצירת משתמש');
        }
    };

    const deleteUser = async (username) => {
        if (!window.confirm(`למחוק את המשתמש "${username}"?`)) return;
        try {
            const response = await fetch(`/api/users/${username}`, { method: 'DELETE' });
            if (response.ok) {
                await loadUsers();
                alert('משתמש נמחק בהצלחה');
            } else {
                const data = await response.json();
                alert(data.error || 'שגיאה במחיקת משתמש');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            alert('שגיאה במחיקת משתמש');
        }
    };

    const changeUserPassword = async (username, newPassword) => {
        try {
            const response = await fetch(`/api/users/${username}/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: newPassword })
            });
            if (response.ok) {
                alert('סיסמה שונתה בהצלחה');
            } else {
                const data = await response.json();
                alert(data.error || 'שגיאה בשינוי סיסמה');
            }
        } catch (error) {
            console.error('Error changing password:', error);
            alert('שגיאה בשינוי סיסמה');
        }
    };

    const addOutput = () => {
        if (!newOutputName || !newOutputGpio) {
            alert('נא להזין שם ומספר GPIO');
            return;
        }
        const gpio = parseInt(newOutputGpio);
        if (isNaN(gpio) || gpio < 0) {
            alert('מספר GPIO לא תקין');
            return;
        }
        if (outputs.some(o => o.gpio === gpio)) {
            alert('GPIO זה כבר קיים');
            return;
        }
        setOutputs([...outputs, { gpio, name: newOutputName, state: false }]);
        setNewOutputName('');
        setNewOutputGpio('');
    };

const updateOutputName = (gpio, name) => {
    setOutputs(prevOutputs =>
        prevOutputs.map(output =>
            output.gpio === gpio ? { ...output, name } : output
        )
    );
};

    const deleteOutput = (gpio) => {
        const output = outputs.find(o => o.gpio === gpio);
        if (!output) return;
        const usedInSchedules = schedules.filter(s => s.gpio === gpio);
        if (usedInSchedules.length > 0) {
            if (!window.confirm(`GPIO ${output.name} נמצא בשימוש ב-${usedInSchedules.length} הפעלות. למחוק בכל זאת?`)) {
                return;
            }
        }
        if (window.confirm(`למחוק את ${output.name} (GPIO ${gpio})?`)) {
            setOutputs(outputs.filter(o => o.gpio !== gpio));
            setSchedules(schedules.filter(s => s.gpio !== gpio));
        }
    };

    const saveOutputs = async () => {
        try {
            const response = await fetch('/api/outputs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(outputs)
            });
            if (response.ok) {
                alert('יציאות נשמרו בהצלחה');
                await loadData();
            } else alert('שגיאה בשמירת יציאות');
        } catch (error) {
            console.error('Error saving outputs:', error);
            alert('שגיאה בשמירת יציאות');
        }
    };

    // History functions
    const loadChangeHistory = async () => {
        try {
            const response = await fetch('/api/history/changes?limit=50');
            if (response.ok) {
                const data = await response.json();
                setChangeHistory(data.history);
            }
        } catch (error) {
            console.error('Error loading change history:', error);
        }
    };

    const loadExecutionHistory = async () => {
        try {
            const response = await fetch('/api/history/executions?limit=100');
            if (response.ok) {
                const data = await response.json();
                setExecutionHistory(data.executions);
            }
        } catch (error) {
            console.error('Error loading execution history:', error);
        }
    };

    useEffect(() => {
        if (activeTab === 'history') {
            loadChangeHistory();
            loadExecutionHistory();
        }
    }, [activeTab]);

    // Schedule functions
    const sortSchedules = (schedulesToSort) => {
        return [...schedulesToSort].sort((a, b) => {
            if (dayOrder[a.day] !== dayOrder[b.day]) return dayOrder[a.day] - dayOrder[b.day];
            if (a.time !== b.time) return a.time.localeCompare(b.time);
            const aOutput = outputs.find(o => o.gpio === a.gpio);
            const bOutput = outputs.find(o => o.gpio === b.gpio);
            const aName = aOutput ? aOutput.name : String(a.gpio);
            const bName = bOutput ? bOutput.name : String(b.gpio);
            return aName.localeCompare(bName);
        });
    };

    useEffect(() => {
        if (!isAuthenticated) return;
        const filtered = schedules.filter(schedule => {
            const outputMatch = filterOutput === 'all' || schedule.gpio === parseInt(filterOutput);
            const dayMatch = filterDay === 'all' || schedule.day === filterDay;
            const enabledMatch = filterEnabled === 'all' ||
                (filterEnabled === 'enabled' && schedule.enabled !== false) ||
                (filterEnabled === 'disabled' && schedule.enabled === false);
            return outputMatch && dayMatch && enabledMatch;
        });
        const sorted = sortSchedules(filtered);
        setDisplayOrder(sorted.map(s => s.id));
    }, [filterOutput, filterDay, filterEnabled, outputs, isAuthenticated]);

    const loadData = async () => {
        setLoading(true);
        try {
            const outputsResponse = await fetch('/api/outputs');
            if (!outputsResponse.ok) throw new Error('Failed to load outputs');
            const outputsData = await outputsResponse.json();
            setOutputs(outputsData);
            const schedulesResponse = await fetch('/api/schedules');
            if (!schedulesResponse.ok) throw new Error('Failed to load schedules');
            const schedulesData = await schedulesResponse.json();
            setTimestamp(schedulesData.timestamp);
            setSchedules(schedulesData.schedules || []);
            const sorted = sortSchedules(schedulesData.schedules || []);
            setDisplayOrder(sorted.map(s => s.id));
        } catch (error) {
            console.error('Error loading data:', error);
            alert('Error loading data from server');
        } finally {
            setLoading(false);
        }
    };

    const visibleOutputs = outputs.filter(output => output.name !== 'לא תקין');

    const saveSchedules = async () => {
        const invalidSchedules = schedules.filter(s => !s.day || !s.time || !s.gpio);
        if (invalidSchedules.length > 0) {
            alert('יש להשלים את כל השדות בהפעלות לפני שמירה');
            return;
        }
        const duplicates = [];
        for (let i = 0; i < schedules.length; i++) {
            for (let j = i + 1; j < schedules.length; j++) {
                const s1 = schedules[i];
                const s2 = schedules[j];
                if (s1.gpio === s2.gpio && s1.day === s2.day && s1.time === s2.time) { // ignore the action } && s1.action === s2.action) {
                    duplicates.push(`${dayLabels[s1.day]} ${s1.time} - ${getOutputName(s1.gpio)}`);
                }
            }
        }
        if (duplicates.length > 0) {
            alert('נמצאו הפעלות כפולות:\n' + duplicates.join('\n') + '\n\nאנא הסר את הכפלות לפני שמירה');
            return;
        }
        setSaving(true);
        try {
            const response = await fetch('/api/schedules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schedules: schedules, timestamp: timestamp })
            });
            const data = await response.json();
            if (response.ok) {
                setTimestamp(data.timestamp);
                setLastSaved(new Date());
                await loadData();
            } else if (response.status === 409) {
                alert(data.error || 'Your data is outdated. Please refresh and try again.');
                await loadData();
            } else {
                alert(data.error || 'אירעה שגיאה במהלך השמירה');
            }
        } catch (error) {
            console.error('Error saving schedules:', error);
            alert(error.message || 'Error saving schedules');
        } finally {
            setSaving(false);
        }
    };

    const copySchedule = (schedule) => {
        if (visibleOutputs.length === 0) { alert('No outputs available'); return; }
        const tempId = Date.now().toString().split('').reverse().join('');
        const newSchedule = { id: tempId, gpio: schedule.gpio, day: schedule.day, time: schedule.time, action: schedule.action, enabled: schedule.enabled };
        setSchedules(prevSchedules => [...prevSchedules, newSchedule]);
        setDisplayOrder(prevDisplayOrder => {
            const index = prevDisplayOrder.findIndex(id => id === schedule.id);
            if (index === -1) return [...prevDisplayOrder, tempId];
            return [...prevDisplayOrder.slice(0, index + 1), tempId, ...prevDisplayOrder.slice(index + 1)];
        });
    };

    const addSchedule = () => {
        if (visibleOutputs.length === 0) { alert('No outputs available'); return; }
        const tempId = Date.now().toString().split('').reverse().join('');
        const defaultGpio = filterOutput !== 'all' ? parseInt(filterOutput) : null;
        const defaultDay = filterDay !== 'all' ? filterDay : '';
        const newSchedule = { id: tempId, gpio: defaultGpio, day: defaultDay, time: '', action: 'on', enabled: true };
        setSchedules([newSchedule, ...schedules]);
        setDisplayOrder([tempId, ...displayOrder]);
    };

    const updateSchedule = (id, field, value) => {
        setSchedules(prevSchedules => prevSchedules.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    const deleteSchedule = (id) => {
        const schedule = schedules.find(s => s.id === id);
        if (!schedule) return;
        const outputName = getOutputName(schedule.gpio);
        const dayLabel = dayLabels[schedule.day] || schedule.day;
        const confirmMessage = `למחוק?\n${dayLabel} ב- ${schedule.time}\n${outputName} → ${schedule.action.toUpperCase()}`;
        if (window.confirm(confirmMessage)) {
            setSchedules(prevSchedules => prevSchedules.filter(s => s.id !== id));
            setDisplayOrder(prevOrder => prevOrder.filter(orderId => orderId !== id));
        }
    };

    const getOutputName = (gpio) => {
        const output = outputs.find(o => o.gpio === gpio);
        return output ? output.name : `GPIO ${gpio}`;
    };

    const controlGPIO = async (gpio, state) => {
        try {
            const response = await fetch(`/api/outputs/${gpio}/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state })
            });
            if (response.ok) await loadData();
            else {
                const data = await response.json();
                alert('Error controlling output: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error controlling GPIO:', error);
            alert('Error controlling output');
        }
    };

    const displayedSchedules = displayOrder.map(id => schedules.find(s => s.id === id)).filter(s => {
        if (!s) return false;
        const output = outputs.find(o => o.gpio === s.gpio);
        if (output && output.name === 'לא תקין') return false;

        const outputMatch = filterOutput === 'all' || s.gpio === parseInt(filterOutput);
        const dayMatch = filterDay === 'all' || s.day === filterDay;
        const enabledMatch = filterEnabled === 'all' ||
            (filterEnabled === 'enabled' && s.enabled !== false) ||
            (filterEnabled === 'disabled' && s.enabled === false);
        return outputMatch && dayMatch && enabledMatch;
    });

    // Render
    if (!isAuthenticated) {
        return <LoginScreen
            username={username} setUsername={setUsername}
            password={password} setPassword={setPassword}
            loginError={loginError} loggingIn={loggingIn}
            handleLogin={handleLogin}
        />;
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="text-xl text-gray-600">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-2 sm:p-4">
            <div className="max-w-7xl mx-auto">
                <Header
                    activeTab={activeTab} setActiveTab={setActiveTab}
                    userRole={userRole} currentUsername={currentUsername}
                    lastSaved={lastSaved} saving={saving}
                    saveSchedules={saveSchedules} handleLogout={handleLogout}
                    addSchedule={addSchedule} outputs={outputs}
                    filtersExpanded={filtersExpanded} setFiltersExpanded={setFiltersExpanded}
                    filterOutput={filterOutput} filterDay={filterDay} filterEnabled={filterEnabled}
                />

                {activeTab === 'schedules' && filtersExpanded && (
                    <div className="bg-white rounded-lg shadow-md p-3 mb-2">
                        <div className="grid grid-cols-1 gap-3">
                            <div className="flex flex-wrap gap-1">
                                <button onClick={() => setFilterOutput('all')}
                                    className={`px-2 py-1 rounded text-xs font-semibold ${filterOutput === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>הכל</button>
                                    {visibleOutputs.map(output => (
                                    <button key={output.gpio} onClick={() => setFilterOutput(String(output.gpio))}
                                        className={`px-2 py-1 rounded text-xs font-semibold ${filterOutput === String(output.gpio) ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>{output.name}</button>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-1">
                                <button onClick={() => setFilterDay('all')}
                                    className={`px-2 py-1 rounded text-xs font-semibold ${filterDay === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>הכל</button>
                                {days.map(day => (
                                    <button key={day} onClick={() => setFilterDay(day)}
                                        className={`px-2 py-1 rounded text-xs font-semibold ${filterDay === day ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>{dayLabels[day]}</button>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-1">
                                <button onClick={() => setFilterEnabled('all')}
                                    className={`px-2 py-1 rounded text-xs font-semibold ${filterEnabled === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>הכל</button>
                                <button onClick={() => setFilterEnabled('enabled')}
                                    className={`px-2 py-1 rounded text-xs font-semibold ${filterEnabled === 'enabled' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>מופעל</button>
                                <button onClick={() => setFilterEnabled('disabled')}
                                    className={`px-2 py-1 rounded text-xs font-semibold ${filterEnabled === 'disabled' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>כבוי</button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'schedules' && <SchedulesTab outputs={visibleOutputs} displayedSchedules={displayedSchedules} days={days} dayLabels={dayLabels} updateSchedule={updateSchedule} copySchedule={copySchedule} deleteSchedule={deleteSchedule} />}
                {activeTab === 'control' && <ControlTab outputs={visibleOutputs} controlGPIO={controlGPIO} />}
                {activeTab === 'history' && <HistoryTab historyView={historyView} setHistoryView={setHistoryView} changeHistory={changeHistory} executionHistory={executionHistory} getOutputName={getOutputName} dayLabels={dayLabels} />}
                {activeTab === 'admin' && userRole === 'admin' && (
                    <AdminTab
                        users={users} newUsername={newUsername} setNewUsername={setNewUsername}
                        newPassword={newPassword} setNewPassword={setNewPassword}
                        newUserRole={newUserRole} setNewUserRole={setNewUserRole}
                        createUser={createUser} deleteUser={deleteUser} currentUsername={currentUsername}
                        outputs={outputs} newOutputName={newOutputName} setNewOutputName={setNewOutputName}
                        newOutputGpio={newOutputGpio} setNewOutputGpio={setNewOutputGpio}
                        addOutput={addOutput} updateOutputName={updateOutputName} deleteOutput={deleteOutput} saveOutputs={saveOutputs}
                        changeUserPassword={changeUserPassword}
                        exportBackup={exportBackup}
                        importBackup={importBackup}
                        importBackupFile={importBackupFile}
                        setImportBackupFile={setImportBackupFile}
                        backupBusy={backupBusy}
                        deviceTime={deviceTime}
                    />
                )}
            </div>
        </div>
    );
};