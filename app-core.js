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
    allocationReasons: new Map(), // index -> {reason, timestamp}
  },

  /**
   * Initialize app
   */
  init() {
    app.setupEventListeners();
    app.loadFromStorage();
    app.updateConnectionStatus();
    app.refreshDashboard();
  },

  resetAll() {
    this.state.assignments = [];
    this.state.teachers = [];
    this.state.allocations.clear();
    this.state.allocationReasons.clear();

    localStorage.clear();

    this.refreshDashboard();

    showMessage("Application fully reset", "success");
  },

  resetAllocations() {
    // Clear allocations and reasons
    app.state.allocations.clear();
    app.state.allocationReasons.clear();

    // Optional: also clear educator field from assignments
    app.state.assignments.forEach((a) => (a.educator = null));

    // Save cleared state
    app.saveToStorage();

    // Refresh UI
    app.refreshDashboard();

    showMessage("Allocations reset successfully", "success");
  },

  refreshDashboard() {
    const stats = app.getStats();
    document.getElementById("stat-slots").textContent = stats.totalSlots;
    document.getElementById("stat-assigned").textContent = stats.assigned;
    document.getElementById("stat-unassigned").textContent = stats.unassigned;
    document.getElementById("stat-teachers").textContent = stats.teachers;

    const tbody = document.getElementById("recent-table");
    const recent = app.state.assignments.slice(0, 5);

    if (recent.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;color:#999;">No data</td></tr>';
      return;
    }

    tbody.innerHTML = recent
      .map((row, idx) => {
        const teacher =
          this.state.allocations.get(idx) ||
          app.state.allocations.get(idx) ||
          "-";
        const status =
          teacher !== "-"
            ? '<span class="badge badge-assigned">✓ Assigned</span>'
            : '<span class="badge badge-unassigned">✗ Unassigned</span>';
        return `<tr>
            <td>${row.date}</td>
            <td>${row.exam}</td>
            <td>${row.venue}</td>
            <td><strong>${teacher}</strong></td>
            <td>${status}</td>
        </tr>`;
      })
      .join("");
  },

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // File uploads
    ["upload-1", "upload-2"].forEach((id) => {
      const area = document.getElementById(id);
      const input = area.querySelector("input");
      area.addEventListener("click", () => input.click());

      ["dragover", "drop"].forEach((evt) => {
        area.addEventListener(evt, (e) => {
          e.preventDefault();
          if (evt === "drop") input.files = e.dataTransfer.files;
        });
      });
    });

    // Connection monitor
    window.addEventListener("online", () => app.updateConnectionStatus());
    window.addEventListener("offline", () => app.updateConnectionStatus());
  },

  /**
   * Update connection status indicator
   */
  updateConnectionStatus() {
    const elem = document.getElementById("conn-status");
    if (navigator.onLine) {
      elem.className = "connection-indicator online";
      elem.innerHTML = "<span>🟢 Online</span>";
    } else {
      elem.className = "connection-indicator offline";
      elem.innerHTML = "<span>🔴 Offline</span>";
    }
  },

  /**
   * Process uploaded files
   */
  processFiles() {
    const file1 = document.getElementById("file1").files[0];
    const file2 = document.getElementById("file2").files[0];

    if (!file1 || !file2) {
      alert("Select both files");
      return;
    }

    let processed = 0;
    const processComplete = () => {
      if (++processed === 2) {
        app.saveToStorage();
        app.refreshDashboard();
        showMessage("Files processed successfully", "success");
      }
    };

    // Parse assignments
    const reader1 = new FileReader();
    reader1.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        app.state.assignments = XLSX.utils.sheet_to_json(ws).map((r) => ({
          // date: r.Date || r.date || "",
          // date: r.Date || r.date || "",
          date: (function (val) {
            if (!val) return "";

            // ✅ EXCEL SERIAL NUMBER FIX (CRITICAL)
            if (typeof val === "number") {
              const excelEpoch = new Date(Date.UTC(1899, 11, 30));
              const result = new Date(excelEpoch.getTime() + val * 86400000);
              return result.toISOString().split("T")[0];
            }

            // ✅ If already a Date object
            if (val instanceof Date) {
              return val.toISOString().split("T")[0];
            }

            const str = String(val).trim();

            // ✅ Handle MM/DD/YYYY
            const parts = str.split("/");
            if (parts.length === 3) {
              const [mm, dd, yyyy] = parts;
              if (yyyy && mm && dd) {
                return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
              }
            }

            // ✅ Fallback
            const parsed = new Date(str);
            return isNaN(parsed) ? "" : parsed.toISOString().split("T")[0];
          })(r.Date ?? r.date),

          session: parseInt(r.Session || r.session || 1),

          // grade: String(r.Grade || r.grade || ""),
          grade: (function (val) {
            if (!val) return "";
            return String(val)
              .replace(/grade\s*/i, "")
              .trim();
          })(r.Grade || r.grade),

          exam: r.Exam || r.exam || "",
          venue: String(r["Venue Number"] || r.Venue || r.venue || ""),
          timeshift: parseFloat(
            r.TimeShift || r["Time Shift"] || r.timeshift || 0,
          ),
          educator: r.Educator || r.educator || null,
          is_zulu:
            String(r["Is Zulu"] || r.is_zulu || "false").toLowerCase() ===
            "true",
        }));

        // processComplete();
        console.log("Parsed teachers:", app.state.teachers);
      } catch (err) {
        showMessage("Error reading assignments: " + err.message, "error");

        // processComplete();
        console.log("Parsed teachers:", app.state.teachers);
      }
    };
    reader1.readAsArrayBuffer(file1);

    // Parse teachers
    const reader2 = new FileReader();
    reader2.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        app.state.teachers = XLSX.utils
          .sheet_to_json(ws)
          .map((r) => ({
            name: r.Educator || r.Name || r.name || "",

            // registerClass: r["Register class"] || r["Register Class"] || r.registerClass || "",
            registerClass: (function (val) {
              if (!val) return "";
              return String(val)
                .replace(/grade\s*/i, "")
                .trim();
            })(r["Register class"] || r["Register Class"] || r.registerClass),

            // is_zulu: String(r.Zulu || r["Is Zulu"] || r.is_zulu || "false").toLowerCase() === "true",
            is_zulu: (function (val) {
              if (val === true) return true;
              if (!val) return false;
              const v = String(val).toLowerCase().trim();
              return v === "true" || v === "yes" || v === "y";
            })(r.Zulu ?? r["Is Zulu"] ?? r.is_zulu),
          }))
          .filter((t) => t.name);

        // processComplete();
        console.log("Parsed teachers:", app.state.teachers);
      } catch (err) {
        showMessage("Error reading teachers: " + err.message, "error");

        // processComplete();
        console.log("Parsed teachers:", app.state.teachers);
      }

      console.log("Teachers loaded:", app.state.teachers);
    };
    reader2.readAsArrayBuffer(file2);
  },

  /**
   * Get teacher by name
   */
  getTeacher(name) {
    return app.state.teachers.find((t) => t.name === name);
  },

  matchesGrade(teacher, assignment) {
    if (!teacher || !assignment) return false;

    const tGrade = (teacher.registerClass || "").toUpperCase();
    const aGrade = (assignment.grade || "").toUpperCase();

    // ROTATE = wildcard
    if (tGrade === "ROTATE") return true;

    return tGrade === aGrade;
  },

  /**
   * Get workload hours for teacher
   */
  getTeacherWorkload(name) {
    return app.state.assignments.reduce((sum, a, idx) => {
      const assigned = a.educator || app.state.allocations.get(idx);
      return assigned === name ? sum + (a.timeshift || 0) : sum;
    }, 0);
  },

  /**
   * Get teacher assignment count
   */
  getTeacherSlotCount(name) {
    return app.state.assignments.filter((a, idx) => {
      const assigned = a.educator || app.state.allocations.get(idx);
      return assigned === name;
    }).length;
  },

  /**
   * Assign teacher to slot with reasoning
   */
  assignToSlot(idx, teacher, reason = "Manual assignment") {
    const existing =
      app.state.assignments[idx].educator || app.state.allocations.get(idx);

    // Never replace existing allocations
    if (existing) {
      showMessage(`Slot already assigned to ${existing}`, "warning");
      return false;
    }

    app.state.allocations.set(idx, teacher);
    app.state.allocationReasons.set(idx, {
      teacher,
      reason,
      timestamp: new Date().toISOString(),
    });

    app.saveToStorage();
    return true;
  },

  /**
   * Get allocation reason for debugging
   */
  getAllocationReason(idx) {
    return app.state.allocationReasons.get(idx) || null;
  },

  /**
   * Save to localStorage
   */
  saveToStorage() {
    localStorage.setItem("assignments", JSON.stringify(app.state.assignments));
    localStorage.setItem("teachers", JSON.stringify(app.state.teachers));
    localStorage.setItem(
      "allocations",
      JSON.stringify(Array.from(app.state.allocations.entries())),
    );
    localStorage.setItem(
      "reasons",
      JSON.stringify(Array.from(app.state.allocationReasons.entries())),
    );
  },

  /**
   * Load from localStorage
   */
  loadFromStorage() {
    const a = localStorage.getItem("assignments");
    const t = localStorage.getItem("teachers");
    const alloc = localStorage.getItem("allocations");
    const reasons = localStorage.getItem("reasons");

    if (a) app.state.assignments = JSON.parse(a);
    if (t) app.state.teachers = JSON.parse(t);
    if (alloc) app.state.allocations = new Map(JSON.parse(alloc));
    if (reasons) app.state.allocationReasons = new Map(JSON.parse(reasons));
  },

  /**
   * Export workload data
   */
  getWorkloadData() {
    const teachers = [
      ...new Set(
        app.state.assignments
          .map((a, idx) => a.educator || app.state.allocations.get(idx))
          .filter(Boolean),
      ),
    ];

    return teachers.map((name) => ({
      name,
      hours: app.getTeacherWorkload(name),
      slots: app.getTeacherSlotCount(name),
    }));
  },

  /**
   * Get statistics
   */
  getStats() {
    const assigned = app.state.assignments.filter(
      (a, idx) => a.educator || app.state.allocations.get(idx),
    ).length;

    return {
      totalSlots: app.state.assignments.length,
      assigned,
      unassigned: app.state.assignments.length - assigned,
      teachers: app.state.teachers.length,
    };
  },
};

