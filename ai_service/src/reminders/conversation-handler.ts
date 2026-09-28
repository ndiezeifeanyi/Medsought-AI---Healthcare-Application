export type ReminderResponseIntent = "taken" | "missed" | "delay" | "refill" | "unknown" | "unrelated";

export interface ReminderInterpretation {
  intent: ReminderResponseIntent;
  confidence: number;
}

export interface ReminderScheduleRequest {
  medicine?: string;
  target_time?: string;
  relative_delay_minutes?: number;
  frequency: "once" | "daily" | "twice_daily" | "every_x_hours" | "weekly";
  dosage?: string;
  notes?: string;
}

export function interpretReminderResponseFallback(message: string): ReminderInterpretation {
  if (/\b(i'?ve taken it|taken it|done|took it|drank it)\b/i.test(message)) return { intent: "taken", confidence: 0.75 };
  if (/\b(missed|forgot|haven'?t taken|have not taken|skipped)\b/i.test(message)) return { intent: "missed", confidence: 0.75 };
  if (/\b(remind me later|later|snooze|delay|postpone)\b/i.test(message)) return { intent: "delay", confidence: 0.7 };
  if (/\b(refill|finished|running out|low|out of stock)\b/i.test(message)) return { intent: "refill", confidence: 0.7 };
  return { intent: "unrelated", confidence: 0.3 };
}

export function parseReminderScheduleRequest(
  message: string,
  detectedMedicine?: string | null,
  currentMedicine?: string | null
): ReminderScheduleRequest {
  const lower = message.toLowerCase();
  const medicineName = (detectedMedicine && detectedMedicine.trim().length > 0) ? detectedMedicine : (currentMedicine ?? undefined);

  // Extract relative delay minutes (e.g., "in 30 mins", "in 2 hours")
  let relativeDelay: number | undefined;
  const delayMatch = message.match(/\bin\s+(\d+)\s*(mins?|minutes?|hours?|hrs?)\b/i);
  if (delayMatch) {
    const val = parseInt(delayMatch[1], 10);
    const unit = delayMatch[2].toLowerCase();
    if (unit.startsWith("hour") || unit.startsWith("hr")) {
      relativeDelay = val * 60;
    } else {
      relativeDelay = val;
    }
  }

  // Extract target time (e.g., "8:00 PM", "9am", "20:00")
  let targetTime: string | undefined;
  const timeMatch = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const min = timeMatch[2] ?? "00";
    const ampm = timeMatch[3].toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    targetTime = `${hour.toString().padStart(2, "0")}:${min}`;
  } else {
    const twentyFourHourMatch = message.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (twentyFourHourMatch) {
      targetTime = `${twentyFourHourMatch[1].padStart(2, "0")}:${twentyFourHourMatch[2]}`;
    }
  }

  // Determine recurrence frequency
  let frequency: "once" | "daily" | "twice_daily" | "every_x_hours" | "weekly" = "once";
  if (/\b(twice daily|twice a day|2 times a day|every 12 hours)\b/i.test(message)) {
    frequency = "twice_daily";
  } else if (/\b(daily|every day|every morning|every night|each day)\b/i.test(message)) {
    frequency = "daily";
  } else if (/\b(every \d+ hours|every \d+ hrs)\b/i.test(message)) {
    frequency = "every_x_hours";
  } else if (/\b(weekly|every week)\b/i.test(message)) {
    frequency = "weekly";
  }

  // Extract dosage (e.g., "500mg", "2 tablets", "10ml")
  let dosage: string | undefined;
  const dosageMatch = message.match(/\b\d+\s*(mg|g|ml|tablets?|pills?|capsules?)\b/i);
  if (dosageMatch) {
    dosage = dosageMatch[0];
  }

  // Extract specific instructions / notes
  let notes: string | undefined;
  if (/\bafter (food|meal|eating)\b/i.test(message)) notes = "take after food";
  else if (/\bbefore (food|meal|eating)\b/i.test(message)) notes = "take before food";
  else if (/\bwith (water|milk)\b/i.test(message)) notes = `take with ${message.match(/with (water|milk)/i)?.[1]}`;

  return {
    medicine: medicineName,
    target_time: targetTime,
    relative_delay_minutes: relativeDelay,
    frequency,
    dosage,
    notes
  };
}
