/**
 * Shared icon map for problem/pain-point icons used across landing detail pages.
 * @module data/problem-icons
 */
import {
  TriangleAlertIcon,
  ClockIcon,
  PencilIcon,
  FileXIcon,
  LayersIcon,
  SearchIcon,
} from "lucide-react";

export const problemIconMap = {
  "alert-triangle": TriangleAlertIcon,
  clock: ClockIcon,
  search: SearchIcon,
  "file-x": FileXIcon,
  edit: PencilIcon,
  layers: LayersIcon,
} as const;
