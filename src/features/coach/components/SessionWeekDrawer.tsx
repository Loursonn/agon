import { useState, useRef } from "react";
import { X, Check } from "lucide-react";
import { C } from "@/lib/theme";
import { CoachProgramEditor } from "@/components/coach/CoachProgramEditor";
import type { Session, BlockConfig } from "@/features/shared/types/athlete";

interface Props {
  sessId:          string;
  sessName:        string;
  currentWeek:     number;
  tw:              number;
  dw:              number;
  blockConfig:     BlockConfig;
  exos:            Record<string, unknown[]>;
  setExos:         (v: unknown) => void;
  sessions:        Session[];
  setSessions:     (v: unknown) => void;
  sets:            Record<string, unknown[]>;
  completedSessions: Record<number, string[]>;
  athleteNotes:    Record<string, string>;
  allMethods:      Record<string, unknown>;
  customMethods:   unknown[];
  setCustomMethods: (v: unknown) => void;
  exMeta:          Record<string, unknown>;
  setExMeta:       (v: unknown) => void;
  weekSchedule:    Record<string, unknown>;
  setWeekSchedule: (v: unknown) => void;
  onDayChange?:    (newDay: number) => void;
  onClose:         () => void;
  athleteId?:      string;
}

type Tab = "prev" | "current" | "next";

const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function SessionWeekDrawer({
  sessId, sessName, currentWeek, tw, dw, blockConfig,
  exos, setExos, sessions, setSessions, sets, completedSessions,
  athleteNotes, allMethods, customMethods, setCustomMethods,
  exMeta, setExMeta, weekSchedule, setWeekSchedule, onDayChange, onClose, athleteId,
}: Props) {
  const [tab, setTab] = useState<Tab>("current");
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(sessName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  function confirmRename() {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== sessName) {
      (setSessions as (v: (prev: Session[]) => Session[]) => void)(
        prev => prev.map(s => s.id === sessId ? { ...s, name: trimmed } : s)
      );
    }
    setEditingName(false);
  }

  const sess = sessions.find(s => s.id === sessId);
  const currentDay = sess?.day_of_week ?? null;
  const dayLabel = currentDay != null ? DOW[currentDay] : null;

  const weekForTab: Record<Tab, number> = {
    prev:    Math.max(1, currentWeek - 1),
    current: currentWeek,
    next:    Math.min(tw, currentWeek + 1),
  };

  const tabs: { key: Tab; label: string; disabled?: boolean }[] = [
    { key: "prev",    label: "S-1 (réalisée)",  disabled: currentWeek <= 1 },
    { key: "current", label: "S1 (actuelle)" },
    { key: "next",    label: "S+1 (à venir)",   disabled: currentWeek >= tw },
  ];

  const sharedEditorProps = {
    exos, setExos, sessions, setSessions, athleteNotes, allMethods,
    customMethods, setCustomMethods, blockConfig, exMeta, setExMeta,
    sets, completedSessions, weekSchedule, setWeekSchedule,
    currentWeek,
    hideWeekNav: true,
    lockedSessId: sessId,
    athleteId,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400,
      display: "flex", alignItems: "flex-end",
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}
      />

      {/* Panel */}
      <div style={{
        position: "relative", width: "100%", maxHeight: "92vh",
        background: C.bg, borderRadius: "6px 6px 0 0",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 16px 10px",
          borderBottom: dayPickerOpen ? "none" : "1px solid " + C.brd,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            {editingName ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  ref={nameInputRef}
                  autoFocus
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") confirmRename();
                    else if (e.key === "Escape") { setNameValue(sessName); setEditingName(false); }
                  }}
                  style={{
                    flex: 1, padding: "4px 8px", borderRadius: 7,
                    border: "1px solid " + C.coach, background: C.s2,
                    color: C.tx, fontSize: 15, fontWeight: 800,
                    fontFamily: "inherit", outline: "none",
                  }}
                />
                <button
                  onClick={confirmRename}
                  style={{
                    width: 26, height: 26, borderRadius: 6, border: "none",
                    background: C.acV, color: "#0E0C0A", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}
                ><Check size={13} /></button>
                <button
                  onClick={() => { setNameValue(sessName); setEditingName(false); }}
                  style={{
                    width: 26, height: 26, borderRadius: 6, border: "1px solid " + C.brdL,
                    background: "transparent", color: C.tx3, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}
                ><X size={13} /></button>
              </div>
            ) : (
              <div
                onClick={() => { setNameValue(nameValue); setEditingName(true); }}
                title="Cliquer pour renommer"
                style={{ fontSize: 15, fontWeight: 800, color: C.tx, cursor: "text", display: "inline-block" }}
              >
                {nameValue}
              </div>
            )}
            {dayLabel && (
              <button
                onClick={() => onDayChange && setDayPickerOpen(o => !o)}
                style={{
                  marginTop: 4, padding: "3px 8px", borderRadius: 6,
                  border: "1px solid " + (dayPickerOpen ? C.coach : C.brdL),
                  background: dayPickerOpen ? C.coachS : "transparent",
                  color: dayPickerOpen ? C.coach : C.tx3,
                  fontSize: 10, fontWeight: 600,
                  cursor: onDayChange ? "pointer" : "default",
                  fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}
              >
                {dayLabel}
                {onDayChange && (
                  <span style={{ fontSize: 8, opacity: 0.6 }}>{dayPickerOpen ? "▲" : "▼"}</span>
                )}
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 4,
              border: "1px solid " + C.brdL, background: "transparent",
              color: C.tx3, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Day picker inline */}
        {dayPickerOpen && onDayChange && (
          <div style={{
            padding: "10px 16px 12px",
            borderBottom: "1px solid " + C.brd,
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 10, color: C.tx3, marginBottom: 8 }}>
              Reprogramme toutes les séances à partir d'aujourd'hui
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
              {DOW.map((label, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setDayPickerOpen(false);
                    onDayChange(idx);
                  }}
                  style={{
                    padding: "8px 2px", borderRadius: 4,
                    border: "1px solid " + (currentDay === idx ? C.coach : C.brdL),
                    background: currentDay === idx ? C.coachS : "transparent",
                    color: currentDay === idx ? C.coach : C.tx2,
                    fontSize: 11, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: "flex", borderBottom: "1px solid " + C.brd, flexShrink: 0,
        }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => !t.disabled && setTab(t.key)}
              disabled={t.disabled}
              style={{
                flex: 1, padding: "9px 4px",
                border: "none",
                borderBottom: "2px solid " + (tab === t.key ? C.coach : "transparent"),
                background: "transparent",
                color: t.disabled ? C.tx3 + "60" : tab === t.key ? C.coach : C.tx3,
                fontSize: 10, fontWeight: 600, cursor: t.disabled ? "default" : "pointer",
                fontFamily: "inherit", textTransform: "uppercase" as const, letterSpacing: "0.3px",
                opacity: t.disabled ? 0.4 : 1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* S-1 lecture seule — badge */}
        {tab === "prev" && (
          <div style={{
            margin: "8px 16px 0", padding: "6px 12px", borderRadius: 4,
            background: C.oS, border: "1px solid " + C.o + "40",
            fontSize: 10, color: C.o, fontWeight: 600, flexShrink: 0,
          }}>
            Séance réalisée — vue lecture seule (modifications déconseillées)
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
          <CoachProgramEditor
            {...sharedEditorProps}
            defaultWeek={weekForTab[tab]}
            key={tab}
          />
        </div>
      </div>
    </div>
  );
}
