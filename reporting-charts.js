/**
 * CHART & REPORTING MODULE
 * Visualizes teacher workload with heatmaps and bar charts
 */

let workloadChart = null;

function generateCharts() {
    if (app.state.assignments.length === 0) {
        document.getElementById('workloadChart').parentElement.innerHTML = '<p style="text-align:center;color:#999;">Load data first</p>';
        return;
    }

    // Generate workload chart
    const workloadData = app.getWorkloadData();
    if (workloadData.length === 0) {
        document.getElementById('workloadChart').parentElement.innerHTML = '<p style="text-align:center;color:#999;">No assignments yet</p>';
        return;
    }

    // Sort by hours descending
    workloadData.sort((a, b) => b.hours - a.hours);

    const ctx = document.getElementById('workloadChart').getContext('2d');
    
    if (workloadChart) workloadChart.destroy();

    workloadChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: workloadData.map(w => w.name),
            datasets: [
                {
                    label: 'Hours Assigned',
                    data: workloadData.map(w => w.hours),
                    backgroundColor: 'rgba(13, 148, 136, 0.7)',
                    borderColor: 'var(--accent)',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true,
                    max: 40,
                    ticks: { callback: v => v + 'h' }
                }
            },
            plugins: {
                legend: { display: true },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const teacher = workloadData[ctx.dataIndex];
                            return `${teacher.hours}h (${teacher.slots} slots)`;
                        }
                    }
                }
            }
        }
    });

    // Generate heatmap
    generateHeatmap(workloadData);

    // Show statistics
    showWorkloadStats(workloadData);
}

/**
 * Generate workload heatmap (color-coded by hours)
 */
function generateHeatmap(workloadData) {
    const heatmapDiv = document.getElementById('heatmap');
    const maxHours = Math.max(...workloadData.map(w => w.hours), 1);
    const avgHours = workloadData.reduce((s, w) => s + w.hours, 0) / workloadData.length;

    heatmapDiv.innerHTML = workloadData.map(w => {
        // Color scale: white (0h) -> yellow (20h) -> orange (30h) -> red (40h)
        let color;
        if (w.hours === 0) color = '#f0f0f0';
        else if (w.hours < avgHours * 0.8) color = '#d4f8d4';
        else if (w.hours < avgHours * 1.2) color = '#fffacd';
        else if (w.hours < 35) color = '#ffe4b5';
        else color = '#ffcccc';

        const healthIcon = w.hours > 35 ? '⚠' : w.hours < 10 ? '✓' : '';

        return `
            <div style="
                background:${color};
                border:1px solid #ddd;
                padding:1rem;
                border-radius:0.5rem;
                text-align:center;
                font-weight:500;
            ">
                <div style="font-size:1.2rem;">${w.name}</div>
                <div style="font-size:2rem;color:var(--primary);">${w.hours}</div>
                <div style="font-size:0.8rem;color:#666;">${w.slots} slots</div>
                <div style="font-size:1.2rem;margin-top:0.5rem;">${healthIcon}</div>
            </div>
        `;
    }).join('');
}

/**
 * Show workload statistics
 */
