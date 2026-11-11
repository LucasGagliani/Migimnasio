export type Exercise = { id: string; name: string; machine: string; sets: number; restSeconds?: number };
export type Routine = { id: string; name: string; exercises: Exercise[] };
export type SetLog = { exercise: Exercise; kg: string; reps: string; done: boolean };
export type Session = { id: string; day: string; kind: 'gym' | 'basket'; name: string; sets: SetLog[]; calories: string; effort: string; restUntil?: number };
export type Measurement = { id: string; day: string; name: string; value: number; unit: string };
export type Data = { routines: Routine[]; sessions: Session[]; draft: Session | null; measures: Measurement[] };
export const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
export const dateKey = (d = new Date()) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
export const fromKey = (d: string) => new Date(d + 'T12:00:00');
export const isDateKey = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && dateKey(fromKey(day)) === day;
export const defaultRestSeconds = 90;
export const formatDate = (d: string) => fromKey(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
export const weekStart = (d = new Date()) => {
  const monday = new Date(d);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return dateKey(monday);
};
export const number = (raw: string) => /^\d+(?:[.,]\d+)?$/.test(raw.trim()) ? Number(raw.replace(',', '.')) : NaN;
export const empty: Data = {
  routines: [1, 2, 3, 4].map(n => ({ id: String(n), name: 'Rutina ' + n, exercises: [] })),
  sessions: [], draft: null, measures: [],
};
export function previousSets(sessions: Session[], exerciseId: string, through = dateKey()): SetLog[] {
  const previous = sessions.find(session => session.day <= through && session.sets.some(set => set.exercise.id === exerciseId));
  return previous?.sets.filter(set => set.exercise.id === exerciseId) ?? [];
}

export function makeSession(data: Data, routine?: Routine): Session {
  const sets = routine?.exercises.flatMap(exercise => {
    const logged = previousSets(data.sessions, exercise.id);
    return Array.from({ length: exercise.sets }, (_, i) => ({
      exercise, kg: logged[i]?.kg ?? '', reps: logged[i]?.reps ?? '', done: false,
    }));
  }) ?? [];
  return { id: id(), day: dateKey(), kind: routine ? 'gym' : 'basket', name: routine?.name ?? 'Básquet', sets, calories: '', effort: '' };
}
