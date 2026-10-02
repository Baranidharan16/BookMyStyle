"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { LocationProvider } from "./location-context";
import { ThemeProvider, useTheme } from "./theme";
import { ApiError } from "@/lib/api-client";

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster position="top-center" theme={resolved} richColors closeButton toastOptions={{ style: { borderRadius: 14 } }} />;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            refetchOnWindowFocus: true,
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <LocationProvider>
          {children}
          <ThemedToaster />
        </LocationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