/**
 * UI Update Functions
 */

function switchSection(id) {
  document
    .querySelectorAll(".section")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");

  document
    .querySelectorAll(".nav-item a")
    .forEach((a) => a.classList.remove("active"));
  event.target.closest("a").classList.add("active");

  const titles = {
    dashboard: "Dashboard",
    upload: "Upload Files",
    schedule: "Exam Schedule",
    allocation: "Smart Allocation",
    reports: "Reports",
    "ai-assist": "AI Assistance",
  };
  document.getElementById("page-title").textContent = titles[id] || "Dashboard";

  if (id === "schedule")
    setTimeout(() => {
      populateDateFilter();
      refreshSchedule();
    }, 100);

  if (id === "reports") setTimeout(() => generateCharts(), 100);
}

function old_refreshDashboard() {
  const stats = app.getStats();
  document.getElementById("stat-slots").textContent = stats.totalSlots;
  document.getElementById("stat-assigned").textContent = stats.assigned;
  document.getElementById("stat-unassigned").textContent = stats.unassigned;
  document.getElementById("stat-teachers").textContent = stats.teachers;

  const tbody = document.getElementById("recent-table");
  const recent = app.state.assignments.slice(0, 5);

  if (recent.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:#999;">No data</td></tr>';
    return;
  }

  tbody.innerHTML = recent
    .map((row, idx) => {
      const teacher =
        this.state.allocations.get(idx) ||
        app.state.allocations.get(idx) ||
        "-";
      const status =
        teacher !== "-"
          ? '<span class="badge badge-assigned">✓ Assigned</span>'
          : '<span class="badge badge-unassigned">✗ Unassigned</span>';
      return `<tr>
            <td>${row.date}</td>
            <td>${row.exam}</td>
            <td>${row.venue}</td>
            <td><strong>${teacher}</strong></td>
            <td>${status}</td>
        </tr>`;
    })
    .join("");
}

