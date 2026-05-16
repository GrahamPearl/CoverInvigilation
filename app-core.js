/**
 * SIMPLIFIED CORE APPLICATION
 * Manages state, UI updates, and file operations
 * Reduced complexity while maintaining full functionality
 */

const app = {
    state: {
        assignments: [],
        teachers: [],
        allocations: new Map(), // index -> teacher
        allocationReasons: new Map() // index -> {reason, timestamp}
    },

    /**
     * Initialize app
     */
    init() {
        this.setupEventListeners();
        this.loadFromStorage();
        this.updateConnectionStatus();
        this.refreshDashboard();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // File uploads
        ['upload-1', 'upload-2'].forEach(id => {
            const area = document.getElementById(id);
            const input = area.querySelector('input');
            area.addEventListener('click', () => input.click());
            
            ['dragover', 'drop'].forEach(evt => {
                area.addEventListener(evt, e => {
                    e.preventDefault();
                    if (evt === 'drop') input.files = e.dataTransfer.files;
                });
            });
        });

        // Connection monitor
        window.addEventListener('online', () => this.updateConnectionStatus());
        window.addEventListener('offline', () => this.updateConnectionStatus());
    },

    /**
     * Update connection status indicator
     */
    updateConnectionStatus() {
        const elem = document.getElementById('conn-status');
        if (navigator.onLine) {
            elem.className = 'connection-indicator online';
            elem.innerHTML = '<span>🟢 Online</span>';
        } else {
            elem.className = 'connection-indicator offline';
            elem.innerHTML = '<span>🔴 Offline</span>';
        }
    },

    /**
     * Process uploaded files
     */
    processFiles() {
        const file1 = document.getElementById('file1').files[0];
        const file2 = document.getElementById('file2').files[0];

        if (!file1 || !file2) {
            alert('Select both files');
            return;
        }

        let processed = 0;
        const processComplete = () => {
            if (++processed === 2) {
                this.saveToStorage();
                this.refreshDashboard();
                showMessage('Files processed successfully', 'success');
            }
        };

        // Parse assignments
        const reader1 = new FileReader();
        reader1.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                this.state.assignments = XLSX.utils.sheet_to_json(ws).map(r => ({
                    date: r.Date || r.date || '',
                    session: parseInt(r.Session || r.session || 1),
                    grade: String(r.Grade || r.grade || ''),
                    exam: r.Exam || r.exam || '',
                    venue: String(r['Venue Number'] || r.Venue || r.venue || ''),
                    timeshift: parseFloat(r.TimeShift || r['Time Shift'] || r.timeshift || 0),
                    educator: r.Educator || r.educator || null,
                    is_zulu: String(r['Is Zulu'] || r.is_zulu || 'false').toLowerCase() === 'true'
                }));
                processComplete();
            } catch (err) {
                showMessage('Error reading assignments: ' + err.message, 'error');
                processComplete();
            }
        };
        reader1.readAsArrayBuffer(file1);

        // Parse teachers
        const reader2 = new FileReader();
        reader2.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                this.state.teachers = XLSX.utils.sheet_to_json(ws)
                    .map(r => ({
                        name: r.Educator || r.Name || r.name || '',
                        registerClass: r['Register class'] || r['Register Class'] || r.registerClass || '',
                        learners: parseInt(r.Learners || r.learners || 0),
                        is_zulu: String(r.Zulu || r['Is Zulu'] || r.is_zulu || 'false').toLowerCase() === 'true'
                    }))
                    .filter(t => t.name);
                processComplete();
            } catch (err) {
                showMessage('Error reading teachers: ' + err.message, 'error');
                processComplete();
            }
        };
        reader2.readAsArrayBuffer(file2);
    },

    /**
     * Get teacher by name
     */
    getTeacher(name) {
        return this.state.teachers.find(t => t.name === name);
    },

    /**
     * Get workload hours for teacher
     */
    getTeacherWorkload(name) {
        return this.state.assignments
            .reduce((sum, a, idx) => {
                const assigned = a.educator || this.state.allocations.get(idx);
                return assigned === name ? sum + (a.timeshift || 0) : sum;
            }, 0);
    },

    /**
     * Get teacher assignment count
     */
    getTeacherSlotCount(name) {
        return this.state.assignments.filter((a, idx) => {
            const assigned = a.educator || this.state.allocations.get(idx);
            return assigned === name;
        }).length;
    },

    /**
     * Assign teacher to slot with reasoning
     */
    assignToSlot(idx, teacher, reason = 'Manual assignment') {
        const existing = this.state.assignments[idx].educator || this.state.allocations.get(idx);
        
        // Never replace existing allocations
        if (existing) {
            showMessage(`Slot already assigned to ${existing}`, 'warning');
            return false;
        }

        this.state.allocations.set(idx, teacher);
        this.state.allocationReasons.set(idx, {
            teacher,
            reason,
            timestamp: new Date().toISOString()
        });

        this.saveToStorage();
        return true;
    },

    /**
     * Get allocation reason for debugging
     */
    getAllocationReason(idx) {
        return this.state.allocationReasons.get(idx) || null;
    },

    /**
     * Save to localStorage
     */
    saveToStorage() {
        localStorage.setItem('assignments', JSON.stringify(this.state.assignments));
        localStorage.setItem('teachers', JSON.stringify(this.state.teachers));
        localStorage.setItem('allocations', JSON.stringify(Array.from(this.state.allocations.entries())));
        localStorage.setItem('reasons', JSON.stringify(Array.from(this.state.allocationReasons.entries())));
    },

    /**
     * Load from localStorage
     */
    loadFromStorage() {
        const a = localStorage.getItem('assignments');
        const t = localStorage.getItem('teachers');
        const alloc = localStorage.getItem('allocations');
        const reasons = localStorage.getItem('reasons');

        if (a) this.state.assignments = JSON.parse(a);
        if (t) this.state.teachers = JSON.parse(t);
        if (alloc) this.state.allocations = new Map(JSON.parse(alloc));
        if (reasons) this.state.allocationReasons = new Map(JSON.parse(reasons));
    },

    /**
     * Export workload data
     */
    getWorkloadData() {
        const teachers = [...new Set(
            this.state.assignments
                .map((a, idx) => a.educator || this.state.allocations.get(idx))
                .filter(Boolean)
        )];

        return teachers.map(name => ({
            name,
            hours: this.getTeacherWorkload(name),
            slots: this.getTeacherSlotCount(name)
        }));
    },

    /**
     * Get statistics
     */
    getStats() {
        const assigned = this.state.assignments.filter((a, idx) =>
            a.educator || this.state.allocations.get(idx)
        ).length;

        return {
            totalSlots: this.state.assignments.length,
            assigned,
            unassigned: this.state.assignments.length - assigned,
            teachers: this.state.teachers.length
        };
    }
};

