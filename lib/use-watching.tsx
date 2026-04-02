"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

/**
 * Interface defining the shared state and actions for the watching status.
 */
interface WatchingContextType {
  isWatching: boolean;
  setIsWatching: (value: boolean) => void;
  isMinimized: boolean;
  setIsMinimized: (value: boolean) => void;
}

/**
 * Context for managing the global scrobble/watching UI state.
 */
const WatchingContext = createContext<WatchingContextType | undefined>(undefined);

/**
 * Provider component that enables watching state sharing across the app.
 * Returns React.ReactNode to ensure compatibility with Next.js layout structures.
 */
export function WatchingProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [isWatching, setIsWatching] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  return (
    <WatchingContext.Provider
      value={{
        isWatching,
        setIsWatching,
        isMinimized,
        setIsMinimized,
      }}
    >
      {children}
    </WatchingContext.Provider>
  );
}

/**
 * Custom hook to access the WatchingContext.
 * @throws Error if used outside of a WatchingProvider.
 */
export function useWatching(): WatchingContextType {
  const context = useContext(WatchingContext);
  if (context === undefined) {
    throw new Error("useWatching must be used within a WatchingProvider");
  }
  return context;
}
