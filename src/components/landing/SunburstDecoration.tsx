/** Animated Swoosh: An elegant, stylized underline. */
import { motion } from "framer-motion";

const COLOR = "#FBA943"; // vibrant orange

export function SunburstDecoration({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <motion.svg
        viewBox="0 0 100 20"
        className="w-full h-full overflow-visible"
        fill="none"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.5 }}
      >
        {/* Main elegant swoosh */}
        <motion.path
          d="M -2,12 Q 50,22 102,8"
          stroke={COLOR}
          strokeWidth="3.5"
          strokeLinecap="round"
          variants={{
            hidden: { pathLength: 0, opacity: 0 },
            visible: { 
              pathLength: 1, 
              opacity: 1,
              transition: { 
                pathLength: { duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.2 },
                opacity: { duration: 0.2, delay: 0.2 }
              } 
            }
          }}
        />
        {/* Little accent star/sparkle at the end */}
        <motion.path
          d="M 106,-4 L 108,-10 L 110,-4 L 116,-2 L 110,0 L 108,6 L 106,0 L 100,-2 Z"
          fill={COLOR}
          variants={{
            hidden: { scale: 0, opacity: 0, rotate: -45 },
            visible: { 
              scale: 1, 
              opacity: 1,
              rotate: 0,
              transition: { 
                type: "spring", stiffness: 300, damping: 15, delay: 0.9 
              } 
            }
          }}
        />
      </motion.svg>
    </div>
  );
}