/**
 * UI Update Functions
 */

function switchSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    document.querySelectorAll('.nav-item a').forEach(a => a.classList.remove('active'));
    event.target.closest('a').classList.add('active');

    const titles = {
        dashboard: 'Dashboard',
        upload: 'Upload Files',
        schedule: 'Exam Schedule',
        allocation: 'Smart Allocation',
        reports: 'Reports',
        'ai-assist': 'AI Assistance'
    };
    document.getElementById('page-title').textContent = titles[id] || 'Dashboard';

    if (id === 'schedule') setTimeout(() => {
        populateDateFilter();
        refreshSchedule();
    }, 100);

    if (id === 'reports') setTimeout(() => generateCharts(), 100);
}

function refreshDashboard() {
    const stats = app.getStats();
    document.getElementById('stat-slots').textContent = stats.totalSlots;
    document.getElementById('stat-assigned').textContent = stats.assigned;
    document.getElementById('stat-unassigned').textContent = stats.unassigned;
    document.getElementById('stat-teachers').textContent = stats.teachers;

    const tbody = document.getElementById('recent-table');
    const recent = app.state.assignments.slice(0, 5);

    if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;">No data</td></tr>';
        return;
    }

    tbody.innerHTML = recent.map((row, idx) => {
        const teacher = row.educator || app.state.allocations.get(idx) || '-';
        const status = teacher !== '-'
            ? '<span class="badge badge-assigned">✓ Assigned</span>'
            : '<span class="badge badge-unassigned">✗ Unassigned</span>';
        return `<tr>
            <td>${row.date}</td>
            <td>${row.exam}</td>
            <td>${row.venue}</td>
            <td><strong>${teacher}</strong></td>
            <td>${status}</td>
        </tr>`;
    }).join('');
}

