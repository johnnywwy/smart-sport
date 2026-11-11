import type { ReactNode } from "react";
import { AuthBrandPanel } from "../auth-brand-panel/AuthBrandPanel";

type AuthLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
};
export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  return (
    <main className="auth-layout">
      <AuthBrandPanel />
      <section className="auth-main">
        <div className="auth-content">
          <header>
            <h2>{title}</h2>
            <p>{description}</p>
          </header>
          {children}
        </div>
      </section>
    </main>
  );
}
