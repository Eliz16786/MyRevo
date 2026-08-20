const confidenceMultiplier = {
    "bad": 2,
    "ok": 1.5,
    "good": 1.25
};

const hoursPerWeek = {
    "GCSE Year 10": 2,
    "GCSE Year 11": 4,
    "A Level Year 12": 5,
    "AS Level Year 12": 5,
    "BTEC Year 12": 4,
    "A Level Year 13": 7,
    "BTEC Year 13": 5,
    "T Level (Year 1)": 4,
    "T Level (Year 2)": 6,
    "University (Level 4)": 4,
    "University (Level 5)": 5,
    "University (Level 6)": 6,
    "University (Master's Degree)": 8
};

// The end value is EXCLUSIVE, so it must be one hour past the last
const timeWindows = {
    "Early morning (6am - 9am)": [6, 9],
    "Morning (9am - 12pm)": [9, 12],
    "Afternoon (12pm - 5pm)": [12, 17],
    "Evening (5pm - 8pm)": [17, 20],
    "Night (8pm - 12pm)": [20, 23],
    "It varies": [9, 22]
};

const MAX_CONSECUTIVE_HOURS = 2;
const LUNCH_BREAK_HOURS = [12, 13];
const DINNER_BREAK_HOURS = [17, 18];
const MIN_GAP_AFTER_EXAM = 4;
const EXTRA_HOURS_DAY_BEFORE_EXAM = 2;
const MAX_DIFFERENT_EXAMS_PER_DAY = 2;
const MAX_REVISION_HOURS_PER_DAY = 6;
const FALLBACK_TIME_OF_DAY = "It varies";

// Stops one urgent/low-confidence exam from asking for so many
// hours that it starves every other exam out of the week.
const MAX_WEEKLY_HOURS_PER_EXAM = 16;

const weekCache = {};

// Shuffles an array into a random order
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Returns today's date as "YYYY-MM-DD", matching the format used
function todayString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// How many days between two "YYYY-MM-DD" strings
function daysBetween(dateStrEarlier, dateStrLater) {
    const [y1, m1, d1] = dateStrEarlier.split('-').map(Number);
    const [y2, m2, d2] = dateStrLater.split('-').map(Number);
    const date1 = new Date(y1, m1 - 1, d1);
    const date2 = new Date(y2, m2 - 1, d2);
    return Math.round((date2 - date1) / (1000 * 60 * 60 * 24));
}

// Adds (or subtracts) days from a "YYYY-MM-DD" string and returns the result in the same format
function addDaysToDateString(dateStr, daysToAdd) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + daysToAdd);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

// Works out which hours of the day are allowed for revision, based on a chosen time-of-day and the student's age
function getAllowedHours(timeOfDay, age) {
    let [start, end] = timeWindows[timeOfDay] || timeWindows[FALLBACK_TIME_OF_DAY];
    const isYoung = age === 14 || age === 15 || age === 16;

    if (timeOfDay === "Night (8pm - 12pm)" && isYoung) {
        start = 9;
        end = age === 14 ? 21 : 22;
    } else {
        if (timeOfDay !== "Early morning (6am - 9am)") start = Math.max(start, 9);
        if (timeOfDay !== "Night (8pm - 12pm)") end = Math.min(end, 22);
        if (age === 14) end = Math.min(end, 21);          
        else if (age === 15 || age === 16) end = Math.min(end, 22);
    }

    const hours = [];
    for (let h = start; h < end; h++) hours.push(h);
    return hours;
}

// Finds the exam details whithout crashing, if cannot be found set to default
function getExamDetails(examName, examsData) {
    const normalisedTarget = String(examName).toLowerCase().trim();
    const found = examsData.find(e => {
        return e.name && String(e.name).toLowerCase().trim() === normalisedTarget;
    });
 
    if (!found) {
        console.warn(`MyRevo: couldn't find qualification/confidence for exam "${examName}" in "exams" localStorage — using defaults (GCSE Year 11, ok).`);
    }

    const qualification = (found && found.qualification) || "GCSE Year 10";
    const confidence = (found && found.confidence) || "ok";
    return { qualification, confidence };
}
 
// Checks whether a given hour on a given date already has a revision cell (from ANY exam) marked on it
function isRevisionHour(date, hour) {
    const cell = document.querySelector(`.cal-day[data-date="${date}"][data-hour="${hour}"]`);
    return cell && cell.classList.contains('revision-slot');
}

