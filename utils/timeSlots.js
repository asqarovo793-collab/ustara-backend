const DAY_NAMES = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const toHHMM = (mins) => {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
};

// dateStr: "YYYY-MM-DD" -> shu kunning hafta kuni nomini qaytaradi
const isValidDateString = (dateStr) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "")) return false;
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateStr;
};

const getTashkentDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
};

const getTodayInTashkent = () => {
  const { year, month, day } = getTashkentDateParts();
  return `${year}-${month}-${day}`;
};

const getMonthInTashkent = (date) => {
  const { year, month } = getTashkentDateParts(date);
  return `${year}-${month}`;
};

const getDayName = (dateStr) => {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  return DAY_NAMES[date.getUTCDay()];
};

/**
 * Berilgan sana uchun bo'sh vaqt oralig'larini hisoblaydi.
 * @param {Object} barber - Barber hujjati (workingHours, slotDurationMinutes)
 * @param {String} dateStr - "YYYY-MM-DD"
 * @param {Number} serviceDuration - xizmat davomiyligi (daqiqa)
 * @param {Array} existingBookings - shu kundagi bronlar [{startTime, endTime}]
 */
const generateAvailableSlots = (barber, dateStr, serviceDuration, existingBookings = []) => {
  if (!isValidDateString(dateStr) || dateStr < getTodayInTashkent()) return [];
  const dayName = getDayName(dateStr);
  const daySchedule = barber.workingHours.find((w) => w.day === dayName);

  if (!daySchedule || !daySchedule.isOpen) {
    return [];
  }

  const openMin = toMinutes(daySchedule.open);
  const closeMin = toMinutes(daySchedule.close);
  const step = barber.slotDurationMinutes || 30;

  // Bugungi sana bo'lsa, o'tgan vaqtlarni chiqarmaymiz
  const now = new Date();
  const isToday = dateStr === getTodayInTashkent();
  const localTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const nowMin = toMinutes(localTime);

  const busyRanges = existingBookings.map((b) => ({
    start: toMinutes(b.startTime),
    end: toMinutes(b.endTime),
  }));

  const slots = [];
  for (let start = openMin; start + serviceDuration <= closeMin; start += step) {
    if (isToday && start <= nowMin) continue;

    const end = start + serviceDuration;
    const overlaps = busyRanges.some((b) => start < b.end && end > b.start);
    if (!overlaps) {
      slots.push({ startTime: toHHMM(start), endTime: toHHMM(end) });
    }
  }

  return slots;
};

module.exports = { generateAvailableSlots, getDayName, toMinutes, toHHMM, isValidDateString, getTodayInTashkent, getMonthInTashkent };
