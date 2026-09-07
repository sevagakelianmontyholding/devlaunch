// Shown while a page loads; mirrors the phone splash so the hand-off is seamless.
export default function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-3">
        <span className="grid size-14 place-items-center rounded-2xl bg-[#0f2f2b]">
          <svg viewBox="0 0 64 64" className="size-10" aria-hidden="true">
            <path d="M20 44 L32 16 L44 44" fill="none" stroke="#2dd4bf" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M25 36 H39" stroke="#2dd4bf" strokeWidth="6" strokeLinecap="round" />
          </svg>
        </span>
        <span className="text-[13px] font-semibold tracking-tight">DevLaunch</span>
        <span className="h-0.5 w-16 overflow-hidden rounded-full bg-line">
          <span className="block h-full w-1/2 animate-[slide_1.1s_ease-in-out_infinite] rounded-full bg-accent" />
        </span>
      </div>
    </div>
  );
}