function showWorkloadStats(workloadData) {
    const hours = workloadData.map(w => w.hours);
    const avg = (hours.reduce((a, b) => a + b, 0) / hours.length).toFixed(1);
    const variance = calculateVariance(hours).toFixed(1);
    const maxH = Math.max(...hours);
    const minH = Math.min(...hours);

    const overloaded = workloadData.filter(w => w.hours > 35);
    const underloaded = workloadData.filter(w => w.hours < avg * 0.5);

    let statsHtml = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-top:1.5rem;">
            <div style="background:#f0f9ff;border:1px solid var(--accent);padding:1rem;border-radius:0.5rem;">
                <div style="font-size:0.9rem;color:#666;">Average Hours</div>
                <div style="font-size:2rem;color:var(--primary);font-weight:700;">${avg}h</div>
            </div>
            <div style="background:#f0f9ff;border:1px solid var(--accent);padding:1rem;border-radius:0.5rem;">
                <div style="font-size:0.9rem;color:#666;">Variance (Std Dev)</div>
                <div style="font-size:2rem;color:var(--primary);font-weight:700;">${variance}h</div>
            </div>
            <div style="background:#f0f9ff;border:1px solid var(--accent);padding:1rem;border-radius:0.5rem;">
                <div style="font-size:0.9rem;color:#666;">Range</div>
                <div style="font-size:1.3rem;color:var(--primary);font-weight:700;">${minH}h - ${maxH}h</div>
            </div>
            <div style="background:#f0f9ff;border:1px solid var(--accent);padding:1rem;border-radius:0.5rem;">
                <div style="font-size:0.9rem;color:#666;">Balance Score</div>
                <div style="font-size:2rem;color:var(--success);font-weight:700;">${(100 - (variance / avg * 100)).toFixed(0)}%</div>
            </div>
        </div>
    `;

    if (overloaded.length > 0) {
        statsHtml += `<div class="reason-box warning" style="margin-top:1rem;">
            <strong>⚠ Overloaded Teachers (>35h):</strong>
            <div style="margin-top:0.5rem;">${overloaded.map(w => `${w.name} (${w.hours}h)`).join(', ')}</div>
        </div>`;
    }

    if (underloaded.length > 0) {
        statsHtml += `<div class="reason-box" style="margin-top:1rem;">
            <strong>ℹ Lightly Loaded Teachers:</strong>
            <div style="margin-top:0.5rem;">Consider using for additional slots: ${underloaded.map(w => `${w.name} (${w.hours}h)`).join(', ')}</div>
        </div>`;
    }

    document.body.insertAdjacentHTML('beforeend', `
        <div id="stats-panel" style="position:fixed;bottom:20px;right:20px;background:white;border:1px solid var(--border);border-radius:0.75rem;padding:1.5rem;max-width:400px;box-shadow:0 4px 12px rgba(0,0,0,0.1);z-index:999;max-height:80vh;overflow-y:auto;">
            ${statsHtml}
            <button onclick="document.getElementById('stats-panel').remove()" style="margin-top:1rem;background:var(--light-bg);border:none;padding:0.5rem 1rem;border-radius:0.375rem;cursor:pointer;width:100%;">Close</button>
        </div>
    `);
}

/**
 * Export workload report as Excel
 */
function exportWorkloadReport() {
    const workloadData = app.getWorkloadData();
    if (workloadData.length === 0) {
        alert('No assignments yet');
        return;
    }

    const data = workloadData.map(w => ({
        'Teacher': w.name,
        'Total Hours': w.hours,
        'Slot Count': w.slots,
        'Avg Hours/Slot': (w.hours / w.slots).toFixed(1),
        'Status': w.hours > 35 ? 'Overloaded' : w.hours < 15 ? 'Available' : 'Balanced'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Workload');
    XLSX.writeFile(wb, `workload-report-${Date.now()}.xlsx`);
}

/**
 * Generate detailed allocation report (text)
 */
function generateAllocationReport() {
    const workloadData = app.getWorkloadData();
    const stats = app.getStats();

    let report = `EXAM INVIGILATION ALLOCATION REPORT\n`;
    report += `${'='.repeat(50)}\n`;
    report += `Generated: ${new Date().toLocaleString()}\n\n`;

    report += `SUMMARY\n`;
    report += `-${'='.repeat(48)}\n`;
    report += `Total Slots: ${stats.totalSlots}\n`;
    report += `Assigned: ${stats.assigned} (${(stats.assigned/stats.totalSlots*100).toFixed(1)}%)\n`;
    report += `Unassigned: ${stats.unassigned}\n`;
    report += `Total Teachers: ${stats.teachers}\n\n`;

    report += `TEACHER WORKLOAD\n`;
    report += `-${'='.repeat(48)}\n`;
    workloadData.forEach(w => {
        report += `${w.name.padEnd(20)} ${w.hours.toString().padStart(2)}h (${w.slots} slots)\n`;
    });

    return report;
}
