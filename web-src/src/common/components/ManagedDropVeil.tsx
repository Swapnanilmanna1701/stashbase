import './drop-veil.css';
import { MotionConfig, motion } from 'motion/react';

/** Loaded only during an active import drag; opacity is retained for reduced motion. */
export default function ManagedDropVeil() {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className="drop-veil hot"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12 }}
      >
        Release to import
      </motion.div>
    </MotionConfig>
  );
}
