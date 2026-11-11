import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Data, Exercise, Session, Routine, dateKey, defaultRestSeconds, empty, formatDate, fromKey, id, isDateKey, makeSession, number, previousSets, weekStart } from './model';

import { closedMonth, monthlyReport } from './monthly';

const C = { bg: '#111412', card: '#1c211d', line: '#343c34', text: '#f3f5ed', muted: '#a7b1a6', lime: '#d4fa78', ink: '#1b250e', purple: '#d3b9fd' };
const tabs = [
  ['Entrenar', 'barbell-outline'], ['Calendario', 'calendar-outline'], ['Progreso', 'trending-up-outline'],
  ['Medidas', 'body-outline'], ['IA', 'sparkles-outline'],
] as const;
type Tab = typeof tabs[number][0];
const percent = (value: number): `${number}%` => `${value * 100}%`;
const storageKey = 'mi-gimnasio-v1';

function Label({ children }: { children: React.ReactNode }) { return <Text style={s.label}>{children}</Text>; }
function Body({ children }: { children: React.ReactNode }) { return <Text style={s.body}>{children}</Text>; }
function Card({ children }: { children: React.ReactNode }) { return <View style={s.card}>{children}</View>; }
function Button({ title, onPress, primary = false }: { title: string; onPress: () => void; primary?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.button, primary && s.primary, pressed && s.pressed]}><Text style={[s.buttonText, primary && s.primaryText]}>{title}</Text></Pressable>;
}
function Field({ value, onChangeText, placeholder, numeric = false }: { value: string; onChangeText: (v: string) => void; placeholder: string; numeric?: boolean }) {
  return <TextInput accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor={C.muted} value={value} onChangeText={onChangeText} keyboardType={numeric ? 'decimal-pad' : 'default'} style={s.input} />;
}
function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return <View style={s.heading}><Text style={s.title}>{title}</Text><Body>{subtitle}</Body></View>;
}

function RestTimer({ until, extend, skip }: { until: number; extend: () => void; skip: () => void }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [until]);
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  return <View style={s.between}>
    <View>
      <Label>Descanso</Label>
      <Text style={s.cardTitle}>{seconds ? Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') : 'Listo'}</Text>
    </View>
    <View style={s.wrap}>
      <Button title="+15 s" onPress={extend} />
      <Button title={seconds ? 'Saltear' : 'Cerrar'} onPress={skip} />
    </View>
  </View>;
}

export default function App() {
  return <SafeAreaProvider><Tracker /></SafeAreaProvider>;
}