// It makes sure that the revisions have been placed 2 or less hours consecutively
function wouldExceedConsecutiveLimit(cell) {
    const date = cell.dataset.date;
    const hour = parseInt(cell.dataset.hour, 10);

    // The hour itself
    let runLength = 1;

    let h = hour - 1;
    while (isRevisionHour(date, h)) { runLength++; h--; }

    h = hour + 1;
    while (isRevisionHour(date, h)) { runLength++; h++; }

    // If total hours are more than two, it returns true, meaning don't place it here
    return runLength > MAX_CONSECUTIVE_HOURS;
}

// Stops revision being scheduled in the run-up to an exam on the same day it happens
function isBeforeExamOnSameDay(examInfo, date, hour) {
    return examInfo.some(ex => {
        if (ex.date !== date) return false;
        const [sh] = ex.start.split(':').map(Number);
        return hour < sh;
    });
}

// Checks if this hour is too close to an exam that just finished on this same day
function isTooCloseAfterExam(examInfo, date, hour) {
    return examInfo.some(ex => {
        if (ex.date !== date) return false;
        const [eh, em] = ex.end.split(':').map(Number);
        const examEndHour = em > 0 ? eh + 1 : eh; // hour the exam is fully finished by
        return hour >= examEndHour && hour < examEndHour + MIN_GAP_AFTER_EXAM;
    });
}

