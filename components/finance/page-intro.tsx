type FinancePageIntroProps = {
  title: string;
  subtitle: string;
};

export function FinancePageIntro({ title, subtitle }: FinancePageIntroProps) {
  return (
    <section className="border-b border-border/60 pb-5">
      <div>
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Pandora Finance
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-[2.15rem]">
          {title}
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">
          {subtitle}
        </p>
      </div>
    </section>
  );
}
