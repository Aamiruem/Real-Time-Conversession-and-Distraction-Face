import { Suspense } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { LoginForm } from "@/components/AuthForms";

export default function LoginPage() {
  return (
    <AuthLayout>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
