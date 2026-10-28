import { Suspense } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { SignupForm } from "@/components/AuthForms";

export const metadata = {
  title: "Create your free account",
  description: "Sign up for FocusLink AI: free webcam focus tracking, an AI speech coach and fatigue prediction.",
  alternates: { canonical: "/signup" },
};

export default function SignupPage() {
  return (
    <AuthLayout>
      <Suspense>
        <SignupForm />
      </Suspense>
    </AuthLayout>
  );
}