function Tracker() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('Entrenar');
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [confirmation, setConfirmation] = useState<'finish' | 'discard' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [month, setMonth] = useState(() => new Date());
  const [reportOffset, setReportOffset] = useState(0);
  const [day, setDay] = useState(dateKey());
  const [exerciseId, setExerciseId] = useState('');
  const [workoutExerciseId, setWorkoutExerciseId] = useState('');
  const [measureName, setMeasureName] = useState('Peso');
  const [measureValue, setMeasureValue] = useState('');
  const [measureDay, setMeasureDay] = useState(dateKey());

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then(raw => setData(raw ? JSON.parse(raw) : empty))
      .catch(() => setStorageError('No se pudo leer el registro. Volvé a abrir la app para reintentar.'));
  }, []);
  useEffect(() => {
    if (!data) return;
    AsyncStorage.setItem(storageKey, JSON.stringify(data))
      .then(() => setStorageError(''))
      .catch(() => setStorageError('No se pudieron guardar los cambios en este dispositivo.'));
  }, [data]);

  if (!data) return <SafeAreaView style={s.loading}>{storageError ? <Body>{storageError}</Body> : <ActivityIndicator color={C.lime} />}</SafeAreaView>;
  const { sessions, draft, measures, routines } = data;
  const today = dateKey();
  const yesterdayDate = fromKey(today);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const monday = weekStart();
  const sundayDate = fromKey(monday);
  sundayDate.setDate(sundayDate.getDate() + 6);
  const week = sessions.filter(x => x.day >= monday && x.day <= dateKey(sundayDate));
  const gym = week.filter(x => x.kind === 'gym').length;
  const basket = week.filter(x => x.kind === 'basket').length;
  const updateSession = (session: Session) => {
    if (selectedSession) setSelectedSession(session);
    else setData({ ...data, draft: session });
  };
  const active = selectedSession ?? draft;
  const switchTab = (next: Tab) => { setError(''); setRoutine(null); setSelectedSession(null); setTab(next); };

  function finish(session: Session) {
    if (!data) return;
    if (!isDateKey(session.day) || session.day > today) { setError('Ingresá una fecha válida de hoy o anterior.'); return; }
    if (session.calories.trim() && !Number.isFinite(number(session.calories))) { setError('Ingresá las calorías activas como número.'); return; }
    const sets = session.sets.filter(x => x.done);
    if (session.kind === 'gym' && !sets.length) { setError('Confirmá al menos una serie.'); return; }
    if (sets.some(x => !Number.isFinite(number(x.kg)) || !Number.isInteger(number(x.reps)) || number(x.reps) <= 0)) {
      setError('Revisá los pesos y las repeticiones de las series confirmadas.'); return;
    }
    const completed = { ...session, sets, restUntil: undefined };
    setData({ ...data, draft: selectedSession ? data.draft : null, sessions: [completed, ...sessions.filter(x => x.id !== session.id)].sort((a, b) => b.day.localeCompare(a.day)) });
    setDay(session.day);
    setMonth(fromKey(session.day));
    if (!selectedSession) setWorkoutExerciseId('');
    switchTab('Calendario');
  }

  function sessionForm(session: Session) {
    const groups = Array.from(new Map(session.sets.map(x => [x.exercise.id, x.exercise])).values());
    const inWorkout = !selectedSession && session.kind === 'gym';
    const nextSet = session.sets.find(set => !set.done);
    const focusedId = workoutExerciseId || nextSet?.exercise.id || groups[0]?.id;
    const shown = inWorkout ? groups.filter(exercise => exercise.id === focusedId) : groups;
    const done = session.sets.filter(set => set.done).length;
    return <>
      <Heading title={session.name} subtitle={isDateKey(session.day) ? formatDate(session.day) : 'Elegí la fecha de la sesión'} />
      {inWorkout && <Card>
        <Label>{done} de {session.sets.length} series completadas</Label>
        <View style={s.wrap}>{groups.map(exercise => <Button key={exercise.id} title={exercise.name}
          primary={exercise.id === focusedId} onPress={() => setWorkoutExerciseId(exercise.id)} />)}</View>
        {session.restUntil && <RestTimer until={session.restUntil}
          extend={() => updateSession({ ...session, restUntil: Math.max(Date.now(), session.restUntil!) + 15000 })}
          skip={() => updateSession({ ...session, restUntil: undefined })} />}
      </Card>}
      {shown.map(exercise => {
        const previous = selectedSession ? [] : previousSets(sessions, exercise.id, isDateKey(session.day) ? session.day : today);
        const rows = session.sets.map((row, index) => ({ row, index }))
          .filter(({ row }) => row.exercise.id === exercise.id);
        const nextIndex = rows.find(({ row }) => !row.done)?.index;
        return <Card key={exercise.id}>
        <Text style={s.cardTitle}>{exercise.name}</Text>{!!exercise.machine && <Body>{exercise.machine}</Body>}
        {rows.map(({ row, index }, position) => <View key={index} style={s.measure}>
          <Label>{index === nextIndex && inWorkout ? 'Próxima · ' : ''}Serie {position + 1}</Label>
          {previous[position] && <Body>Última vez · {previous[position].kg} kg × {previous[position].reps} reps</Body>}
          <View style={s.row}>
          <View style={s.flex}><Field placeholder="Peso (kg)" value={row.kg} numeric onChangeText={kg => changeSet(index, { kg })} /></View>
          <View style={s.flex}><Field placeholder="Reps" value={row.reps} numeric onChangeText={reps => changeSet(index, { reps })} /></View>
          {!selectedSession && <Button title={row.done ? '✓' : 'Guardar'} primary={row.done} onPress={() => {
            if (!row.done && (!Number.isFinite(number(row.kg)) || !Number.isInteger(number(row.reps)) || number(row.reps) <= 0)) { setError('Ingresá un peso y una cantidad válida de repeticiones.'); return; }
            changeSet(index, { done: !row.done });
          }} />}
          {selectedSession && session.sets.length > 1 && <Button title="Quitar" onPress={() => {
            updateSession({ ...session, sets: session.sets.filter((_, i) => i !== index) });
          }} />}
          </View>
        </View>)}
        <Button title="+ Serie" onPress={() => {
          const set = { exercise, kg: '', reps: '', done: Boolean(selectedSession) };
          updateSession({ ...session, sets: [...session.sets, set] });
        }} />
        </Card>;
      })}
      <Card>
        <Label>Fecha de la sesión</Label>
        <Field placeholder="Fecha (AAAA-MM-DD)" value={session.day} onChangeText={day => { setError(''); updateSession({ ...session, day }); }} />
        <View style={s.wrap}>
          <Button title="Hoy" onPress={() => { setError(''); updateSession({ ...session, day: today }); }} />
          <Button title="Ayer" onPress={() => { setError(''); updateSession({ ...session, day: dateKey(yesterdayDate) }); }} />
        </View>
        <Label>Calorías activas · opcional</Label>
        <Field placeholder="kcal de Garmin" value={session.calories} numeric onChangeText={calories => updateSession({ ...session, calories })} />
        <Label>¿Cómo te sentiste?</Label>
        <View style={s.wrap}>{['Fácil', 'Normal', 'Duro'].map(effort => <Button key={effort} title={effort} primary={effort === session.effort} onPress={() => updateSession({ ...session, effort: effort === session.effort ? '' : effort })} />)}</View>
      </Card>
      <Button title={selectedSession ? 'Guardar cambios' : 'Finalizar entrenamiento'} primary onPress={() => {
        if (selectedSession) finish(session);
        else if (session.kind === 'gym' && !session.sets.some(set => set.done)) setError('Confirmá al menos una serie.');
        else setConfirmation('finish');
      }} />
      <Button title={selectedSession ? 'Volver al calendario' : 'Descartar sesión'} onPress={() => {
        if (selectedSession) switchTab('Calendario');
        else setConfirmation('discard');
      }} />
      {selectedSession && <Button title="Eliminar entrenamiento" onPress={() => setConfirmation('delete')} />}
    </>;

    function changeSet(index: number, patch: Partial<Session['sets'][number]>) {
      setError('');
      const next = { ...session, sets: session.sets.map((set, i) => i === index ? { ...set, ...patch } : set) };
      if (inWorkout && patch.done) {
        const exercise = next.sets[index].exercise;
        const pending = next.sets.find(set => !set.done && set.exercise.id === exercise.id) ?? next.sets.find(set => !set.done);
        if (pending) {
          next.restUntil = Date.now() + (exercise.restSeconds ?? defaultRestSeconds) * 1000;
          setWorkoutExerciseId(pending.exercise.id);
        } else {
          next.restUntil = undefined;
          setConfirmation('finish');
        }
      }
      updateSession(next);
    }
  }

  function editRoutine(current: Routine) {
    const existing = routines.some(x => x.id === current.id);
    function edit(exercise: Exercise, patch: Partial<Exercise>) {
      setRoutine({ ...current, exercises: current.exercises.map(x => x.id === exercise.id ? { ...x, ...patch } : x) });
    }
    return <>
      <Heading title={existing ? 'Editar rutina' : 'Nueva rutina'} subtitle="Ordená tus ejercicios como los hacés en el gimnasio." />
      <Field placeholder="Nombre de rutina" value={current.name} onChangeText={name => setRoutine({ ...current, name })} />
      {current.exercises.map((x, i) => <Card key={x.id}>
        <Label>Ejercicio {i + 1}</Label>
        <Field placeholder="Nombre del ejercicio" value={x.name} onChangeText={name => edit(x, { name })} />
        <Field placeholder="Máquina o ajuste de asiento" value={x.machine} onChangeText={machine => edit(x, { machine })} />
        <Label>Descanso entre series</Label>
        <View style={s.wrap}>{[30, 60, 90, 120, 180].map(seconds =>
          <Button key={seconds} title={seconds + ' s'} primary={seconds === (x.restSeconds ?? defaultRestSeconds)}
            onPress={() => edit(x, { restSeconds: seconds })} />)}</View>
        <View style={s.wrap}><Button title="−" onPress={() => edit(x, { sets: Math.max(1, x.sets - 1) })} /><Body>{x.sets} series</Body><Button title="+" onPress={() => edit(x, { sets: Math.min(20, x.sets + 1) })} /><Button title="Quitar" onPress={() => setRoutine({ ...current, exercises: current.exercises.filter(e => e.id !== x.id) })} /></View>
      </Card>)}
      <Button title="+ Agregar ejercicio" onPress={() => setRoutine({ ...current, exercises: [...current.exercises, { id: id(), name: '', machine: '', sets: 3 }] })} />
      <Button title="Guardar rutina" primary onPress={() => {
        if (!current.name.trim() || current.exercises.some(x => !x.name.trim())) { setError('Completá los nombres de la rutina y sus ejercicios.'); return; }
        if (!existing && !current.exercises.length) { setError('Agregá al menos un ejercicio.'); return; }
        setData({ ...data!, routines: existing ? routines.map(x => x.id === current.id ? current : x) : [...routines, current] });
        setRoutine(null);
        setError('');
      }} />
      <Button title="Cancelar" onPress={() => { setRoutine(null); setError(''); }} />
    </>;
  }

  function train() {
    if (routine) return editRoutine(routine);
    if (active) return sessionForm(active);
    return <>
      <Heading title="Mi gimnasio" subtitle="Tus rutinas, tu ritmo." />
      {fromKey(today).getDate() === 1 && <Card>
        <Text style={s.cardTitle}>Tu resumen mensual</Text>
        <Body>Revisá la constancia y las mejoras del mes pasado.</Body>
        <Button title="Ver resumen" primary onPress={() => { setReportOffset(0); switchTab('Progreso'); }} />
      </Card>}
      <View style={s.hero}>
        <View style={s.between}><Text style={s.heroLabel}>ESTA SEMANA</Text><Ionicons name="flash-outline" size={22} color={C.ink} /></View>
        <View style={s.heroCount}><Text style={s.count}>{gym}<Text style={s.target}> / 4</Text></Text><Text style={s.heroBody}>sesiones de gimnasio</Text></View>
        <View style={s.row}>{[1, 2, 3, 4].map(n => <View key={n} style={[s.track, n <= gym && s.filled]} />)}</View>
        <Text style={s.heroBody}>Básquet · {basket === 0 ? 'Sin registros' : basket + (basket === 1 ? ' sesión' : ' sesiones')}</Text>
      </View>
      <Text style={s.section}>Mis rutinas</Text>
      <Button title="+ Nueva rutina" onPress={() => { setError(''); setRoutine({ id: id(), name: '', exercises: [] }); }} />
      {routines.map(x => <Card key={x.id}><View style={s.between}>
        <View style={s.row}><View style={s.iconBox}><Ionicons name="barbell-outline" size={24} color={C.lime} /></View>
          <View><Text style={s.cardTitle}>{x.name}</Text><Body>{x.exercises.length ? x.exercises.length + ' ejercicios' : 'Sin ejercicios'}</Body></View></View>
      </View><View style={s.wrap}><Button title="Editar" onPress={() => setRoutine(x)} />
        {x.exercises.length > 0 && <Button title="Comenzar entrenamiento" primary onPress={() => setData({ ...data!, draft: makeSession(data!, x) })} />}</View></Card>)}
      <Button title="+ Registrar básquet" onPress={() => setData({ ...data!, draft: makeSession(data!) })} />
    </>;
  }

  function calendar() {
    if (selectedSession) return sessionForm(selectedSession);
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const rows = Math.ceil((offset + days) / 7);
    return <>
      <Heading title="Calendario" subtitle="Tu constancia, mes a mes." />
      <Card>
        <View style={s.between}>
          <Button title="‹" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
          <Text style={[s.cardTitle, { textTransform: 'capitalize' }]}>{month.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</Text>
          <Button title="›" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
        </View>
        <View style={s.calendarRow}>{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(x => <Text style={[s.label, s.cell]} key={x}>{x}</Text>)}</View>
        {Array.from({ length: rows }, (_, r) => <View style={s.calendarRow} key={r}>
          {Array.from({ length: 7 }, (_, c) => {
            const n = r * 7 + c - offset + 1;
            if (n < 1 || n > days) return <View style={s.cell} key={c} />;
            const key = dateKey(new Date(month.getFullYear(), month.getMonth(), n));
            const entries = sessions.filter(x => x.day === key);
            return <Pressable accessibilityRole="button" accessibilityLabel={formatDate(key)} accessibilityState={{ selected: day === key }} key={c} onPress={() => setDay(key)} style={[s.cell, s.date, day === key && s.selectedDate]}>
              <Text style={[s.dateText, key === today && { color: C.lime }]}>{n}</Text>
              <View style={s.dots}>{entries.some(x => x.kind === 'gym') && <View style={s.dot} />}{entries.some(x => x.kind === 'basket') && <View style={[s.dot, { backgroundColor: C.purple }]} />}</View>
            </Pressable>;
          })}
        </View>)}
        <View style={s.wrap}><View style={s.dot} /><Body>Gimnasio</Body><View style={[s.dot, { backgroundColor: C.purple }]} /><Body>Básquet</Body></View>
      </Card>
      <Text style={s.section}>{formatDate(day)}</Text>
      {!sessions.some(x => x.day === day) && <Body>Sin sesiones registradas.</Body>}
      {sessions.filter(x => x.day === day).map(x => <Card key={x.id}>
        <Text style={s.cardTitle}>{x.name}</Text>
        <Body>{[x.kind === 'gym' && x.sets.length + ' series', x.calories && x.calories + ' kcal activas', x.effort].filter(Boolean).join(' · ') || 'Sesión registrada'}</Body>
        <Button title="Ver y editar" onPress={() => setSelectedSession(x)} />
      </Card>)}
    </>;
  }

  function monthly() {
    const latest = closedMonth();
    const month = new Date(latest.getFullYear(), latest.getMonth() - reportOffset, 1);
    const report = monthlyReport(data!, month);
    const title = month.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    return <Card>
      <Label>Resumen mensual</Label>
      <View style={s.between}>
        <Button title="‹" onPress={() => setReportOffset(reportOffset + 1)} />
        <Text style={[s.cardTitle, { textTransform: 'capitalize' }]}>{title}</Text>
        {reportOffset > 0 ? <Button title="›" onPress={() => setReportOffset(reportOffset - 1)} /> : <View style={{ width: 34 }} />}
      </View>
      <Body>Gimnasio · {report.gym}   |   Básquet · {report.basket}</Body>
      <Label>Mejoras frente al mes anterior</Label>
      {report.improvements.map(item => <View key={item.exerciseId} style={s.measure}>
        <Text style={s.cardTitle}>{item.name}</Text><Body>{item.detail}</Body>
      </View>)}
      {!report.improvements.length && <Body>{report.comparable ? 'No se registraron mejoras comparables de peso o repeticiones.' : 'La comparación aparece cuando registrás un mismo ejercicio en los dos meses.'}</Body>}
      {!!report.measureChanges.length && <>
        <Label>Cambio en medidas</Label>
        {report.measureChanges.map(item => <Body key={item.name}>{item.name} · {item.change > 0 ? '+' : ''}{item.change} {item.unit}</Body>)}
      </>}
    </Card>;
  }

  function progress() {
    const exercises = Array.from(new Map(sessions.flatMap(x => x.sets.map(row => [row.exercise.id, row.exercise] as const))).values());
    const chosen = exerciseId || exercises[0]?.id;
    const history = sessions.flatMap(x => {
      const sets = x.sets.filter(row => row.exercise.id === chosen);
      return sets.length ? [{ session: x, sets, peak: Math.max(...sets.map(row => number(row.kg))) }] : [];
    });
    const weeks = Array.from(new Set(history.map(x => weekStart(fromKey(x.session.day)))));
    const max = Math.max(1, ...history.map(x => x.peak));
    return <>
      <Heading title="Progreso" subtitle="Compará tu rendimiento por semana y por mes." />
      {monthly()}
      <Text style={s.section}>Por ejercicio</Text>
      {!exercises.length && <Card><Body>El progreso aparece después de registrar tu primera sesión de gimnasio.</Body></Card>}
      <View style={s.wrap}>{exercises.map(x => <Button key={x.id} title={x.name} primary={chosen === x.id} onPress={() => setExerciseId(x.id)} />)}</View>
      {weeks.map(w => {
        const entries = history.filter(x => weekStart(fromKey(x.session.day)) === w);
        const peak = Math.max(...entries.map(x => x.peak));
        return <Card key={w}><View style={s.between}><Text style={s.cardTitle}>Semana del {formatDate(w)}</Text><Label>{peak} kg máx.</Label></View>
          <View style={s.bar}><View style={[s.barFill, { width: percent(peak / max) }]} /></View>
          {entries.map(({ session, sets }) => <Body key={session.id}>{formatDate(session.day)} · {sets.map(x => x.kg + ' kg × ' + x.reps).join(' / ')}</Body>)}
        </Card>;
      })}
    </>;
  }

  function measurements() {
    const names = Array.from(new Set(['Peso', 'Cintura', 'Pecho', 'Cadera', 'Brazo', 'Muslo', ...measures.map(x => x.name)]));
    const list = measures.filter(x => x.name === measureName).sort((a, b) => b.day.localeCompare(a.day));
    const delta = list.length > 1 ? Number((list[0].value - list[1].value).toFixed(2)) : null;
    const unit = measureName === 'Peso' ? 'kg' : 'cm';
    const max = Math.max(1, ...list.map(x => x.value));
    return <>
      <Heading title="Medidas" subtitle="Registrá tus cambios a lo largo del tiempo." />
      <View style={s.wrap}>{names.map(x => <Button key={x} title={x} primary={x === measureName} onPress={() => { setMeasureName(x); setMeasureValue(''); setError(''); }} />)}</View>
      <Card><Text style={s.cardTitle}>{measureName}</Text>
        <Field placeholder="Fecha (AAAA-MM-DD)" value={measureDay} onChangeText={setMeasureDay} />
        <Field placeholder={'Valor en ' + unit} value={measureValue} numeric onChangeText={setMeasureValue} />
        <Button title="Guardar medida" primary onPress={() => {
          const value = number(measureValue);
          const parsed = fromKey(measureDay);
          if (!Number.isFinite(value) || value <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(measureDay) || dateKey(parsed) !== measureDay) { setError('Ingresá una fecha válida y una medida mayor a cero.'); return; }
          setData({ ...data!, measures: [{ id: id(), day: measureDay, name: measureName, value, unit }, ...measures] }); setMeasureValue(''); setError('');
        }} /></Card>
      {!!list.length && <Card><Label>Última medición</Label><Text style={s.section}>{list[0].value} {unit}</Text>
        {delta !== null && <Body>{delta > 0 ? '+' : ''}{delta} {unit} desde la medición anterior</Body>}
        {list.map(x => <View key={x.id} style={s.measure}><View style={s.between}><Body>{formatDate(x.day)}</Body><Body>{x.value} {x.unit}</Body></View><View style={s.bar}><View style={[s.barFill, { width: percent(x.value / max) }]} /></View></View>)}
      </Card>}
    </>;
  }

  function ai() {
    return <>
      <Heading title="IA" subtitle="Consultá tu historial cuando quieras." />
      <Card><View style={s.iconBox}><Ionicons name="sparkles-outline" size={24} color={C.lime} /></View>
        <Text style={s.cardTitle}>Chat pendiente de conexión</Text>
        <Body>La conexión a un modelo se agrega en una próxima etapa. Mientras tanto podés revisar los datos de tu cuenta local en las otras solapas.</Body>
      </Card>
    </>;
  }

  const pendingSets = draft?.sets.filter(set => !set.done).length ?? 0;
  const confirmationSession = confirmation === 'delete' ? selectedSession : draft;
  const confirmationTitle = confirmation === 'delete' ? '¿Eliminar entrenamiento?' : confirmation === 'discard' ? '¿Descartar sesión?' : '¿Finalizar entrenamiento?';
  const confirmLabel = confirmation === 'delete' ? 'Sí, eliminar' : confirmation === 'discard' ? 'Sí, descartar' : 'Sí, finalizar';
  return <SafeAreaView style={s.safe}>
    {confirmationSession && confirmation && <Modal transparent animationType="fade" onRequestClose={() => setConfirmation(null)}>
      <View style={s.modalOverlay} accessibilityViewIsModal>
        <View style={s.modalContent}>
          <Card>
            <Text accessibilityRole="header" style={s.cardTitle}>{confirmationTitle}</Text>
            <Body>{confirmation === 'delete'
              ? 'La sesión se eliminará del historial y del progreso.'
              : confirmation === 'discard'
              ? 'Vas a perder las series de esta sesión.'
              : pendingSets > 0
                ? `Quedan ${pendingSets} series sin confirmar. Se guardarán las que ya confirmaste.`
                : 'La sesión quedará guardada en el calendario.'}</Body>
            <Button title={confirmation === 'delete' ? 'Cancelar' : 'Volver a la sesión'} onPress={() => setConfirmation(null)} />
            <Button title={confirmLabel} primary onPress={() => {
              setConfirmation(null);
              if (confirmation === 'delete') {
                setData({ ...data, sessions: sessions.filter(session => session.id !== confirmationSession.id) });
                switchTab('Calendario');
              } else if (confirmation === 'finish') finish(confirmationSession);
              else { setData({ ...data, draft: null }); setWorkoutExerciseId(''); setError(''); }
            }} />
          </Card>
        </View>
      </View>
    </Modal>}
    <View style={s.shell}>
      <ScrollView key={tab} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.brand}><Ionicons name="fitness-outline" size={19} color={C.lime} /><Text style={s.brandText}>GIMNASIO</Text></View>
        {tab === 'Entrenar' ? train() : tab === 'Calendario' ? calendar() : tab === 'Progreso' ? progress() : tab === 'Medidas' ? measurements() : ai()}
        {!!(error || storageError) && <Text accessibilityRole="alert" style={s.error}>{error || storageError}</Text>}
      </ScrollView>
      <View style={s.nav}>{tabs.map(([label, icon]) => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: tab === label }} onPress={() => switchTab(label)} style={s.navItem}>
        <View style={[s.navIcon, tab === label && s.navActive]}><Ionicons name={icon} color={tab === label ? C.ink : C.muted} size={21} /></View>
        <Text style={[s.navText, tab === label && { color: C.lime }]}>{label}</Text>
      </Pressable>)}</View>
    </View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: '#000a', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 420 },
  safe: { flex: 1, backgroundColor: C.bg },
  shell: { flex: 1, width: '100%', maxWidth: 540, alignSelf: 'center' },
  loading: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 18, paddingBottom: 28, gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 7 },
  brandText: { color: C.lime, fontSize: 11, fontWeight: '800', letterSpacing: 2.8 },
  heading: { gap: 4, paddingTop: 4, paddingBottom: 5 },
  title: { color: C.text, fontSize: 43, lineHeight: 49, fontWeight: '900', letterSpacing: -2.3 },
  section: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  label: { color: C.muted, fontSize: 13, fontWeight: '700' },
  body: { color: C.muted, fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: C.card, borderRadius: 20, borderColor: C.line, borderWidth: 1, padding: 15, gap: 10 },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  hero: { backgroundColor: C.lime, borderRadius: 25, padding: 20, gap: 11 },
  heroLabel: { color: C.ink, fontWeight: '900', fontSize: 11, letterSpacing: 2 },
  heroCount: { gap: 1 },
  count: { color: C.ink, fontSize: 60, lineHeight: 62, fontWeight: '900', letterSpacing: -4 },
  target: { color: '#4a5e31', fontSize: 37, letterSpacing: -2 },
  heroBody: { color: C.ink, fontSize: 14, fontWeight: '600' },
  track: { height: 6, flex: 1, borderRadius: 4, backgroundColor: '#aacc5c' },
  filled: { backgroundColor: C.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  iconBox: { width: 43, height: 43, borderRadius: 13, backgroundColor: '#2c3625', alignItems: 'center', justifyContent: 'center' },
  button: { backgroundColor: '#2b332b', borderRadius: 12, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 8 },
  buttonText: { color: C.text, fontWeight: '700', textAlign: 'center' },
  primary: { backgroundColor: C.lime },
  primaryText: { color: C.ink },
  pressed: { opacity: 0.72 },
  input: { minHeight: 46, backgroundColor: C.bg, color: C.text, borderColor: C.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  calendarRow: { flexDirection: 'row', gap: 3 },
  cell: { flex: 1, textAlign: 'center' },
  date: { alignItems: 'center', justifyContent: 'center', height: 42, borderRadius: 10 },
  selectedDate: { backgroundColor: '#394827' },
  dateText: { color: C.text, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 3, height: 8, alignItems: 'flex-end' },
  dot: { backgroundColor: C.lime, width: 5, height: 5, borderRadius: 3 },
  bar: { height: 6, backgroundColor: C.line, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: C.lime, borderRadius: 3 },
  measure: { gap: 4 },
  nav: { flexDirection: 'row', borderTopWidth: 1, borderColor: C.line, paddingTop: 7, paddingBottom: 7, backgroundColor: C.card },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: 3 },
  navIcon: { width: 42, height: 29, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  navActive: { backgroundColor: C.lime },
  navText: { color: C.muted, fontSize: 10, fontWeight: '700' },
  error: { color: '#ffaaa1', fontSize: 14, fontWeight: '700' },
});
