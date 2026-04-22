"use client";

import { useState, useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Slot } from "@radix-ui/react-slot";
import { 
    CheckCircle2, 
    Clock, 
    Settings, 
    ChevronsUpDown,
    XIcon
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ExerciseId } from "@/lib/calorie-utils";

// --- UTILS ---
function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// --- DATA ---
export type Trackable = "weight" | "reps" | "sets" | "time";

export interface Exercise {
    id: ExerciseId;
    name: string;
    description: string;
    trackables: Trackable[];
    defaultSets: number;
    defaultReps?: number;
    defaultWeight?: number;
    defaultTime?: number;
}

const EXERCISES: Exercise[] = [
    { id: "push-ups", name: "Push Ups", description: "Chest, shoulders, triceps.", trackables: ["reps", "sets"], defaultSets: 3, defaultReps: 15 },
    { id: "diamond-push-ups", name: "Diamond Push Ups", description: "Triceps focus.", trackables: ["reps", "sets"], defaultSets: 3, defaultReps: 10 },
    { id: "wide-push-ups", name: "Wide Push Ups", description: "Outer chest focus.", trackables: ["reps", "sets"], defaultSets: 3, defaultReps: 12 },
    { id: "archer-push-ups", name: "Archer Push Ups", description: "Single-arm focus.", trackables: ["reps", "sets"], defaultSets: 3, defaultReps: 8 },
    { id: "decline-push-ups", name: "Decline Push Ups", description: "Upper chest focus.", trackables: ["reps", "sets"], defaultSets: 3, defaultReps: 12 },
    { id: "incline-push-ups", name: "Incline Push Ups", description: "Lower chest focus.", trackables: ["reps", "sets"], defaultSets: 3, defaultReps: 15 },
    { id: "plank", name: "Plank", description: "Core stability.", trackables: ["time", "sets"], defaultSets: 3, defaultTime: 60 },
];

const PROGRAMS: any[] = [
    {
        id: "push-up-only",
        name: "Push Up Only",
        schedule: ["Push Ups", "Variations", "Rest"],
        exercises: {
            "Push Ups": [{ id: "push-ups", sets: 3, reps: 15 }, { id: "plank", sets: 3, time: 60 }],
            "Variations": [{ id: "diamond-push-ups", sets: 3, reps: 10 }, { id: "wide-push-ups", sets: 3, reps: 12 }],
            Rest: [],
        },
    },
];

const DAYS = ["Su", "M", "Tu", "W", "Th", "F", "Sa"] as const;

// --- UI COMPONENTS ---
function Button({ className, variant = "default", size = "default", asChild = false, ...props }: any) {
    const Comp = asChild ? Slot : "button";
    const variantStyles: any = {
        default: "from-primary/85 to-primary text-primary-foreground bg-linear-to-b border border-zinc-950/35 shadow-sm hover:brightness-110 active:brightness-95",
        outline: "bg-white hover:bg-zinc-50 border border-zinc-200 shadow-xs",
        secondary: "bg-primary/10 text-primary hover:bg-primary/20",
        ghost: "hover:bg-accent",
    };
    const sizeStyles: any = {
        default: "h-10 px-5 py-2",
        compact: "h-10 px-4 rounded-md font-bold text-xs",
        icon: "size-10",
        "icon-sm": "size-8",
    };
    return <Comp className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all outline-none", variantStyles[variant], sizeStyles[size], className)} {...props} />;
}

const Card = ({ className, ...props }: any) => <div className={cn("bg-white flex flex-col rounded-2xl border border-border shadow-sm", className)} {...props} />;
const CardContent = ({ className, ...props }: any) => <div className={cn("px-6 py-8 md:px-10 md:py-10", className)} {...props} />;

