/**
 * Shared icon map for problem/pain-point icons used across landing detail pages.
 * @module data/problem-icons
 */
import {
  TbAlertTriangle,
  TbClock,
  TbEdit,
  TbFileX,
  TbLayersIntersect,
  TbSearch,
} from "react-icons/tb";

export const problemIconMap = {
  "alert-triangle": TbAlertTriangle,
  clock: TbClock,
  search: TbSearch,
  "file-x": TbFileX,
  edit: TbEdit,
  layers: TbLayersIntersect,
} as const;