function resetAllocations() {
  if (!confirm("Are you sure you want to reset current allocations?")) return;
  app.resetAllocations();
}

function resetAllAllocations() {
  if (!confirm("Are you sure you want to reset all allocations?")) return;
  app.resetAll();
}

function populateDateFilter() {
  const dates = [
    ...new Set(app.state.assignments.map((a) => a.date).filter(Boolean)),
  ].sort();
  const select = document.getElementById("filter-date");

  while (select.options.length > 1) select.remove(1);
  dates.forEach((d) => {
    const opt = document.createElement("option");
    // opt.value = d;
    opt.value = d; // ✅ KEEP ISO value for filtering

    // opt.textContent = new Date(d).toLocaleDateString("en-GB");
    opt.textContent = (function (dateStr) {
      if (!dateStr) return "";
      const [y, m, day] = dateStr.split("-");
      return `${day}/${m}/${y}`; // ✅ display only
    })(d);

    select.appendChild(opt);
  });
}

function normalizeGrade(val) {
  if (!val) return "";
  return String(val)
    .replace(/grade\s*/i, "")
    .trim();
}

function refreshSchedule() {
  const dateVal = document.getElementById("filter-date").value;
  let filtered = app.state.assignments;

  // Filter based on the selected date string
  if (dateVal) filtered = filtered.filter((a) => a.date === dateVal);

  const tbody = document.getElementById("schedule-table");
  
  if (filtered.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;color:#999;">No data</td></tr>';
    return;
  }

  tbody.innerHTML = filtered
    .map((row) => {
      // Find where this exact row lives in the master array to get its allocation
      const actualIdx = app.state.assignments.indexOf(row);
      const teacher = app.state.allocations.get(actualIdx) || "-";
      
      const status =
        teacher !== "-"
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
    })
    .join("");
}

