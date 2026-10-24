import { createContext, useContext } from 'react';

/** App composition supplies the current project's confirmed preference. */
export const MathModeContext = createContext({ folderPath: '', enabled: false });

export function useMathMode(folderPath?: string): boolean {
  const mode = useContext(MathModeContext);
  return (folderPath === undefined || folderPath === mode.folderPath) && mode.enabled;
}