const Dialog = DialogPrimitive.Root;
const DialogContent = ({ className, title, children, ...props }: any) => (
    <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 animate-in fade-in" />
        <DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white p-6 rounded-xl border z-50", className)} {...props}>
            <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
            {children}
            <DialogPrimitive.Close className="absolute right-4 top-4 opacity-50"><XIcon className="size-4" /></DialogPrimitive.Close>
        </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
);

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverContent = ({ className, ...props }: any) => (
    <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content className={cn("z-50 w-72 bg-white rounded-lg border p-1 shadow-md animate-in zoom-in-95", className)} {...props} />
    </PopoverPrimitive.Portal>
);

// --- SUB-COMPONENTS ---
function ProgramSelector({ selectedProgramId, onSelect }: any) {
    const selected = PROGRAMS.find(p => p.id === selectedProgramId);
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild><Button variant="outline" className="w-full justify-between h-10 px-3 text-xs font-bold">{selected?.name || "Program"}<ChevronsUpDown className="size-4 opacity-30" /></Button></PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)]">
                {PROGRAMS.map(p => <button key={p.id} onClick={() => { onSelect(p.id); setOpen(false); }} className={cn("w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 rounded-md", selectedProgramId === p.id && "bg-zinc-50 font-bold")}>{p.name}</button>)}
            </PopoverContent>
        </Popover>
    );
}

