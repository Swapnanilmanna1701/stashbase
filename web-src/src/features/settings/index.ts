/**
 * Public surface of the Settings feature.
 *
 * Both components are always-mounted gates that render nothing until
 * opened and then load their own panel body lazily, so they stay eager
 * exports. `useAppliedAppearance` is the boot-time theme application the
 * shell runs before any panel exists; the apply and subscribe primitives
 * it composes stay internal, because applying appearance is the feature's
 * job and the shell only needs it done.
 */
export { EmbedderRequireKeyGate } from '@/features/settings/components/EmbedderRequireKeyGate';
export { SettingsPortal } from '@/features/settings/components/SettingsModal';
export { useAppliedAppearance } from '@/features/settings/hooks/useAppliedAppearance';
