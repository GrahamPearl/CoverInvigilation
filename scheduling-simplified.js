/**
 * SIMPLIFIED SCHEDULING ENGINE
 * Fair workload distribution by timeShift with detailed reasoning
 * Returns unassigned slots with reasons
 */

function scheduleWithReasons(assignments, teachers, existingAllocations) {
    const result = {
        assigned: 0,
        unassigned: [],
        warnings: [],
        stats: { avgHours: 0, maxHours: 0, minHours: 0 }
    };

    // Identify empty slots (not pre-assigned)
    const emptySlots = assignments
        .map((a, idx) => (a.educator || existingAllocations.get(idx)) ? null : idx)
        .filter(idx => idx !== null);

    if (emptySlots.length === 0) {
        result.warnings.push('All slots already assigned');
        return result;
    }

    // Build workload map
    const workload = {};
    teachers.forEach(t => {
        workload[t.name] = { hours: 0, slots: 0, grades: new Set(), is_zulu: t.is_zulu };
    });

    assignments.forEach((a, idx) => {
        const teacher = a.educator || existingAllocations.get(idx);
        if (teacher && workload[teacher]) {
            workload[teacher].hours += a.timeshift || 0;
            workload[teacher].slots++;
            workload[teacher].grades.add(a.grade);
        }
    });

    // Sort slots by difficulty (fewest eligible teachers first)
    const sortedSlots = emptySlots.sort((a, b) => {
        const aEligible = countEligible(assignments[a], teachers, workload);
        const bEligible = countEligible(assignments[b], teachers, workload);
        return aEligible - bEligible;
    });

    // Assign each slot
    sortedSlots.forEach(idx => {
        const slot = assignments[idx];
        const best = findBestTeacher(slot, teachers, workload);

        if (best) {
            result.assigned++;
            app.assignToSlot(idx, best.name, best.reason);
            workload[best.name].hours += slot.timeshift;
            workload[best.name].slots++;
        } else {
            result.unassigned.push({
                exam: slot.exam,
                date: slot.date,
                venue: slot.venue,
                grade: slot.grade,
                reason: getUnassignedReason(slot, teachers, workload)
            });
        }
    });

    // Calculate statistics
    const hours = Object.values(workload).map(w => w.hours);
    result.stats.avgHours = (hours.reduce((a, b) => a + b, 0) / hours.length).toFixed(1);
    result.stats.maxHours = Math.max(...hours).toFixed(1);
    result.stats.minHours = Math.min(...hours).toFixed(1);

    // Check workload balance
    const variance = calculateVariance(hours);
    if (variance > 8) {
        result.warnings.push(`High variance (${variance.toFixed(1)}h) - consider manual adjustments`);
    }

    return result;
}

/**
 * Count eligible teachers for a slot
 */
function countEligible(slot, teachers, workload) {
    return teachers.filter(t => {
        const w = workload[t.name];
        
        // Check language requirement
        if (slot.is_zulu && !t.is_zulu) return false;
        
        // Check hour limit (max 40 hours)
        if (w.hours >= 40) return false;
        
        // Check double-booking (same date/session)
        const isDoubleBooked = false; // Simplified - implement if needed
        if (isDoubleBooked) return false;

        return true;
    }).length;
}

/**
 * Find best teacher for slot using ranking
 */
function findBestTeacher(slot, teachers, workload) {
    const candidates = teachers.filter(t => {
        const w = workload[t.name];
        
        // Hard constraints
        if (slot.is_zulu && !t.is_zulu) return false;
        if (w.hours >= 40) return false;
        
        return true;
    });

    if (candidates.length === 0) return null;

    // Rank by: grade match (40%) + lowest workload (40%) + language (20%)
    let bestTeacher = null;
    let bestScore = -1;

    candidates.forEach(t => {
        const w = workload[t.name];
        
        // Grade match (0-100)
        const gradeScore = t.registerClass === slot.grade ? 100 :
                          t.registerClass === 'ROTATE' ? 50 : 0;

        // Workload score (lower hours = higher score, 0-100)
        const avgHours = Object.values(workload).reduce((a, b) => a + b.hours, 0) / teachers.length;
        const workloadScore = Math.max(0, Math.min(100, 100 - (w.hours / avgHours * 50)));

        // Language bonus
        const langScore = (slot.is_zulu && t.is_zulu) ? 20 : 0;

        // Combined score
        const score = (gradeScore * 0.4) + (workloadScore * 0.4) + langScore;

        if (score > bestScore) {
            bestScore = score;
            bestTeacher = t;
        }
    });

    if (!bestTeacher) return null;

    return {
        name: bestTeacher.name,
        reason: `Grade match + fair workload (${workload[bestTeacher.name].hours}h)`
    };
}

/**
 * Get reason why slot couldn't be assigned
 */
function getUnassignedReason(slot, teachers, workload) {
    // Check language constraint
    const zuluTeachers = teachers.filter(t => t.is_zulu);
    if (slot.is_zulu && zuluTeachers.length === 0) {
        return 'Requires Zulu speaker - none available';
    }
    if (slot.is_zulu) {
        const availableZulu = zuluTeachers.filter(t => (workload[t.name].hours || 0) < 40);
        if (availableZulu.length === 0) {
            return 'All Zulu speakers at max hours (40h limit)';
        }
    }

    // Check workload constraint
    const availableTeachers = teachers.filter(t => (workload[t.name].hours || 0) < 40);
    if (availableTeachers.length === 0) {
        return 'All teachers at maximum workload (40 hours)';
    }

    // Check grade match
    const matchingGrade = teachers.filter(t => 
        t.registerClass === slot.grade && (workload[t.name].hours || 0) < 40
    );
    if (matchingGrade.length === 0) {
        const rotate = teachers.filter(t => 
            t.registerClass === 'ROTATE' && (workload[t.name].hours || 0) < 40
        );
        if (rotate.length === 0) {
            return `No available ${slot.grade} or ROTATE teachers`;
        }
    }

    return 'No suitable teacher found';
}

/**
 * Calculate variance (standard deviation)
 */
function calculateVariance(hours) {
    if (hours.length === 0) return 0;
    const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
    const squaredDiffs = hours.map(h => Math.pow(h - avg, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / hours.length);
}

/**
 * Get allocation quality metrics
 */
function getAllocationQuality(assignments, allocations, teachers) {
    const workload = {};
    teachers.forEach(t => workload[t.name] = 0);

    assignments.forEach((a, idx) => {
        const teacher = a.educator || allocations.get(idx);
        if (teacher && workload.hasOwnProperty(teacher)) {
            workload[teacher] += a.timeshift || 0;
        }
    });

    const hours = Object.values(workload).filter(h => h > 0);
    const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
    const variance = calculateVariance(hours);

    return {
        avgHours: avg.toFixed(1),
        maxHours: Math.max(...hours).toFixed(1),
        minHours: Math.min(...hours).toFixed(1),
        variance: variance.toFixed(1),
        balanceScore: (100 - (variance / avg * 100)).toFixed(0) + '%'
    };
}
