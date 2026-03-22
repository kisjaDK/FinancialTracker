type FinancePageIntroProps = {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
};

export function FinancePageIntro({
  title,
  subtitle,
  actions,
}: FinancePageIntroProps) {
  return (
    <section className="border-b border-border/60 pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Pandora Finance
        </p>
        <div className="sm:hidden">{actions}</div>
      </div>
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2.15rem]">
            {title}
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">
            {subtitle}
          </p>
        </div>
        {actions ? <div className="hidden shrink-0 sm:block">{actions}</div> : null}
      </div>
    </section>
  );
}
