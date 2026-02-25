/**
 * Refined Minimalist Sparkle Decoration: A beautiful 3-star cluster
 * that pops sequentially with a soft spring bounce.
 */
import { motion } from "framer-motion";

const COLOR = "#FBA943"; // vibrant orange

// A perfect 4-point star path centered perfectly at (12, 12)
const STAR_PATH = "M 12 2 L 13.5 10.5 L 22 12 L 13.5 13.5 L 12 22 L 10.5 13.5 L 2 12 L 10.5 10.5 Z";

export function SparkleDecoration({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <motion.svg
        viewBox="0 0 32 32"
        className="w-full h-full overflow-visible"
        fill="none"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.5 }}
      >
        {/* Main Star (Center) */}
        <motion.path
          d={STAR_PATH}
          fill={COLOR}
          className="origin-[12px_12px]"
          variants={{
            hidden: { scale: 0, opacity: 0, rotate: -45 },
            visible: {
              scale: 1,
              opacity: 1,
              rotate: 0,
              transition: { type: "spring", stiffness: 450, damping: 15, delay: 0.1 }
            }
          }}
        />
        {/* Medium Star (Top Right) */}
        <motion.path
          d={STAR_PATH}
          fill={COLOR}
          className="origin-[12px_12px]"
          variants={{
            hidden: { scale: 0, opacity: 0, rotate: 45, x: 16, y: -4 },
            visible: {
              scale: 0.6,
              opacity: 0.9,
              rotate: 15,
              x: 16,
              y: -4,
              transition: { type: "spring", stiffness: 450, damping: 15, delay: 0.25 }
            }
          }}
        />
        {/* Tiny Star (Bottom Right) */}
        <motion.path
          d={STAR_PATH}
          fill={COLOR}
          className="origin-[12px_12px]"
          variants={{
            hidden: { scale: 0, opacity: 0, rotate: -30, x: 20, y: 14 },
            visible: {
              scale: 0.35,
              opacity: 0.8,
              rotate: -10,
              x: 20,
              y: 14,
              transition: { type: "spring", stiffness: 450, damping: 15, delay: 0.4 }
            }
          }}
        />
      </motion.svg>
    </div>
  );
}
