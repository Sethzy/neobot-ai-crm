/**
 * Context provider for transient chat data stream parts.
 * @module components/chat/data-stream-provider
 */
"use client";

import type React from "react";
import { createContext, useContext, useMemo, useState } from "react";

type DataStreamContextValue = {
  dataStream: unknown[];
  setDataStream: React.Dispatch<React.SetStateAction<unknown[]>>;
};

const DataStreamContext = createContext<DataStreamContextValue | null>(null);

export function DataStreamProvider({ children }: { children: React.ReactNode }) {
  const [dataStream, setDataStream] = useState<unknown[]>([]);

  const value = useMemo(() => ({ dataStream, setDataStream }), [dataStream]);

  return (
    <DataStreamContext.Provider value={value}>
      {children}
    </DataStreamContext.Provider>
  );
}

export function useDataStream(): DataStreamContextValue {
  const context = useContext(DataStreamContext);

  if (!context) {
    throw new Error("useDataStream must be used within a DataStreamProvider");
  }

  return context;
}
