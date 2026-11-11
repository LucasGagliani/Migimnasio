import { type Data, type SetLog, dateKey, number } from './model';

export const closedMonth = (now = new Date()) => new Date(now.getFullYear(), now.getMonth() - 1, 1);

export function monthlyReport(data: Data, month: Date) {
  const start = dateKey(month).slice(0, 7);
  const previous = dateKey(closedMonth(month)).slice(0, 7);
  const currentSessions = data.sessions.filter(session => session.day.startsWith(start));
  const priorSets = data.sessions.filter(session => session.day.startsWith(previous)).flatMap(session => session.sets);
  const currentSets = currentSessions.flatMap(session => session.sets);
  const groups = new Map<string, SetLog[]>();
  for (const set of currentSets) {
    const group = groups.get(set.exercise.id) ?? [];
    group.push(set);
    groups.set(set.exercise.id, group);
  }
  const improvements = [];
  let comparable = 0;
  for (const [exerciseId, sets] of groups) {
    const baseline = priorSets.filter(set => set.exercise.id === exerciseId);
    if (!baseline.length) continue;
    comparable++;
    const bestLoad = Math.max(...baseline.map(set => number(set.kg)));
    const loadRecord = [...sets].sort((a, b) => number(b.kg) - number(a.kg) || number(b.reps) - number(a.reps))
      .find(set => number(set.kg) > bestLoad && baseline.some(prior => number(set.reps) >= number(prior.reps) && number(prior.kg) === bestLoad));
    const repRecord = sets.map(set => {
      const matching = baseline.filter(prior => number(prior.kg) === number(set.kg));
      const previousReps = matching.length ? Math.max(...matching.map(prior => number(prior.reps))) : number(set.reps);
      return { set, gain: number(set.reps) - previousReps, previousReps };
    }).sort((a, b) => b.gain - a.gain)[0];
    const exercise = sets[0].exercise;
    const name = exercise.machine ? exercise.name + ' · ' + exercise.machine : exercise.name;
    if (loadRecord) improvements.push({ exerciseId, name, detail: bestLoad + ' → ' + number(loadRecord.kg) + ' kg · ' + loadRecord.reps + ' reps' });
    else if (repRecord.gain > 0) improvements.push({ exerciseId, name, detail: repRecord.previousReps + ' → ' + repRecord.set.reps + ' reps con ' + number(repRecord.set.kg) + ' kg' });
  }

  const measureChanges = [];
  for (const name of new Set(data.measures.filter(item => item.day.startsWith(start)).map(item => item.name))) {
    const values = data.measures.filter(item => item.name === name).sort((a, b) => b.day.localeCompare(a.day));
    const current = values.find(item => item.day.startsWith(start))!;
    const earlier = values.find(item => item.day.startsWith(previous));
    if (earlier) {
      const change = Number((current.value - earlier.value).toFixed(2));
      measureChanges.push({ name, change, unit: current.unit });
    }
  }
  return {
    gym: currentSessions.filter(session => session.kind === 'gym').length,
    basket: currentSessions.filter(session => session.kind === 'basket').length,
    comparable,
    improvements,
    measureChanges,
  };
}
