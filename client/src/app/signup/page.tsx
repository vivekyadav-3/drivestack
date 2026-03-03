import { SignUp } from "@clerk/nextjs";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <SignUp routing="hash" signInUrl="/login" forceRedirectUrl="/dashboard" />
    </div>
  );
}
