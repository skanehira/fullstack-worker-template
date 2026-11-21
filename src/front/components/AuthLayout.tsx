import type { ReactNode } from "react";

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-xl font-bold">{title}</h1>
      <div className="flex w-72 flex-col gap-3">{children}</div>
    </main>
  );
}

export const inputClass = "border p-2";
export const primaryButtonClass = "bg-black p-2 text-white disabled:opacity-50";
export const secondaryButtonClass = "border p-2 disabled:opacity-50";