function processUpload() {
  const statusDiv = document.getElementById("upload-status");
  const msgDiv = document.getElementById("upload-messages");

  statusDiv.style.display = "none";
  app.processFiles();

  setTimeout(() => {
    if (app.state.assignments.length > 0 && app.state.teachers.length > 0) {
      msgDiv.innerHTML = `
                <p style="color:var(--success);"><i class="fas fa-check"></i> Loaded ${app.state.assignments.length} assignments</p>
                <p style="color:var(--success);"><i class="fas fa-check"></i> Loaded ${app.state.teachers.length} teachers</p>
            `;
      statusDiv.style.display = "block";
    }
  }, 500);
}

function autoAllocate() {
  if (app.state.assignments.length === 0 || app.state.teachers.length === 0) {
    showMessage("Load data first", "error");
    return;
  }

  const resultsDiv = document.getElementById("allocation-results");
  resultsDiv.innerHTML =
    '<p><i class="fas fa-spinner fa-spin"></i> Processing...</p>';

  setTimeout(() => {
    /*const result = scheduleWithReasons(
      app.state.assignments,
      app.state.teachers,
      app.state.allocations,
    );
    */

    const filteredTeachers = app.state.teachers;

    const result = scheduleWithReasons(
      app.state.assignments.map((a) => ({
        ...a,
        validTeachers: filteredTeachers.filter(
          (t) => app.matchesGrade(t, a) && (!a.is_zulu || t.is_zulu),
        ),
      })),
      filteredTeachers,
      app.state.allocations,
    );

    displayAllocationResults(result);
    app.saveToStorage();
    app.refreshDashboard();
  }, 100);
}

function displayAllocationResults(result) {
  const resultsDiv = document.getElementById("allocation-results");
  let html = `
        <div style="background:#f0f9ff;border:1px solid var(--accent);border-radius:0.5rem;padding:1.5rem;margin-bottom:1rem;">
            <h5 style="margin-top:0;">Allocation Summary</h5>
            <p><strong>${result.assigned}</strong> slots allocated | <strong>${result.unassigned.length}</strong> could not be assigned</p>
            <p style="font-size:0.9rem;color:#666;">Fair distribution by timeShift - max ${result.stats.maxHours}h, min ${result.stats.minHours}h per teacher</p>
        </div>
    `;

  if (result.unassigned.length > 0) {
    html +=
      '<div class="reason-box error"><strong>⚠ Unassigned Slots:</strong>';
    result.unassigned.forEach((item) => {
      html += `<div style="margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid rgba(220,38,38,0.2);">
                <strong>${item.exam}</strong> (${item.date} Session ${item.session})<br>
                <small>${item.reason}</small>
            </div>`;
    });
    html += "</div>";
  }

  if (result.warnings.length > 0) {
    html += '<div class="reason-box warning"><strong>⚠ Warnings:</strong>';
    result.warnings.forEach((w) => {
      html += `<div style="margin-top:0.5rem;">• ${w}</div>`;
    });
    html += "</div>";
  }

  resultsDiv.innerHTML = html;
}

function showMessage(text, type = "info") {
  const div = document.createElement("div");
  div.style.cssText = `
        position:fixed;top:20px;right:20px;z-index:9999;
        padding:1rem;border-radius:0.5rem;
        background:${type === "success" ? "#dcfce7" : type === "error" ? "#fee2e2" : "#dbeafe"};
        color:${type === "success" ? "#166534" : type === "error" ? "#991b1b" : "#1e40af"};
        border-left:4px solid ${type === "success" ? "#22c55e" : type === "error" ? "#ef4444" : "#3b82f6"};
    `;
  div.innerHTML = text;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

// Initialize
document.addEventListener("DOMContentLoaded", () => app.init());