function WorkoutStatusBox({ 
    isRestDay, 
    group,
    target,
    benefit,
    days, 
    today, 
    viewingDayIndex, 
    onDayClick 
}: any) {
    return (
        <div className="flex flex-col gap-4 w-full animate-in fade-in duration-300">
            <div className="h-px border-t border-dashed border-border -mx-10" />
            <div className="grid grid-cols-3 gap-2 px-1">
                {[["Group", group], ["Target", target], ["Benefit", benefit]].map(([lbl, val]) => (
                    <div key={lbl} className="flex flex-col gap-0.5">
                        <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">{lbl}</span>
                        <span className={cn("text-sm font-bold text-zinc-800 truncate", (lbl === "Group" && isRestDay) && "text-primary")}>{val}</span>
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-between gap-1">
                {days.map((day: string, i: number) => (
                    <button key={i} onClick={() => onDayClick(i)} className={cn("flex items-center justify-center size-8 rounded-full text-xs font-bold transition-all", i === viewingDayIndex ? "bg-primary text-white shadow-sm" : i === today ? "text-primary border border-primary/20 bg-primary/5" : "text-zinc-200 hover:text-zinc-400")}>
                        {day.charAt(0)}
                    </button>
                ))}
            </div>
            {isRestDay && <p className="text-[10px] text-center text-zinc-400 font-medium italic mt-0.5">Enjoy your recovery time</p>}
        </div>
    );
}


// --- MAIN CARD ---

const MET_VALUES: Record<ExerciseId, number> = {
    "push-ups": 8.0, "diamond-push-ups": 8.0, "wide-push-ups": 8.0,
    "archer-push-ups": 8.0, "decline-push-ups": 8.0, "incline-push-ups": 8.0, "plank": 3.0,
};

async function playTTSSummary(logs: { name: string; sets: { reps: number }[]; durationSeconds: number; exerciseId: ExerciseId }[]) {
    const weightKg = 70;
    let totalReps = 0;
    let totalCalories = 0;
    const lines: string[] = [];

    for (const log of logs) {
        const reps = log.sets.reduce((s, set) => s + (set.reps || 0), 0);
        const cal = MET_VALUES[log.exerciseId] * weightKg * (log.durationSeconds / 3600);
        totalReps += reps;
        totalCalories += cal;
        lines.push(`${log.name}: ${reps} reps, about ${cal.toFixed(1)} calories`);
    }

    const summary = [
        `Great work! Here's your session summary.`,
        ...lines,
        `Total: ${totalReps} reps and roughly ${totalCalories.toFixed(1)} calories burned.`,
        totalCalories > 80
            ? `That's a solid session. Make sure to eat a good meal with protein to recover.`
            : `Nice effort. Drink some water and rest for at least 30 minutes before your next set.`,
    ].join(" ");

    try {
        const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: summary }),
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play();
    } catch (e) {
        console.error("TTS summary failed", e);
    }
}

export interface WorkoutCardProps {
    today: number;
    mirrorMode?: boolean;
    onMirrorModeChange?: (active: boolean) => void;
    /** Called when a set starts; receives the active exercise id */
    onSessionStart?: (variation: ExerciseId) => void;
    /** Called when the session ends (reset or finished) */
    onSessionEnd?: () => void;
    /** Live rep count from the pose estimator; shown during active session */
    liveRepCount?: number;
    /** Daily volume data for display */
    dailyVolume?: { reps: number; calories: number };
}

export function WorkoutCard({
    today,
    mirrorMode: propMirrorMode,
    onMirrorModeChange,
    onSessionStart,
    onSessionEnd,
    liveRepCount,
    dailyVolume,
}: WorkoutCardProps) {
    const [viewingDayIndex, setViewingDayIndex] = useState(today);
    const [mounted, setMounted] = useState(false);
    const [isSkipDialogOpen, setIsSkipDialogOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isFinishedOpen, setIsFinishedOpen] = useState(false);
    const [selectedProgramId, setSelectedProgramId] = useState("push-up-only");
    const [exerciseIndex, setExerciseIndex] = useState(0);
    const [currentSet, setCurrentSet] = useState(1);
    const [status, setStatus] = useState<any>("idle");
    const [timer, setTimer] = useState(0);
    const [setStartTime, setSetStartTime] = useState<number>(0);
    const [sessionLogs, setSessionLogs] = useState<any[]>([]);
    const [currentExerciseSets, setCurrentExerciseSets] = useState<any[]>([]);
    const [mirrorMode, setMirrorMode] = useState(false);
    const [currentInputs, setCurrentInputs] = useState({ sets: "3", reps: "15", weight: "" });

    useEffect(() => { setMounted(true); const saved = localStorage.getItem("selectedProgramId"); if (saved) setSelectedProgramId(saved); }, []);
    useEffect(() => { if (propMirrorMode !== undefined) setMirrorMode(propMirrorMode); }, [propMirrorMode]);

    // Timer tick — counts up while working, counts down while resting
    useEffect(() => {
        if (status !== "working" && status !== "resting") return;
        const id = setInterval(() => {
            setTimer(prev => {
                if (status === "resting") {
                    if (prev <= 1) { clearInterval(id); return 0; }
                    return prev - 1;
                }
                return prev + 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [status]);

    const program = PROGRAMS.find(p => p.id === selectedProgramId) || PROGRAMS[0];
    const routine = program.schedule[viewingDayIndex % program.schedule.length];
    const exercises = program.exercises[routine] || [];
    const exerciseItem = exercises[exerciseIndex];
    const exercise = EXERCISES.find(e => e.id === (typeof exerciseItem === "string" ? exerciseItem : exerciseItem?.id));
    const isRest = routine === "Rest";

    useEffect(() => {
        if (exercise) {
            setCurrentInputs({
                sets: String((typeof exerciseItem !== "string" ? exerciseItem?.sets : null) ?? exercise.defaultSets),
                reps: String((typeof exerciseItem !== "string" ? exerciseItem?.reps : null) ?? exercise.defaultReps ?? 12),
                weight: ""
            });
        }
    }, [exercise, exerciseItem]);

    const handleStart = () => {
        setStatus("working");
        setTimer(0);
        setSetStartTime(Date.now());
        setMirrorMode(true);
        onMirrorModeChange?.(true);
        // Notify parent of the active exercise variation
        if (exercise) {
            onSessionStart?.(exercise.id as ExerciseId);
        }
    };

    const handleFinishSet = () => {
        const durationSeconds = Math.round((Date.now() - setStartTime) / 1000);
        setCurrentExerciseSets(p => [...p, { reps: parseInt(currentInputs.reps), weight: currentInputs.weight || null, durationSeconds }]);
        setStatus("resting");
        setTimer(60);
    };

    const handleNextSet = () => {
        if (currentSet < parseInt(currentInputs.sets)) {
            setCurrentSet(p => p + 1); setStatus("working"); setTimer(0); setSetStartTime(Date.now());
        } else {
            const completedSets = [...currentExerciseSets];
            const totalDuration = completedSets.reduce((s, set) => s + (set.durationSeconds || 30), 0);
            const newLog = { name: exercise?.name ?? "", exerciseId: exercise?.id as ExerciseId, sets: completedSets, durationSeconds: totalDuration };
            const newLogs = [...sessionLogs, newLog];
            setSessionLogs(newLogs);
            setCurrentSet(1); setCurrentExerciseSets([]);
            if (exerciseIndex < exercises.length - 1) {
                setExerciseIndex(p => p + 1); setStatus("working"); setTimer(0); setSetStartTime(Date.now());
            } else {
                setStatus("finished");
                setIsFinishedOpen(true);
                playTTSSummary(newLogs);
                onSessionEnd?.();
            }
        }
    };

    const handleReset = () => {
        setExerciseIndex(0);
        setCurrentSet(1);
        setCurrentExerciseSets([]);
        setStatus("idle");
        setTimer(0);
        setSessionLogs([]);
        setIsFinishedOpen(false);
        setMirrorMode(false);
        onMirrorModeChange?.(false);
        onSessionEnd?.();
    };

    const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

    if (!mounted) return null;

    const getWorkoutInfo = () => {
        if (isRest) return { group: "Rest", target: "Full Body", benefit: "Recovery" };
        
        const groups: Record<string, string> = {
            "push-ups": "Chest",
            "diamond-push-ups": "Triceps",
            "wide-push-ups": "Outer Chest",
            "archer-push-ups": "Shoulders",
            "decline-push-ups": "Upper Chest",
            "incline-push-ups": "Lower Chest",
            "plank": "Core"
        };

        const group = exercise ? groups[exercise.id] : "Mixed";
        const target = exercise?.id === "plank" ? "Stability" : "Strength";
        const benefit = isRest ? "Recovery" : "Hypertrophy";

        return { group, target, benefit };
    };

    const { group, target, benefit } = getWorkoutInfo();

    // Determine whether to show live rep count from pose estimator
    const isSessionWorking = status === "working";
    const showLiveReps = isSessionWorking && liveRepCount !== undefined;

    return (
        <Card className={cn(
            "w-[350px] md:w-[400px] mx-auto fixed bottom-0 left-1/2 -translate-x-1/2 transition-all overflow-hidden z-20 rounded-b-none border-b-0",
            mirrorMode ? "shadow-2xl" : "shadow-sm"
        )}>

            <CardContent className={cn("space-y-5", status === "working" ? "py-5 px-6 md:px-10" : "py-8 px-6 md:px-10 md:py-10")}>
                <div className="flex gap-2 items-center">
                    <div className="flex-1"><ProgramSelector selectedProgramId={selectedProgramId} onSelect={setSelectedProgramId} /></div>
                    <Button variant="outline" onClick={() => setIsSkipDialogOpen(true)} className="h-10 px-4 text-xs font-bold shrink-0">Rest</Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setIsSettingsOpen(true)} className="rounded-full h-10 w-10 text-zinc-400 hover:text-zinc-700 shrink-0">
                        <Settings className="size-4" />
                    </Button>
                </div>

                {/* Daily volume indicator inside card */}
                {dailyVolume && dailyVolume.reps > 0 && (
                    <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-medium">
                        <span className="font-bold text-zinc-600">{dailyVolume.reps}</span> reps today
                        <span className="opacity-40">·</span>
                        <span className="font-bold text-zinc-600">{dailyVolume.calories.toFixed(0)}</span> kcal
                    </div>
                )}

                {!isRest && exercise && (
                    <div className="space-y-5 animate-in slide-in-from-bottom-2 duration-300">
                        {/* Row 1: exercise number + name/timer + Start/Skip button */}
                        <div className="flex items-center gap-4">
                            <span className="text-5xl font-black text-zinc-100 leading-none tabular-nums select-none">{exerciseIndex + 1}</span>
                            <div className="flex flex-col gap-1 flex-1">
                                <div className="flex items-center gap-2">
                                    <p className="font-bold text-lg leading-none tracking-tight">{exercise.name}</p>
                                    <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase">SET {currentSet}/{currentInputs.sets}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                                    <Clock className="size-3.5 opacity-40" />
                                    {status === "resting" ? "Rest" : "Work"}:
                                    <span className="text-zinc-800 tabular-nums">{formatTime(timer)}</span>
                                </div>
                            </div>
                            {status === "idle" && (
                                <Button onClick={handleStart} className="h-10 px-6 rounded-xl font-bold text-sm shadow-sm shrink-0">
                                    Start
                                </Button>
                            )}
                            {(status === "working" || status === "resting") && (
                                <Button
                                    variant="outline"
                                    onClick={status === "working" ? handleFinishSet : handleNextSet}
                                    className="h-10 px-6 rounded-xl font-bold text-sm shrink-0"
                                >
                                    Skip
                                </Button>
                            )}
                        </div>
                        <div className="h-px border-t border-dashed border-border -mx-10" />
                        {/* Row 2: reps/sets inputs + live rep count + Done button */}
                        <div className="flex justify-between items-center gap-4">
                            <div className="flex gap-5">
                                {exercise.trackables.map(t => (
                                    <div key={t} className="flex flex-col gap-0.5">
                                        <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-widest">{t}</span>
                                        <div className="flex items-baseline gap-0.5">
                                            <input type="number" value={t === "sets" ? currentInputs.sets : t === "reps" ? currentInputs.reps : currentInputs.weight} onChange={(e) => setCurrentInputs(p => ({ ...p, [t]: e.target.value }))} className="w-8 text-sm font-black bg-transparent focus:outline-none focus:text-primary transition-colors" />
                                            {t === "weight" && <span className="text-[9px] font-bold opacity-30 uppercase">LB</span>}
                                        </div>
                                    </div>
                                ))}
                                {/* Live rep count from pose estimator */}
                                {showLiveReps && (
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[9px] font-extrabold text-primary uppercase tracking-widest">Live</span>
                                        <div className="flex items-baseline gap-0.5">
                                            <span className="text-sm font-black text-primary tabular-nums">{liveRepCount}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {status === "working" && (
                                <Button onClick={handleFinishSet} className="h-10 px-8 rounded-xl font-bold text-sm shadow-sm">
                                    Done
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {(status === "idle" || status === "resting") && (
                    <WorkoutStatusBox 
                        isRestDay={isRest} 
                        group={group}
                        target={target}
                        benefit={benefit}
                        days={DAYS} 
                        today={today} 
                        viewingDayIndex={viewingDayIndex} 
                        onDayClick={(i: number) => { setViewingDayIndex(i); handleReset(); }} 
                    />
                )}
            </CardContent>

            {/* Skip workout dialog */}
            <Dialog open={isSkipDialogOpen} onOpenChange={setIsSkipDialogOpen}>
                <DialogContent title="Take a Rest Day">
                    <h2 className="text-lg font-bold">Take a Rest Day?</h2>
                    <div className="flex gap-2 mt-4">
                        <Button variant="outline" onClick={() => setIsSkipDialogOpen(false)} className="h-11 flex-1">Cancel</Button>
                        <Button onClick={() => { setIsSkipDialogOpen(false); handleReset(); }} className="h-11 flex-1">Confirm</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Settings dialog */}
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                <DialogContent title="Settings">
                    <h2 className="text-lg font-bold">Settings</h2>
                    <div className="flex flex-col gap-4 mt-4 text-sm text-zinc-500">
                        <p>Program settings and preferences will appear here.</p>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Finished dialog */}
            <Dialog open={isFinishedOpen} onOpenChange={(open) => { if (!open) handleReset(); }}>
                <DialogContent title="Workout Complete">
                    <div className="flex flex-col items-center gap-4 py-2">
                        <CheckCircle2 className="size-10 text-primary" />
                        <h2 className="text-xl font-bold">Finished!</h2>
                        <p className="text-xs text-zinc-400 text-center">Your summary is being read out loud via voice.</p>
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
