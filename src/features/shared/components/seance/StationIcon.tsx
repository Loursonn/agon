import { Activity, ArrowRightLeft, Dumbbell, Footprints, PersonStanding, Ship, Snowflake, Target, Truck, Weight } from "lucide-react";
import { C } from "@/lib/theme";

/**
 * Picto et couleur d'un exercice HYROX, d'après le nom du tour. Les couleurs
 * restent dans la famille or / ocre du type de séance HYROX (maquette P40).
 */
const RULES: Array<{ re: RegExp; Icon: typeof Activity; color: string }> = [
  { re: /transition|roxzone/i, Icon: ArrowRightLeft, color: C.tx2 },
  { re: /course|run|footing|jog/i, Icon: Footprints, color: "#FFB54D" },
  { re: /sled ?push/i, Icon: Truck, color: C.o },
  { re: /sled ?pull/i, Icon: Truck, color: C.o },
  { re: /wall ?ball/i, Icon: Target, color: "#FF7A45" },
  { re: /burpee/i, Icon: PersonStanding, color: "#FF7A45" },
  { re: /farmer/i, Icon: Weight, color: C.o },
  { re: /lunge|fente/i, Icon: PersonStanding, color: C.o },
  { re: /ski ?erg/i, Icon: Snowflake, color: "#FFB54D" },
  { re: /rameur|row/i, Icon: Ship, color: "#FFB54D" },
];

export function stationStyle(name: string | null | undefined): { Icon: typeof Activity; color: string } {
  const r = RULES.find((x) => x.re.test(name ?? ""));
  return r ? { Icon: r.Icon, color: r.color } : { Icon: Dumbbell, color: C.o };
}

export function StationIcon({ name, size = 16 }: { name: string | null | undefined; size?: number }) {
  const { Icon, color } = stationStyle(name);
  return <Icon size={size} color={color} strokeWidth={1.8} aria-hidden />;
}