function populateDateFilter() {
    const dates = [...new Set(app.state.assignments.map(a => a.date).filter(Boolean))].sort();
    const select = document.getElementById('filter-date');

    while (select.options.length > 1) select.remove(1);
    dates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = new Date(d + 'T00:00').toLocaleDateString();
        select.appendChild(opt);
    });
}

function refreshSchedule() {
    const dateVal = document.getElementById('filter-date').value;
    let filtered = app.state.assignments;

    if (dateVal) filtered = filtered.filter(a => a.date === dateVal);

    const tbody = document.getElementById('schedule-table');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;">No data</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map((row, idx) => {
        const actualIdx = app.state.assignments.indexOf(row);
        const teacher = row.educator || app.state.allocations.get(actualIdx) || '-';
        const status = teacher !== '-'
            ? '<span class="badge badge-assigned">✓</span>'
            : '<span class="badge badge-unassigned">✗</span>';
        return `<tr>
            <td>${row.date}</td>
            <td>${row.session}</td>
            <td>${row.exam}</td>
            <td>${row.venue}</td>
            <td>${row.timeshift}</td>
            <td>${teacher}</td>
            <td>${status}</td>
        </tr>`;
    }).join('');
}

function processUpload() {
    const statusDiv = document.getElementById('upload-status');
    const msgDiv = document.getElementById('upload-messages');

    statusDiv.style.display = 'none';
    app.processFiles();

    setTimeout(() => {
        if (app.state.assignments.length > 0 && app.state.teachers.length > 0) {
            msgDiv.innerHTML = `
                <p style="color:var(--success);"><i class="fas fa-check"></i> Loaded ${app.state.assignments.length} assignments</p>
                <p style="color:var(--success);"><i class="fas fa-check"></i> Loaded ${app.state.teachers.length} teachers</p>
            `;
            statusDiv.style.display = 'block';
        }
    }, 500);
}

function autoAllocate() {
    if (app.state.assignments.length === 0 || app.state.teachers.length === 0) {
        showMessage('Load data first', 'error');
        return;
    }

    const resultsDiv = document.getElementById('allocation-results');
    resultsDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Processing...</p>';

    setTimeout(() => {
        const result = scheduleWithReasons(app.state.assignments, app.state.teachers, app.state.allocations);
        displayAllocationResults(result);
        app.saveToStorage();
        refreshDashboard();
    }, 100);
}

function displayAllocationResults(result) {
    const resultsDiv = document.getElementById('allocation-results');
    let html = `
        <div style="background:#f0f9ff;border:1px solid var(--accent);border-radius:0.5rem;padding:1.5rem;margin-bottom:1rem;">
            <h5 style="margin-top:0;">Allocation Summary</h5>
            <p><strong>${result.assigned}</strong> slots allocated | <strong>${result.unassigned.length}</strong> could not be assigned</p>
            <p style="font-size:0.9rem;color:#666;">Fair distribution by timeShift - max ${result.stats.maxHours}h, min ${result.stats.minHours}h per teacher</p>
        </div>
    `;

    if (result.unassigned.length > 0) {
        html += '<div class="reason-box error"><strong>⚠ Unassigned Slots:</strong>';
        result.unassigned.forEach(item => {
            html += `<div style="margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid rgba(220,38,38,0.2);">
                <strong>${item.exam}</strong> (${item.date} Session ${item.session})<br>
                <small>${item.reason}</small>
            </div>`;
        });
        html += '</div>';
    }

    if (result.warnings.length > 0) {
        html += '<div class="reason-box warning"><strong>⚠ Warnings:</strong>';
        result.warnings.forEach(w => {
            html += `<div style="margin-top:0.5rem;">• ${w}</div>`;
        });
        html += '</div>';
    }

    resultsDiv.innerHTML = html;
}

function showMessage(text, type = 'info') {
    const div = document.createElement('div');
    div.style.cssText = `
        position:fixed;top:20px;right:20px;z-index:9999;
        padding:1rem;border-radius:0.5rem;
        background:${type === 'success' ? '#dcfce7' : type === 'error' ? '#fee2e2' : '#dbeafe'};
        color:${type === 'success' ? '#166534' : type === 'error' ? '#991b1b' : '#1e40af'};
        border-left:4px solid ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
    `;
    div.innerHTML = text;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => app.init());
