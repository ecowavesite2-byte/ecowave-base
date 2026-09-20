import LoginForm from "../../_components/LoginForm";

export const metadata = { title: "Sign in" };

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f5f7] p-6 text-ink">
      <div className="w-full max-w-[400px] rounded-xl border border-line bg-white p-8 shadow-sm">
        <div className="mb-7 text-center">
          <div className="text-[24px] font-bold tracking-tight text-ink">
            ECOWAVE<span className="text-accent">.</span>
          </div>
          <p className="mt-1 text-[14px] text-[#6b7280]">Content manager</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
