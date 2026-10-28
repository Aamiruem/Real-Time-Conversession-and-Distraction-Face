import { Suspense } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { LoginForm } from "@/components/AuthForms";

export const metadata = {
  title: "Sign in",
  description: "Sign in to FocusLink AI with your password or a one-time code sent to your email or mobile.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <AuthLayout>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
