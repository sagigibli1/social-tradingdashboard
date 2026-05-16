import { copy } from "@/lib/copy";

export function Brand() {
  return (
    <div className="flex items-center gap-2 px-3 h-8 border-l border-[#2A2E39] min-w-[200px]">
      <div className="w-2 h-2 rounded-sm bg-[#F59E0B]" aria-hidden />
      <div className="flex flex-col leading-tight">
        <span className="text-[12px] font-semibold text-[#D1D4DC]">
          {copy.appBrand}
        </span>
        <span className="text-[10px] text-[#787B86]">
          {copy.appBrandSubtitle}
        </span>
      </div>
    </div>
  );
}
