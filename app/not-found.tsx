import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-[80px] font-bold leading-none text-accent lg:text-[110px]">404</p>
      <h1 className="mt-6 text-[22px] font-semibold text-ink lg:text-[28px]">페이지를 찾을 수 없습니다</h1>
      <p className="mt-3 text-[15px] text-muted">요청하신 페이지가 존재하지 않거나 이동되었습니다.</p>
      <Link href="/" className="mt-8 inline-flex h-12 items-center rounded-full bg-accent px-8 text-[15px] font-semibold text-white transition duration-300 hover:opacity-90">
        홈으로 이동
      </Link>
    </main>
  );
}