// The main function
function plotRevision() {
    const cells = Array.from(document.querySelectorAll('.cal-day'));
    if (cells.length === 0) return;

    // The first cell's date tells us which week this is (Monday)
    const weekKey = cells[0].dataset.date;

    // If we've already generated this week before, just re-apply the same result instead of generating a new random one
    if (weekCache[weekKey]) {
        cells.forEach(cell => {
            const examName = weekCache[weekKey][`${cell.dataset.date}-${cell.dataset.hour}`];
            if (examName) {
                cell.classList.add('revision-slot');
                cell.title = `Revise ${examName}`;
                cell.innerHTML = `<span class="exam-name-cell">${examName}</span>`;
            }
        });
        updateKeyCounts();
        return;
    }
    weekCache[weekKey] = {};

    // Load everything we need from localStorage
    const examInfo = JSON.parse(localStorage.getItem('examInfo')) || [];
    const examsData = JSON.parse(localStorage.getItem('exams')) || [];
    const timeOfDay = localStorage.getItem('timeOfDay') || FALLBACK_TIME_OF_DAY;
    const age = parseInt(localStorage.getItem('age'), 10);

    // The student's preferred hours, plus a wider fallback set to fall back on if their preferred hours don't leave enough room
    const preferredHours = getAllowedHours(timeOfDay, age);
    const fallbackHours = getAllowedHours(FALLBACK_TIME_OF_DAY, age);
    const usingFallbackAlready = timeOfDay === FALLBACK_TIME_OF_DAY;

    const today = todayString();
    const currentHour = new Date().getHours();

    // If a lot of this week is marked unavailable, shrink the hours
    // we ask for instead of just failing to hit a high target.
    // e.g. 40% of the week unavailable -> only ask for 60% of hoursNeeded.
    const totalCellsThisWeek = cells.length;
    const unavailableCellsThisWeek = cells.filter(cell => cell.classList.contains('unavailable-slot')).length;
    const availabilityScale = totalCellsThisWeek > 0
        ? 1 - (unavailableCellsThisWeek / totalCellsThisWeek)
        : 1;

    // Looks at what's already scheduled on a given day and returns the set of distinct exam names that already have revision there
    function getExamNamesOnDay(dateStr) {
        const names = new Set();
        cells.forEach(cell => {
            if (cell.dataset.date === dateStr && cell.classList.contains('revision-slot')) {
                const name = weekCache[weekKey][`${cell.dataset.date}-${cell.dataset.hour}`];
                if (name) names.add(name);
            }
        });
        return names;
    }

    // Counts how many revision hours (any exam) are already placed on a given day
    function getRevisionHoursOnDay(dateStr) {
        let count = 0;
        cells.forEach(cell => {
            if (cell.dataset.date === dateStr && cell.classList.contains('revision-slot')) count++;
        });
        return count;
    }

    // True if this exam is allowed to use this day — either it's already one of the exams scheduled there, or the day hasn't hit the different exams limit yet
    function dayAllowsExam(dateStr, examName) {
        const namesOnDay = getExamNamesOnDay(dateStr);
        return namesOnDay.has(examName) || namesOnDay.size < MAX_DIFFERENT_EXAMS_PER_DAY;
    }

    // True if every cell on this date (in the currently shown week) is marked unavailable.
    function isWholeDayUnavailable(dateStr) {
        const dayCells = cells.filter(cell => cell.dataset.date === dateStr);
        if (dayCells.length === 0) return false;
        return dayCells.every(cell => cell.classList.contains('unavailable-slot'));
    }

    // Used when the day before an exam is entirely unavailable, instead of touching that unavailable day at all,
    // try to fit revision in on the exam's OWN day, in whatever genuinely free hours exist before the exam starts
    function getBeforeExamCells(examDateStr, exam, hoursList) {
        return cells.filter(cell => {
            if (cell.dataset.date !== examDateStr) return false;
            if (cell.classList.contains('exam-slot')) return false;
            if (cell.classList.contains('unavailable-slot')) return false;
            if (cell.classList.contains('revision-slot')) return false;

            const hour = parseInt(cell.dataset.hour, 10);
            // Must be before the exam
            if (!isBeforeExamOnSameDay(examInfo, examDateStr, hour)) return false;
            if (!hoursList.includes(hour)) return false;
            if (LUNCH_BREAK_HOURS.includes(hour)) return false;
            if (DINNER_BREAK_HOURS.includes(hour)) return false;
            if (isTooCloseAfterExam(examInfo, examDateStr, hour)) return false;
            if (!dayAllowsExam(examDateStr, exam.name)) return false;
            if (getRevisionHoursOnDay(examDateStr) >= MAX_REVISION_HOURS_PER_DAY) return false;

            return true;
        });
    }

    // Checks every rule a cell has to pass before it can be used for revision of a particular exam
    function isUsableCell(cell, exam, hoursList) {
        if (cell.classList.contains('exam-slot')) return false;
        if (cell.classList.contains('unavailable-slot')) return false;
        if (cell.classList.contains('revision-slot')) return false;

        const cellDate = cell.dataset.date;
        const hour = parseInt(cell.dataset.hour, 10);

        if (cellDate < today) return false;
        // Stops revision blocks appearing before the current day and hour
        if (cellDate === today && hour <= currentHour) return false;
        if (cellDate >= exam.date) return false;              
        if (!hoursList.includes(hour)) return false;
        if (LUNCH_BREAK_HOURS.includes(hour)) return false;
        if (DINNER_BREAK_HOURS.includes(hour)) return false;
        if (isTooCloseAfterExam(examInfo, cellDate, hour)) return false;
        if (isBeforeExamOnSameDay(examInfo, cellDate, hour)) return false;
        if (!dayAllowsExam(cellDate, exam.name)) return false;
        if (getRevisionHoursOnDay(cellDate) >= MAX_REVISION_HOURS_PER_DAY) return false;

        return true;
    }

    // Randomly fills up to targetHours cells from a list of candidates, skipping any that would break the 3-in-a-row rule
    function fillCells(candidateCells, targetHours, exam) {
        const shuffled = [...candidateCells];
        shuffle(shuffled);

        let filled = 0;
        for (const cell of shuffled) {
            if (filled >= targetHours) break;
            if (wouldExceedConsecutiveLimit(cell)) continue;

            cell.classList.add('revision-slot');
            cell.title = `Revise ${exam.name}`;
            cell.innerHTML = `<span class="exam-name-cell">${exam.name}</span>`;

            weekCache[weekKey][`${cell.dataset.date}-${cell.dataset.hour}`] = exam.name;
            filled++;
        }
        return filled;
    }

    // It tries to add the right number of revision hours within thst certain time of day
    // but if this doesn't work this would be defaulted to "It varies" hours
    function fillWithFallback(dateFilter, targetHours, exam) {
        const preferredCells = cells.filter(cell => dateFilter(cell) && isUsableCell(cell, exam, preferredHours));
        let filled = fillCells(preferredCells, targetHours, exam);

        if (filled < targetHours && !usingFallbackAlready) {
            const fallbackCells = cells.filter(cell => dateFilter(cell) && isUsableCell(cell, exam, fallbackHours));
            filled += fillCells(fallbackCells, targetHours - filled, exam);
        }

        return filled;
    }

    // Sort so exams with worse confidence (higher multiplier, e.g.
    // "bad") get scheduled first each week — that way they get first
    // pick of the limited slots, instead of whichever exam just
    // happens to come first in the list.
    const sortedExamInfo = [...examInfo].sort((a, b) => {
        const confA = getExamDetails(a.name, examsData).confidence;
        const confB = getExamDetails(b.name, examsData).confidence;
        return (confidenceMultiplier[confB] || 1) - (confidenceMultiplier[confA] || 1);
    });

    // --- Pass 1: guarantee the day-before-exam revision for EVERY
    // exam first, regardless of confidence, before anything starts
    // eating into the week's general capacity. This stops a close,
    // low-confidence exam from starving a "good" exam's day-before
    // slot before it even gets a turn. ---
    sortedExamInfo.forEach(exam => {
        if (exam.date < today) return;

        const dayBeforeExam = addDaysToDateString(exam.date, -1);

        if (isWholeDayUnavailable(dayBeforeExam)) {
            const beforeExamCells = getBeforeExamCells(exam.date, exam, preferredHours);
            let filled = fillCells(beforeExamCells, EXTRA_HOURS_DAY_BEFORE_EXAM, exam);

            if (filled < EXTRA_HOURS_DAY_BEFORE_EXAM && !usingFallbackAlready) {
                const beforeExamFallbackCells = getBeforeExamCells(exam.date, exam, fallbackHours);
                fillCells(beforeExamFallbackCells, EXTRA_HOURS_DAY_BEFORE_EXAM - filled, exam);
            }
        } else {
            fillWithFallback(cell => cell.dataset.date === dayBeforeExam, EXTRA_HOURS_DAY_BEFORE_EXAM, exam);
        }
    });

    // --- Pass 2: fill each exam's normal weekly target, worst
    // confidence first, now that every exam already has its
    // day-before slot locked in. ---
    sortedExamInfo.forEach(exam => {
        if (exam.date < today) return;

        const { qualification, confidence } = getExamDetails(exam.name, examsData);
        let hoursNeeded = (hoursPerWeek[qualification] || 4) * (confidenceMultiplier[confidence] || 1);

        // The closer the exam is, the more hours we schedule this week
        const daysAway = daysBetween(today, exam.date);
        if (daysAway <= 7) {
            hoursNeeded = Math.round(hoursNeeded * 2);
        } else if (daysAway <= 14) {
            hoursNeeded = Math.round(hoursNeeded * 1.5);
        } else {
            hoursNeeded = Math.round(hoursNeeded);
        }

        // Shrink the target if this week is short on availability,
        // instead of asking for a high number it can't ever reach.
        hoursNeeded = Math.round(hoursNeeded * availabilityScale);

        // Stop this one exam from eating the whole week.
        hoursNeeded = Math.min(hoursNeeded, MAX_WEEKLY_HOURS_PER_EXAM);

        fillWithFallback(() => true, hoursNeeded, exam);
    });

    updateKeyCounts();
}

// Updating the weeks overview
function updateKeyCounts() {
    const cells = document.querySelectorAll('.cal-day');
    const examNames = new Set();
    let revisionHours = 0;
    let unavailableHours = 0;
    let availableHours = 0;

    cells.forEach(cell => {
        if (cell.classList.contains('exam-slot')) {
            examNames.add(cell.title ? cell.title.split(' (')[0] : 'Exam');
        } else if (cell.classList.contains('revision-slot')) {
            revisionHours++;
        } else if (cell.classList.contains('unavailable-slot')) {
            unavailableHours++;
        } else {
            availableHours++;
        }
    });

    const rows = document.querySelectorAll('#keyGrid .key-row');
    if (rows[0]) rows[0].querySelector('.key-count').textContent = examNames.size;
    if (rows[1]) rows[1].querySelector('.key-count').textContent = `${revisionHours} hr`;
    if (rows[2]) rows[2].querySelector('.key-count').textContent = `${unavailableHours} hr`;
    if (rows[3]) rows[3].querySelector('.key-count').textContent = `${availableHours} hr`;
}